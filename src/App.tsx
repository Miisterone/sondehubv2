import { useEffect, useState } from 'react';
import { MapView, parseHash } from './components/MapView';
import { Sidebar } from './components/Sidebar';
import { MapControls } from './components/MapControls';
import { AboutModal } from './components/AboutModal';
import { CommandPalette } from './components/CommandPalette';
import { Notifiers } from './components/Notifiers';
import { Tour } from './components/Tour';
import { Glossary } from './components/Glossary';
import { PickBanner } from './components/WatchPointPicker';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { useStore } from './store/useStore';
import { fetchListeners, fetchPredictions, fetchRecoveries, fetchReverse, fetchSites, fetchTelemetry } from './lib/api';
import { loadSondeHistory } from './lib/history';
import { startLiveFeed } from './lib/live';
import { siteLabel } from './lib/sonde';
import { t, useLocale } from './i18n';

const PREDICTIONS_REFRESH_MS = 60_000;
const DEEP_LINK = (() => {
  const hash = parseHash();
  return { serial: hash.get('s'), site: hash.get('site'), at: Number(hash.get('t')) };
})();

function loadSelected(serial: string, signal: AbortSignal) {
  loadSondeHistory(serial, useStore.getState().sondes[serial], signal)
    .then((r) => {
      if (signal.aborted) return;
      const st = useStore.getState();
      if (r) st.mergeHistory(serial, r.data, r.archived);
      else if (!st.sondes[serial] && st.selected === serial) st.setMissing(serial);
    })
    .catch(() => {
      const st = useStore.getState();
      if (!signal.aborted && !st.sondes[serial] && st.selected === serial) st.setMissing(serial);
    });
}

export default function App() {
  const theme = useStore((s) => s.settings.theme);
  const duration = useStore((s) => s.settings.duration);
  const selected = useStore((s) => s.selected);
  const selectedSite = useStore((s) => s.selectedSite);
  const sitesReady = useStore((s) => s.sites.length > 0);
  const showRecoveries = useStore((s) => s.settings.layers.recoveries);
  const [about, setAbout] = useState(false);
  const locale = useLocale();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // Telemetry history for the chosen period; reloaded when the period changes or the tab wakes up.
  useEffect(() => {
    const ctrl = new AbortController();
    const load = () => {
      const st = useStore.getState();
      st.setLoading(true);
      fetchTelemetry(duration, ctrl.signal)
        .then((data) => {
          st.loadTelemetry(data, true);
          st.setLoading(false);
          // Re-fetch the full history of the selected sonde, which the reload just replaced.
          const sel = useStore.getState().selected;
          if (sel && !useStore.getState().sondes[sel]?.archived) loadSelected(sel, ctrl.signal);
        })
        .catch((e) => {
          if (ctrl.signal.aborted) return;
          st.setLoading(false, t('app.loadError', { message: (e as Error).message }));
        });
      fetchReverse(duration, ctrl.signal)
        .then((r) => useStore.getState().setReverse(r, true))
        .catch(() => {});
    };
    load();
    let hiddenAt = 0;
    const onVis = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 30_000) load();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      ctrl.abort();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [duration]);

  // Static-ish layers + live feed.
  useEffect(() => {
    const ctrl = new AbortController();
    const st = useStore.getState();
    fetchSites(ctrl.signal).then(st.setSites).catch(() => {});
    fetchListeners(ctrl.signal).then(st.setListeners).catch(() => {});
    const loadPreds = () =>
      fetchPredictions(ctrl.signal)
        .then((p) => useStore.getState().setPredictions(p, true))
        .catch(() => {});
    loadPreds();
    const predTimer = window.setInterval(loadPreds, PREDICTIONS_REFRESH_MS);
    const tick = window.setInterval(() => useStore.getState().tick(), 5000);
    const stop = startLiveFeed();
    return () => {
      ctrl.abort();
      window.clearInterval(predTimer);
      window.clearInterval(tick);
      stop();
    };
  }, []);

  useEffect(() => {
    if (!showRecoveries) return;
    const ctrl = new AbortController();
    fetchRecoveries(ctrl.signal)
      .then((r) => useStore.getState().setRecoveries(r, true))
      .catch(() => {});
    return () => ctrl.abort();
  }, [showRecoveries]);

  // Deep links: #s=SERIAL selects a sonde (&t=EPOCH opens its replay at that instant), #site=ID opens a launch site.
  useEffect(() => {
    const { serial, site, at } = DEEP_LINK;
    if (serial) {
      useStore.getState().select(serial);
      let flown = false;
      let placed = !(at > 0);
      const unsub = useStore.subscribe((s) => {
        const sonde = s.sondes[serial];
        if (!sonde) return;
        if (!flown) {
          flown = true;
          s.requestFly(sonde.last.lon, sonde.last.lat, 10);
        }
        if (!placed && sonde.detailed && s.selected === serial) {
          placed = true;
          const first = sonde.track[0][3] / 1000;
          s.setReplay({ serial, t: Math.min(sonde.lastTime / 1000, Math.max(first, at)), playing: false, speed: 300 });
        }
        if (placed) unsub();
      });
      return unsub;
    }
    if (site) {
      let done = false;
      const open = (s: ReturnType<typeof useStore.getState>) => {
        if (done || !s.sites.some((x) => x.id === site)) return;
        done = true;
        unsub();
        s.selectSite(site, true);
      };
      const unsub = useStore.subscribe(open);
      open(useStore.getState());
      return unsub;
    }
  }, []);

  // Selection side effects: full-resolution history + URL.
  useEffect(() => {
    const p = parseHash();
    p.delete('t');
    if (selected) p.set('s', selected);
    else p.delete('s');
    if (selectedSite) p.set('site', selectedSite);
    else if (sitesReady || selected) p.delete('site');
    history.replaceState(null, '', `#${p.toString().replace(/%2C/g, ',')}`);
    if (selectedSite) {
      const name = useStore.getState().sites.find((x) => x.id === selectedSite)?.name;
      if (name) document.title = t('app.siteTitle', { site: siteLabel(name) });
      return () => {
        document.title = t('app.title');
      };
    }
    if (!selected) return;
    document.title = t('app.sondeTitle', { serial: selected });
    const ctrl = new AbortController();
    if (!useStore.getState().sondes[selected]?.detailed) loadSelected(selected, ctrl.signal);
    return () => {
      ctrl.abort();
      document.title = t('app.title');
    };
  }, [selected, selectedSite, sitesReady, locale]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Radix menus/dialogs/tooltips mark the Escape they consume as handled: don't also close the panel.
      if (e.defaultPrevented) return;
      if ((e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable="true"]') || e.metaKey || e.ctrlKey) return;
      const st = useStore.getState();
      if (e.key === 'Escape' && st.selected) st.select(null);
      else if (e.key === 'Escape' && st.selectedSite) st.selectSite(null);
      else if (e.key === 'Escape' && st.selectedListener) st.selectListener(null);
      if ((e.key === 'f' || e.key === 'F') && st.selected) st.setFollow(!st.follow);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="relative h-full w-full overflow-hidden">
        <MapView />
        <div className="pointer-events-none absolute inset-0">
          <Sidebar onAbout={() => setAbout(true)} />
          <MapControls />
          <PickBanner />
        </div>
        {about && <AboutModal onClose={() => setAbout(false)} />}
        <CommandPalette onAbout={() => setAbout(true)} />
        <Notifiers />
        <Tour />
        <Glossary />
        <Toaster position="bottom-center" closeButton />
      </div>
    </TooltipProvider>
  );
}
