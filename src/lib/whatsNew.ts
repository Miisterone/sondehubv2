import { useSyncExternalStore } from 'react';
import type { Icon3DId } from '@/components/Icon3D';
import type { TKey } from '@/i18n';

export type WhatsNewRun = 'terrain' | 'history' | 'nearby' | 'tour';

export interface WhatsNewItem {
  id: string;
  date: string;
  icon: Icon3DId;
  title: TKey;
  text: TKey;
  action?: { run: WhatsNewRun; label: TKey };
}

export const WHATS_NEW: WhatsNewItem[] = [
  {
    id: 'atmosphere-3d-v2',
    date: '2026-10-15',
    icon: 'ascending',
    title: 'app.whatsNew.atmoV2.title',
    text: 'app.whatsNew.atmoV2.text',
  },
  {
    id: 'm20-glider',
    date: '2026-10-15',
    icon: 'glider-descending',
    title: 'app.whatsNew.glider.title',
    text: 'app.whatsNew.glider.text',
  },
  {
    id: 'terrain',
    date: '2026-10-15',
    icon: 'relief',
    title: 'app.whatsNew.terrain.title',
    text: 'app.whatsNew.terrain.text',
    action: { run: 'terrain', label: 'app.whatsNew.terrain.action' },
  },
  {
    id: 'history',
    date: '2026-10-15',
    icon: 'landing',
    title: 'app.whatsNew.history.title',
    text: 'app.whatsNew.history.text',
    action: { run: 'history', label: 'app.whatsNew.history.action' },
  },
  {
    id: 'nearby-place',
    date: '2026-10-15',
    icon: 'locate',
    title: 'app.whatsNew.nearby.title',
    text: 'app.whatsNew.nearby.text',
    action: { run: 'nearby', label: 'app.whatsNew.nearby.action' },
  },
  {
    id: 'launch-alerts',
    date: '2026-10-15',
    icon: 'launch',
    title: 'app.whatsNew.alerts.title',
    text: 'app.whatsNew.alerts.text',
    action: { run: 'nearby', label: 'app.whatsNew.alerts.action' },
  },
  {
    id: 'guided-tour',
    date: '2026-10-15',
    icon: 'guide',
    title: 'app.whatsNew.tour.title',
    text: 'app.whatsNew.tour.text',
    action: { run: 'tour', label: 'app.whatsNew.tour.action' },
  },
  {
    id: 'languages',
    date: '2026-10-14',
    icon: 'globe',
    title: 'app.whatsNew.languages.title',
    text: 'app.whatsNew.languages.text',
  },
  {
    id: 'atmosphere-3d',
    date: '2026-10-14',
    icon: 'burst',
    title: 'app.whatsNew.atmo3d.title',
    text: 'app.whatsNew.atmo3d.text',
  },
  {
    id: 'replay',
    date: '2026-10-14',
    icon: 'descending',
    title: 'app.whatsNew.replay.title',
    text: 'app.whatsNew.replay.text',
  },
];

const SEEN_KEY = 'sondetrack.whatsNew.v1';
const SETTINGS_KEY = 'sondetrack.settings.v1';
const LATEST = WHATS_NEW[0]?.id ?? '';

interface State {
  seen: string;
  open: boolean;
  fresh: ReadonlySet<string>;
}

function readKey(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}

function initialSeen(): string {
  const stored = readKey(SEEN_KEY);
  if (stored !== null) return stored;
  if (readKey(SETTINGS_KEY) !== null) return '';
  writeKey(SEEN_KEY, LATEST);
  return LATEST;
}

export function unreadIds(seen: string): string[] {
  const i = WHATS_NEW.findIndex((e) => e.id === seen);
  return (i === -1 ? WHATS_NEW : WHATS_NEW.slice(0, i)).map((e) => e.id);
}

let state: State = { seen: initialSeen(), open: false, fresh: new Set() };
const listeners = new Set<() => void>();

function emit(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const getState = () => state;

export function setWhatsNewOpen(open: boolean) {
  if (open === state.open) return;
  if (!open) {
    emit({ ...state, open: false });
    return;
  }
  writeKey(SEEN_KEY, LATEST);
  emit({ seen: LATEST, open: true, fresh: new Set(unreadIds(state.seen)) });
}

export function useWhatsNew(): State {
  return useSyncExternalStore(subscribe, getState, getState);
}

export function groupByDate(items: WhatsNewItem[]): { date: string; items: WhatsNewItem[] }[] {
  const out: { date: string; items: WhatsNewItem[] }[] = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (last?.date === it.date) last.items.push(it);
    else out.push({ date: it.date, items: [it] });
  }
  return out;
}
