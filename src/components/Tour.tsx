import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Layers, LocateFixed, Maximize2, Megaphone, Moon, Mountain, Rotate3d, Ruler, Search, SlidersHorizontal, Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { cx, MapIcon } from '@/components/ui';
import { Icon3D, type Icon3DId } from '@/components/Icon3D';
import { LanguageSelect } from '@/components/LanguageSelect';
import { getMap } from '@/components/MapView';
import { useStore } from '@/store/useStore';
import { locateUser } from '@/lib/geolocation';
import { usefulPrediction } from '@/lib/filter';
import { distance } from '@/lib/geo';
import { IS_MAC } from '@/lib/platform';
import {
  DETAIL_TAB_EVENT,
  NEARBY_EVENT,
  SHEET_EVENT,
  clampRect,
  collapse,
  easeInOut,
  fromDom,
  holesPath,
  inflate,
  lerpRect,
  mergeHoles,
  placeCard,
  shadePath,
  type DetailTabRequest,
  type Rect,
  type SheetSnap,
  type Side,
} from '@/lib/tour';
import { Trans, useT, type TKey } from '@/i18n';

const SHOW_DELAY_MS = 1000;
const LEAVE_MS = 180;
const MOVE_MS = 360;
const PAD = 6;
const GAP = 12;
const MOBILE_QUERY = '(max-width: 767px)';
const DEMO_MAX_AGE_MS = 10 * 60_000;

const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(hover: none) and (pointer: coarse)').matches;

type StepId = 'welcome' | 'map' | 'lists' | 'search' | 'detail' | 'view3d' | 'controls' | 'news' | 'alerts';

const DEMO_STEPS: ReadonlySet<StepId> = new Set<StepId>(['detail', 'view3d']);

interface Ctx {
  mobile: boolean;
  vw: number;
  vh: number;
  demo: string | null;
}

interface StepDef {
  id: StepId;
  icon: Icon3DId;
  title: TKey;
  sides: Side[];
  targets?: (c: Ctx) => Rect[];
  pad?: number;
  ring?: boolean;
  sheet?: SheetSnap;
  besidePanel?: boolean;
}

function anchors(name: string): Rect[] {
  const out: Rect[] = [];
  document.querySelectorAll(`[data-tour="${name}"]`).forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) out.push(fromDom(r));
  });
  return out;
}

function mapArea({ mobile, vw, vh }: Ctx): Rect[] {
  const panel = anchors('sidebar')[0];
  if (!panel) return [{ x: 0, y: 0, w: vw, h: vh }];
  if (mobile) return [{ x: 0, y: 0, w: vw, h: panel.y }];
  const left = panel.x + panel.w;
  return [{ x: left, y: 0, w: vw - left, h: vh }];
}

function sondeSpot(serial: string | null): Rect[] {
  const map = getMap();
  const s = serial ? useStore.getState().sondes[serial] : undefined;
  if (!map || !s) return [];
  const box = map.getContainer().getBoundingClientRect();
  const p = map.project([s.last.lon, s.last.lat]);
  return [{ x: box.left + p.x - 26, y: box.top + p.y - 26, w: 52, h: 52 }];
}

function view3dSpot(): Rect[] {
  const view = anchors('view3d');
  return view.length ? view : anchors('sidebar');
}

function askDetailTab(detail: DetailTabRequest) {
  window.dispatchEvent(new CustomEvent<DetailTabRequest>(DETAIL_TAB_EVENT, { detail }));
}

function nearbyTab(): Rect[] {
  const el = document.querySelector('[data-tour="lists"] [data-tab="nearby"]');
  if (!el) return [];
  const r = el.getBoundingClientRect();
  return r.width > 0 ? [inflate(fromDom(r), 2)] : [];
}

