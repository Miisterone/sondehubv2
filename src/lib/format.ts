export type Units = 'metric' | 'imperial';

const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export function fmtAlt(m: number | undefined, units: Units): string {
  if (m === undefined || !Number.isFinite(m)) return '—';
  return units === 'metric' ? `${nf0.format(m)} m` : `${nf0.format(m * 3.28084)} ft`;
}

export function fmtAltShort(m: number | undefined, units: Units): string {
  if (m === undefined || !Number.isFinite(m)) return '—';
  if (units === 'imperial') return `${nf0.format(m * 3.28084)} ft`;
  return m >= 1000 ? `${nf1.format(m / 1000)} km` : `${nf0.format(m)} m`;
}

export function fmtVSpeed(ms: number | undefined, units: Units): string {
  if (ms === undefined || !Number.isFinite(ms)) return '—';
  const sign = ms > 0.05 ? '+' : '';
  return units === 'metric' ? `${sign}${nf1.format(ms)} m/s` : `${sign}${nf0.format(ms * 196.85)} ft/min`;
}

export function fmtHSpeed(ms: number | undefined, units: Units): string {
  if (ms === undefined || !Number.isFinite(ms)) return '—';
  return units === 'metric' ? `${nf0.format(ms * 3.6)} km/h` : `${nf0.format(ms * 2.23694)} mph`;
}

export function fmtDist(m: number | undefined, units: Units): string {
  if (m === undefined || !Number.isFinite(m)) return '—';
  if (units === 'imperial') {
    const mi = m / 1609.344;
    return mi < 0.2 ? `${nf0.format(m * 3.28084)} ft` : `${mi < 10 ? nf1.format(mi) : nf0.format(mi)} mi`;
  }
  return m < 1000 ? `${nf0.format(m)} m` : `${m < 10000 ? nf1.format(m / 1000) : nf0.format(m / 1000)} km`;
}

export function fmtTemp(c: number | undefined, units: Units): string {
  if (c === undefined || !Number.isFinite(c) || c < -270) return '—';
  return units === 'metric' ? `${nf1.format(c)} °C` : `${nf1.format(c * 1.8 + 32)} °F`;
}

export function fmtNum(v: number | undefined, suffix = '', digits = 1): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return '—';
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits }).format(v)}${suffix}`;
}

export function fmtCoord(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

/** "il y a 12 s", "il y a 3 min"… */
export function ago(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `il y a ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `il y a ${h} h ${String(m % 60).padStart(2, '0')}`;
  return `il y a ${Math.floor(h / 24)} j`;
}

/** "dans 14 min" / "il y a 3 min" relative to now. */
export function relative(ts: number, now = Date.now()): string {
  if (ts < now) return ago(ts, now);
  const s = Math.round((ts - now) / 1000);
  if (s < 60) return `dans ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `dans ${m} min`;
  return `dans ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

export function fmtDuration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

export function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Search/alert radius (stored in km) in the user's units: "50 km" or "31 mi". */
export function fmtRadius(km: number, units: Units): string {
  return units === 'metric' ? `${km} km` : `${Math.round(km / 1.609344)} mi`;
}
