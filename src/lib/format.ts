import { intlTag, t } from '@/i18n';

export type Units = 'metric' | 'imperial';

const NB = '\u00a0';

const formats = new Map<string, Intl.NumberFormat>();

function numberFormat(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const tag = intlTag();
  const key = `${tag}|${JSON.stringify(options)}`;
  let f = formats.get(key);
  if (!f) {
    f = new Intl.NumberFormat(tag, options);
    formats.set(key, f);
  }
  return f;
}

const nf0 = { format: (v: number) => numberFormat({ maximumFractionDigits: 0 }).format(v) };
const nf1 = { format: (v: number) => numberFormat({ maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(v) };

export function fmtAlt(m: number | undefined, units: Units): string {
  if (m === undefined || !Number.isFinite(m)) return '—';
  return units === 'metric' ? `${nf0.format(m)}${NB}m` : `${nf0.format(m * 3.28084)}${NB}ft`;
}

export function fmtAltShort(m: number | undefined, units: Units): string {
  if (m === undefined || !Number.isFinite(m)) return '—';
  if (units === 'imperial') return `${nf0.format(m * 3.28084)}${NB}ft`;
  return m >= 1000 ? `${nf1.format(m / 1000)}${NB}km` : `${nf0.format(m)}${NB}m`;
}

export function fmtVSpeed(ms: number | undefined, units: Units, signed = true): string {
  if (ms === undefined || !Number.isFinite(ms)) return '—';
  const sign = signed && ms > 0.05 ? '+' : '';
  return units === 'metric' ? `${sign}${nf1.format(ms)}${NB}m/s` : `${sign}${nf0.format(ms * 196.85)}${NB}ft/min`;
}

export function fmtHSpeed(ms: number | undefined, units: Units): string {
  if (ms === undefined || !Number.isFinite(ms)) return '—';
  return units === 'metric' ? `${nf0.format(ms * 3.6)}${NB}km/h` : `${nf0.format(ms * 2.23694)}${NB}mph`;
}

export function fmtDist(m: number | undefined, units: Units): string {
  if (m === undefined || !Number.isFinite(m)) return '—';
  if (units === 'imperial') {
    const mi = m / 1609.344;
    return mi < 0.2 ? `${nf0.format(m * 3.28084)}${NB}ft` : `${mi < 10 ? nf1.format(mi) : nf0.format(mi)}${NB}mi`;
  }
  return m < 1000 ? `${nf0.format(m)}${NB}m` : `${m < 10000 ? nf1.format(m / 1000) : nf0.format(m / 1000)}${NB}km`;
}

export function fmtTemp(c: number | undefined, units: Units): string {
  if (c === undefined || !Number.isFinite(c) || c < -270) return '—';
  return units === 'metric' ? `${nf1.format(c)}${NB}°C` : `${nf1.format(c * 1.8 + 32)}${NB}°F`;
}

export function fmtNum(v: number | undefined, suffix = '', digits = 1): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return '—';
  return `${numberFormat({ maximumFractionDigits: digits }).format(v)}${suffix}`;
}

const nf3 = { format: (v: number) => numberFormat({ minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(v) };

export function fmtFreq(mhz: number | undefined, unit = true): string {
  if (mhz === undefined || !Number.isFinite(mhz) || mhz <= 0) return '—';
  return unit ? `${nf3.format(mhz)}${NB}MHz` : nf3.format(mhz);
}

export function fmtCoord(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

/** "il y a 12 s", "il y a 3 min"… */
export function ago(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return t('lib.time.agoSeconds', { n: s });
  const m = Math.floor(s / 60);
  if (m < 60) return t('lib.time.agoMinutes', { n: m });
  const h = Math.floor(m / 60);
  if (h < 48) return t('lib.time.agoHours', { h, m: String(m % 60).padStart(2, '0') });
  return t('lib.time.agoDays', { n: Math.floor(h / 24) });
}

/** "dans 14 min" / "il y a 3 min" relative to now. */
export function relative(ts: number, now = Date.now()): string {
  if (ts < now) return ago(ts, now);
  const s = Math.round((ts - now) / 1000);
  if (s < 60) return t('lib.time.inSeconds', { n: s });
  const m = Math.round(s / 60);
  if (m < 60) return t('lib.time.inMinutes', { n: m });
  return t('lib.time.inHours', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') });
}

export function fmtDuration(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return t('lib.time.durationMinutes', { n: m });
  return t('lib.time.durationHours', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') });
}

export function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString(intlTag(), { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString(intlTag(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Search/alert radius (stored in km) in the user's units: "50 km" or "31 mi". */
export function fmtRadius(km: number, units: Units): string {
  return units === 'metric' ? `${km}${NB}km` : `${Math.round(km / 1.609344)}${NB}mi`;
}