const STEPS: StepDef[] = [
  { id: 'welcome', icon: 'launch', title: 'app.welcome.title', sides: ['center'] },
  { id: 'map', icon: 'ascending', title: 'app.tour.mapTitle', targets: mapArea, pad: 0, ring: false, sides: ['inside'], sheet: 'peek' },
  { id: 'lists', icon: 'descending', title: 'app.tour.listsTitle', targets: () => anchors('lists'), sides: ['right', 'top', 'bottom'], sheet: 'peek', besidePanel: true },
  {
    id: 'search',
    icon: 'station',
    title: 'app.tour.searchTitle',
    targets: () => [...anchors('search'), ...anchors('map-search')],
    sides: ['right', 'top', 'bottom'],
    sheet: 'peek',
    besidePanel: true,
  },
  {
    id: 'detail',
    icon: 'burst',
    title: 'app.tour.detailTitle',
    targets: (c) => [...anchors('sidebar'), ...(c.mobile ? [] : sondeSpot(c.demo))],
    pad: 0,
    sides: ['right', 'top'],
    sheet: 'half',
  },
  { id: 'view3d', icon: 'relief', title: 'app.tour.view3dTitle', targets: view3dSpot, sides: ['right', 'top'], sheet: 'half', besidePanel: true },
  { id: 'controls', icon: 'landing', title: 'app.tour.controlsTitle', targets: () => anchors('controls'), sides: ['left', 'bottom'], sheet: 'peek' },
  {
    id: 'news',
    icon: 'news',
    title: 'app.tour.newsTitle',
    targets: () => anchors('whats-new'),
    sides: ['right', 'bottom', 'top'],
    sheet: 'peek',
    besidePanel: true,
  },
  { id: 'alerts', icon: 'locate', title: 'app.tour.alertsTitle', targets: nearbyTab, sides: ['right', 'top', 'bottom'], sheet: 'peek', besidePanel: true },
];

function measure(def: StepDef, ctx: Ctx): { anchor: Rect | null; holes: Rect[] } {
  const padded: Rect[] = [];
  for (const r of def.targets?.(ctx) ?? []) {
    const c = clampRect(inflate(r, def.pad ?? PAD), ctx.vw, ctx.vh);
    if (c) padded.push(c);
  }
  let anchor = padded[0] ?? null;
  const panel = def.besidePanel && !ctx.mobile ? anchors('sidebar')[0] : undefined;
  if (anchor && panel) anchor = { ...anchor, w: panel.x + panel.w - anchor.x };
  return { anchor, holes: mergeHoles(padded) };
}

function pickSonde(): string | null {
  const st = useStore.getState();
  const centre = getMap()?.getCenter();
  const now = Date.now();
  let best: { serial: string; score: number } | null = null;
  for (const s of Object.values(st.sondes)) {
    if (s.archived || now - s.lastTime > DEMO_MAX_AGE_MS) continue;
    const phase = s.phase === 'descending' ? 0 : s.phase === 'ascending' ? 1 : s.phase === 'landed' ? 2 : -1;
    if (phase < 0) continue;
    const predicted = usefulPrediction(s, st.predictions[s.serial]) ? 0 : 1;
    const km = centre ? distance(centre.lat, centre.lng, s.last.lat, s.last.lon) / 1000 : 0;
    const score = phase * 1e7 + predicted * 1e6 + Math.min(km, 999_999);
    if (!best || score < best.score) best = { serial: s.serial, score };
  }
  return best?.serial ?? null;
}

function useMedia(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

function Row({ lead, children }: { lead: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="bg-surface text-foreground grid h-7 min-w-7 shrink-0 place-items-center rounded-md border px-1 [&_svg]:size-4">{lead}</span>
      <span className="min-w-0 pt-[3px] leading-snug">{children}</span>
    </li>
  );
}

function Terms({ items }: { items: [string, string][] }) {
  return (
    <dl className="mt-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 leading-snug">
      {items.map(([term, text]) => (
        <div key={term} className="contents">
          <dt className="text-foreground font-semibold whitespace-nowrap">{term}</dt>
          <dd>{text}</dd>
        </div>
      ))}
    </dl>
  );
}

function PredictedPath() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden>
      <path d="M3 15 L17 5" fill="none" stroke="var(--mark-landing)" strokeWidth="2.4" strokeDasharray="3.2 2.6" strokeLinecap="round" />
    </svg>
  );
}

