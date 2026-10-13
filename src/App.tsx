import { useEffect, useState } from 'react';
import { MapView, parseHash } from './components/MapView';
import { Sidebar } from './components/Sidebar';
import { MapControls } from './components/MapControls';
import { AboutModal } from './components/AboutModal';
import { CommandPalette } from './components/CommandPalette';
import { Notifiers } from './components/Notifiers';
import { WelcomeCard } from './components/WelcomeCard';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { useStore } from './store/useStore';
import { fetchListeners, fetchPredictions, fetchRecoveries, fetchSites, fetchSondeHistory, fetchTelemetry } from './lib/api';
import { startLiveFeed } from './lib/live';

const PREDICTIONS_REFRESH_MS = 60_000;

export default function App() {
  const theme = useStore((s) => s.settings.theme);
  const duration = useStore((s) => s.settings.duration);
  const selected = useStore((s) => s.selected);
  const showRecoveries = useStore((s) => s.settings.layers.recoveries);
  const [about, setAbout] = useState(false);

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
          if (sel) fetchSondeHistory(sel, ctrl.signal).then((d) => useStore.getState().mergeHistory(sel, d)).catch(() => {});
        })
        .catch((e) => {
          if (ctrl.signal.aborted) return;
          st.setLoading(false, `Impossible de charger les sondes : ${(e as Error).message}`);
        });
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

  // Deep link: #s=SERIAL selects a sonde on load.
  useEffect(() => {
    const serial = parseHash().get('s');
    if (serial) {
      useStore.getState().select(serial);
      const unsub = useStore.subscribe((s) => {
        const sonde = s.sondes[serial];
        if (sonde) {
          s.requestFly(sonde.last.lon, sonde.last.lat, 10);
          unsub();
        }
      });
      return unsub;
    }
  }, []);

  // Selection side effects: full-resolution history + URL.
  useEffect(() => {
    const p = parseHash();
    if (selected) p.set('s', selected);
    else p.delete('s');
    history.replaceState(null, '', `#${p.toString().replace(/%2C/g, ',')}`);
    if (!selected) return;
    document.title = `${selected} — SondeTrack`;
    const ctrl = new AbortController();
    if (!useStore.getState().sondes[selected]?.detailed) {
      fetchSondeHistory(selected, ctrl.signal)
        .then((d) => useStore.getState().mergeHistory(selected, d))
        .catch(() => {});
    }
    return () => {
      ctrl.abort();
      document.title = 'SondeTrack — Radiosondes en temps réel';
    };
  }, [selected]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Radix menus/dialogs/tooltips mark the Escape they consume as handled: don't also close the panel.
      if (e.defaultPrevented) return;
      if ((e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable="true"]') || e.metaKey || e.ctrlKey) return;
      const st = useStore.getState();
      if (e.key === 'Escape' && st.selected) st.select(null);
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
        </div>
        {about && <AboutModal onClose={() => setAbout(false)} />}
        <CommandPalette onAbout={() => setAbout(true)} />
        <Notifiers />
        <WelcomeCard />
        <Toaster position="bottom-center" richColors closeButton />
      </div>
    </TooltipProvider>
  );
}
