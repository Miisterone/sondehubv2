import { useEffect, useMemo, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { buildSonde } from '@/store/useStore';
import { atPressure, buildProfile, type Profile } from '@/lib/atmo';
import { fetchSiteFlights, loadSondeHistory, rememberFlight } from '@/lib/history';
import { fmtAltShort, fmtNum, fmtTemp, type Units } from '@/lib/format';
import { fmtDay, fmtHour } from '@/lib/sonde';
import type { PastFlight } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SkewT } from './SkewT';
import { Stat } from './ui';
import { useT } from '@/i18n';

const NONE = 'none';
const MAX_OPTIONS = 10;
const MIN_TOP_M = 8000;

type Loaded = { serial: string; state: 'loading' | 'error' } | { serial: string; state: 'ok'; profile: Profile };

const cache = new Map<string, Profile | null>();

async function loadProfile(f: PastFlight, signal: AbortSignal): Promise<Profile | null> {
  if (cache.has(f.serial)) return cache.get(f.serial) ?? null;
  rememberFlight(f.serial, f.last.time);
  const loaded = await loadSondeHistory(f.serial, undefined, signal);
  const sonde = buildSonde(loaded?.data[f.serial]);
  const profile = sonde ? buildProfile(sonde) : null;
  cache.set(f.serial, profile);
  return profile;
}

function signed(v: number, text: string): string {
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${text}`;
}

export default function SoundingCompare({ serial, siteId, profile, units, now }: { serial: string; siteId: string | null; profile: Profile; units: Units; now: number }) {
  const t = useT();
  const [flights, setFlights] = useState<PastFlight[]>([]);
  const [choice, setChoice] = useState(NONE);
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    setFlights([]);
    setChoice(NONE);
    if (!siteId) return;
    let alive = true;
    fetchSiteFlights(siteId)
      .then((list) => {
        if (!alive) return;
        setFlights(
          list
            .filter((f) => f.serial !== serial && f.top.alt >= MIN_TOP_M)
            .sort((a, b) => b.first.time - a.first.time)
            .slice(0, MAX_OPTIONS),
        );
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [siteId, serial]);

  useEffect(() => {
    const flight = flights.find((f) => f.serial === choice);
    if (!flight) {
      setLoaded(null);
      return;
    }
    const ctrl = new AbortController();
    setLoaded({ serial: flight.serial, state: 'loading' });
    loadProfile(flight, ctrl.signal)
      .then((p) => {
        if (ctrl.signal.aborted) return;
        setLoaded(p ? { serial: flight.serial, state: 'ok', profile: p } : { serial: flight.serial, state: 'error' });
      })
      .catch(() => !ctrl.signal.aborted && setLoaded({ serial: flight.serial, state: 'error' }));
    return () => ctrl.abort();
  }, [choice, flights]);

  const minute = Math.floor(now / 60_000) * 60_000;
  const label = (f: PastFlight) => t('charts.compare.option', { day: fmtDay(f.first.time, minute), time: fmtHour(f.first.time), serial: f.serial });
  const chosen = flights.find((f) => f.serial === choice);
  const other = loaded?.state === 'ok' && loaded.serial === choice ? loaded.profile : null;
  const compare = useMemo(() => (other && chosen ? { profile: other, label: t('charts.compare.short', { day: fmtDay(chosen.first.time, minute), time: fmtHour(chosen.first.time) }) } : null), [other, chosen, minute, t]);

  const diffs = useMemo(() => {
    if (!other) return null;
    const a = profile.indices;
    const b = other.indices;
    const t500a = atPressure(profile.levels, 500, 't');
    const t500b = atPressure(other.levels, 500, 't');
    const k = units === 'imperial' ? 1.8 : 1;
    const deg = units === 'imperial' ? ' °F' : ' °C';
    const alt = (x: number | null | undefined, y: number | null | undefined) =>
      x != null && y != null ? { value: fmtAltShort(y, units), sub: signed(y - x, fmtAltShort(Math.abs(y - x), units)) } : null;
    return {
      freezing: alt(a.freezing, b.freezing),
      tropopause: alt(a.tropopause?.z, b.tropopause?.z),
      t500:
        t500a !== null && t500b !== null
          ? { value: fmtTemp(t500b, units), sub: signed(t500b - t500a, fmtNum(Math.abs(t500b - t500a) * k, deg, 1)) }
          : null,
    };
  }, [other, profile, units, t]);

  return (
    <div className="space-y-3">
      {flights.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-muted-foreground text-[12.5px]">{t('charts.compare.label')}</div>
          <Select value={choice} onValueChange={setChoice}>
            <SelectTrigger aria-label={t('charts.compare.label')} className="h-9 w-full text-[13px]" data-testid="compare-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t('charts.compare.none')}</SelectItem>
              {flights.map((f) => (
                <SelectItem key={f.serial} value={f.serial}>
                  {label(f)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {loaded?.state === 'loading' && (
            <p className="flex items-center gap-2 text-[12.5px]" role="status">
              <LoaderCircle className="text-faint size-3.5 animate-spin" />
              {t('charts.compare.loading')}
            </p>
          )}
          {loaded?.state === 'error' && <p className="text-[12.5px]">{t('charts.compare.error')}</p>}
        </div>
      )}
      <SkewT profile={profile} units={units} compare={compare} />
      {diffs && (
        <div className="grid grid-cols-3 gap-4 border-t pt-4">
          <Stat label={t('charts.indices.freezingLevel')} value={diffs.freezing?.value ?? '—'} sub={diffs.freezing?.sub} />
          <Stat label={t('charts.indices.tropopause')} value={diffs.tropopause?.value ?? '—'} sub={diffs.tropopause?.sub} />
          <Stat label={t('charts.compare.t500')} value={diffs.t500?.value ?? '—'} sub={diffs.t500?.sub} />
          <p className="col-span-3 text-[12.5px] leading-relaxed">{t('charts.compare.note')}</p>
        </div>
      )}
    </div>
  );
}