export function Tour() {
  const t = useT();
  const tutorialDone = useStore((s) => s.settings.tutorialDone);
  const loading = useStore((s) => s.loading);
  const selected = useStore((s) => s.selected);
  const mobile = useMedia(MOBILE_QUERY);
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [step, setStep] = useState(0);
  const [withDemo, setWithDemo] = useState(true);
  const [demoSerial, setDemoSerial] = useState<string | null>(null);

  const shadeRef = useRef<SVGPathElement>(null);
  const ringRef = useRef<SVGPathElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const shown = useRef<Rect[]>([]);
  const anim = useRef<{ from: Rect[]; start: number } | null>(null);
  const demo = useRef<string | null>(null);
  const keepDemo = useRef(false);

  useEffect(() => {
    if (ready || loading) return;
    const id = window.setTimeout(() => setReady(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [ready, loading]);

  const visible = ready && !tutorialDone && (started || !selected);
  const steps = withDemo ? STEPS : STEPS.filter((s) => !DEMO_STEPS.has(s.id));
  const index = Math.min(step, steps.length - 1);
  const def = steps[index];
  const last = index === steps.length - 1;
  const onDemo = DEMO_STEPS.has(def.id);

  const defRef = useRef(def);
  const mobileRef = useRef(mobile);
  defRef.current = def;
  mobileRef.current = mobile;

  useEffect(() => {
    if (!visible || started) return;
    const st = useStore.getState();
    st.selectSite(null);
    st.selectListener(null);
    setStarted(true);
    setStep(0);
    setLeaving(false);
    setWithDemo(pickSonde() !== null);
    shown.current = [];
    anim.current = null;
  }, [visible, started]);

  const wasDone = useRef(tutorialDone);
  useEffect(() => {
    if (tutorialDone) setStarted(false);
    else if (wasDone.current) useStore.getState().select(null);
    wasDone.current = tutorialDone;
  }, [tutorialDone]);

  const dismiss = useCallback(() => {
    keepDemo.current = true;
    setLeaving(true);
    window.setTimeout(() => useStore.getState().setSettings({ tutorialDone: true }), LEAVE_MS);
  }, []);

  useEffect(() => {
    if (!visible) return;
    anim.current = { from: shown.current, start: performance.now() };
  }, [visible, def.id]);

  useEffect(() => {
    if (!visible || !mobile || !def.sheet) return;
    window.dispatchEvent(new CustomEvent<SheetSnap>(SHEET_EVENT, { detail: def.sheet }));
  }, [visible, mobile, def.id, def.sheet]);

  useEffect(() => {
    if (!visible || !onDemo) return;
    const serial = pickSonde();
    if (!serial) return;
    const map = getMap();
    const centre = map?.getCenter();
    const zoom = map?.getZoom();
    demo.current = serial;
    keepDemo.current = false;
    setDemoSerial(serial);
    useStore.getState().select(serial, true);
    return () => {
      demo.current = null;
      const st = useStore.getState();
      if (keepDemo.current || st.selected !== serial) return;
      st.select(null);
      if (centre && zoom !== undefined) st.requestFly(centre.lng, centre.lat, zoom);
    };
  }, [visible, onDemo]);

  useEffect(() => {
    if (!visible || def.id !== 'view3d') return;
    askDetailTab({ tab: 'atmosphere', reveal: 'view3d' });
    return () => {
      if (!keepDemo.current) askDetailTab({ tab: null });
    };
  }, [visible, def.id]);

  useEffect(() => {
    if (!visible) return;
    return useStore.subscribe((s, prev) => {
      if (s.selected && s.selected !== prev.selected && s.selected !== demo.current) dismiss();
    });
  }, [visible, dismiss]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('[data-radix-popper-content-wrapper], [role="dialog"][data-state="open"], [role="alertdialog"]')) return;
      e.preventDefault();
      dismiss();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [visible, dismiss]);

  useEffect(() => {
    if (!visible) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let placed = false;
    let lastShade = '';
    let lastRing = '';
    let lastTransform = '';
    let lastMaxHeight = '';
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const d = defRef.current;
      const m = mobileRef.current;
      const { anchor, holes } = measure(d, { mobile: m, vw, vh, demo: demo.current });

      let frame = holes;
      const a = anim.current;
      if (a && !reduce && now - a.start < MOVE_MS) {
        const k = easeInOut(Math.max(0, (now - a.start) / MOVE_MS));
        frame = [];
        for (let i = 0; i < Math.max(a.from.length, holes.length); i++) {
          const to = holes[i] ?? collapse(a.from[i]);
          const from = a.from[i] ?? collapse(to);
          frame.push(lerpRect(from, to, k));
        }
      } else anim.current = null;
      shown.current = frame;

      const shade = shadePath(frame, vw, vh);
      if (shade !== lastShade) {
        shadeRef.current?.setAttribute('d', shade);
        lastShade = shade;
      }
      const ring = d.ring === false ? '' : holesPath(frame);
      if (ring !== lastRing) {
        ringRef.current?.setAttribute('d', ring);
        lastRing = ring;
      }

      const card = cardRef.current;
      const body = bodyRef.current;
      if (!card || !body) return;
      const natural = card.offsetHeight - body.clientHeight + body.scrollHeight;
      const pos = placeCard(anchor, holes, { w: card.offsetWidth, h: natural }, vw, vh, d.sides, m ? 12 : 16, GAP);
      const transform = `translate3d(${Math.round(pos.x)}px, ${Math.round(pos.y)}px, 0)`;
      if (transform !== lastTransform) {
        card.style.transform = transform;
        lastTransform = transform;
      }
      const maxHeight = pos.maxH !== undefined && pos.maxH < natural ? `${Math.floor(pos.maxH)}px` : '';
      if (maxHeight !== lastMaxHeight) {
        card.style.maxHeight = maxHeight;
        lastMaxHeight = maxHeight;
      }
      if (!placed) {
        placed = true;
        card.dataset.placed = '';
        primaryRef.current?.focus({ preventScroll: true });
      } else if (!reduce && card.dataset.animate === undefined) card.dataset.animate = '';
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  if (!visible) return null;

  const go = (n: number) => setStep(Math.max(0, Math.min(steps.length - 1, n)));

  const locate = () => {
    dismiss();
    void locateUser({ fly: true }).then((ok) => {
      if (ok) window.dispatchEvent(new Event(NEARBY_EVENT));
    });
  };

  const onCardKey = (e: ReactKeyboardEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('input, textarea, select, [role="combobox"]')) return;
    if (e.key === 'ArrowRight' && !last) {
      e.preventDefault();
      go(index + 1);
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      go(index - 1);
    }
  };

  const bodies: Record<StepId, () => ReactNode> = {
    welcome: () => (
      <>
        <p>{t('app.welcome.text')}</p>
        <div className="mt-4">
          <span className="text-foreground mb-1.5 block text-[12px] font-semibold">{t('app.tour.languageLabel')}</span>
          <LanguageSelect variant="field" />
        </div>
        <p className="mt-4">{t('app.tour.welcomeOutline', { total: steps.length })}</p>
      </>
    ),
    map: () => (
      <>
        <ul className="space-y-2.5">
          <Row lead={<MapIcon id="sonde-ascending" size={20} />}>{t('app.tour.mapSondes')}</Row>
          <Row lead={<PredictedPath />}>{t('app.tour.mapTrack')}</Row>
          <Row lead={<MapIcon id="landing" size={18} />}>{t('app.tour.mapLanding')}</Row>
        </ul>
        <p className="mt-3">{t(isTouch ? 'app.tour.mapHintTouch' : 'app.tour.mapHintClick')}</p>
      </>
    ),
    lists: () => (
      <>
        <p>{t('app.tour.listsIntro')}</p>
        <Terms
          items={[
            [t('sidebar.tabs.nearby'), t('app.tour.listsNearby')],
            [t('sidebar.tabs.flying'), t('app.tour.listsFlying')],
            [t('sidebar.tabs.following'), t('app.tour.listsFollowing')],
            [t('sidebar.tabs.history'), t('app.tour.listsHistory')],
          ]}
        />
        <p className="mt-3 flex items-start gap-3">
          <Icon3D id="glider-descending" size={32} className="-my-1" />
          <span className="min-w-0 pt-[3px] leading-snug">{t('app.tour.listsGlider')}</span>
        </p>
      </>
    ),
    search: () => (
      <ul className="space-y-2.5">
        <Row lead={<Search />}>{t('app.tour.searchText')}</Row>
        <Row lead={<SlidersHorizontal />}>{t('app.tour.filtersText')}</Row>
        {isTouch ? (
          <Row lead={<Search />}>{t('app.welcome.tipSearchTouch')}</Row>
        ) : (
          <Row lead={<Kbd className="text-foreground h-auto bg-transparent px-0 text-[11.5px] tabular">{IS_MAC ? '⌘K' : t('app.key.ctrlK')}</Kbd>}>
            {t('app.tour.paletteText')}
          </Row>
        )}
      </ul>
    ),
    detail: () => (
      <>
        <p>
          <Trans
            k="app.tour.detailIntro"
            params={{ serial: demoSerial ?? '' }}
            tags={{ b: (c) => <span className="text-foreground tabular font-semibold">{c}</span> }}
          />
        </p>
        <Terms
          items={[
            [t('sonde.tabs.flight'), t('app.tour.detailFlight')],
            [t('sonde.tabs.atmosphere'), t('app.tour.detailAtmosphere')],
            [t('sonde.tabs.technical'), t('app.tour.detailTechnical')],
          ]}
        />
        <ul className="mt-3 space-y-2">
          <Row lead={<Star />}>{t('app.tour.detailFavourite')}</Row>
          <Row lead={<LocateFixed />}>{t('app.tour.detailFollow')}</Row>
        </ul>
      </>
    ),
    view3d: () => (
      <>
        <p>{t('app.tour.view3dIntro', { tab: t('sonde.tabs.atmosphere') })}</p>
        <ul className="mt-3 space-y-2.5">
          <Row lead={<Rotate3d />}>{t('app.tour.view3dRotate')}</Row>
          <Row lead={<Ruler />}>{t('app.tour.view3dViews', { profile: t('atmo3d.view.profile'), top: t('atmo3d.view.top') })}</Row>
          <Row lead={<Maximize2 />}>{t('app.tour.view3dExpand')}</Row>
        </ul>
      </>
    ),
    controls: () => (
      <ul className="space-y-2.5">
        <Row lead={<LocateFixed />}>{t('app.tour.controlsLocate')}</Row>
        <Row lead={<Layers />}>{t('app.tour.controlsLayers')}</Row>
        <Row lead={<Mountain />}>{t('app.tour.controlsTerrain')}</Row>
        <Row lead={<Moon />}>{t('app.tour.controlsTheme')}</Row>
      </ul>
    ),
    news: () => (
      <ul className="space-y-2.5">
        <Row lead={<Megaphone />}>{t('app.tour.newsText')}</Row>
        <Row lead={<span className="bg-primary size-2 rounded-full" />}>{t('app.tour.newsDot')}</Row>
      </ul>
    ),
    alerts: () => <p>{t('app.tour.alertsText', { nearby: t('sidebar.tabs.nearby') })}</p>,
  };

  return (
    <div className={cx('tour pointer-events-none fixed inset-0 z-40', leaving && 'tour-leaving')}>
      <svg className="absolute inset-0 h-full w-full" aria-hidden>
        <path ref={shadeRef} className="tour-shade" fillRule="evenodd" />
        <path ref={ringRef} className="tour-ring" />
      </svg>

      <section
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        onKeyDown={onCardKey}
        className="tour-card bg-background pointer-events-auto fixed top-0 left-0 flex w-[min(400px,calc(100vw-24px))] flex-col rounded-lg border p-4 text-[13px] md:p-5 md:text-[13.5px]"
      >
        <div className="mb-4 flex shrink-0 gap-1" aria-hidden>
          {steps.map((s, i) => (
            <span key={s.id} className={cx('h-1 flex-1 rounded-full transition-colors', i <= index ? 'bg-primary' : 'bg-border')} />
          ))}
        </div>

        <Button
          variant="ghost"
          size="icon"
          aria-label={t('app.welcome.close')}
          onClick={dismiss}
          className="text-muted-foreground hover:text-foreground absolute top-6 right-2 size-8 rounded-md md:top-7 md:right-3"
        >
          <X className="size-4" />
        </Button>

        <div className="flex shrink-0 items-center gap-3 pr-8">
          <Icon3D id={def.icon} size={36} className="shrink-0" />
          <div className="min-w-0">
            <p className="text-faint tabular text-[12px]" aria-live="polite">
              {t('app.tour.step', { current: index + 1, total: steps.length })}
            </p>
            <h2 id="tour-title" className="font-heading text-foreground text-[16px] leading-snug font-semibold md:text-[17px]">
              {t(def.title)}
            </h2>
          </div>
        </div>

        <div ref={bodyRef} id="tour-body" className="scroll-thin -mr-2 mt-3 min-h-0 overflow-y-auto overscroll-contain pr-2">
          <div key={def.id} className="animate-in text-muted-foreground leading-relaxed">
            {bodies[def.id]()}
          </div>
        </div>

        <div className="mt-5 flex shrink-0 flex-wrap items-center justify-end gap-2">
          {index === 0 && (
            <Button variant="ghost" size="sm" onClick={dismiss} className="text-muted-foreground mr-auto -ml-2 rounded-md">
              {t('app.tour.skip')}
            </Button>
          )}
          {index > 0 && (
            <Button variant="ghost" size="sm" onClick={() => go(index - 1)} className="text-muted-foreground mr-auto -ml-2 rounded-md">
              {t('app.tour.prev')}
            </Button>
          )}
          {last ? (
            <>
              <Button variant="outline" size="sm" onClick={dismiss} className="rounded-md shadow-none">
                {t('app.tour.done')}
              </Button>
              <Button ref={primaryRef} size="sm" onClick={locate} className="rounded-md">
                <LocateFixed />
                {t('app.common.locateMe')}
              </Button>
            </>
          ) : (
            <Button ref={primaryRef} size="sm" onClick={() => go(index + 1)} className="rounded-md">
              {t('app.tour.next')}
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
