import type { Units } from '@/lib/format';
import { intlTag, t } from '@/i18n';

export function altRange(from: number, to: number, units: Units): string {
  const metric = units === 'metric';
  const big = metric ? from >= 1000 && to >= 1000 : true;
  const scale = metric ? (big ? 1000 : 1) : 3.28084;
  const nf = new Intl.NumberFormat(intlTag(), { maximumFractionDigits: metric && big ? 1 : 0 });
  const v = (m: number) => nf.format(metric ? m / scale : m * scale);
  return t('atmo3d.column.cloudRange', { from: v(from), to: v(to), unit: metric ? (big ? 'km' : 'm') : 'ft' });
}

export function altCompact(m: number, units: Units): string {
  if (units === 'imperial') return `${new Intl.NumberFormat(intlTag(), { maximumFractionDigits: 0 }).format(m * 3.28084)} ft`;
  if (m < 1000) return `${new Intl.NumberFormat(intlTag(), { maximumFractionDigits: 0 }).format(m)} m`;
  return `${new Intl.NumberFormat(intlTag(), { maximumFractionDigits: 1 }).format(m / 1000)} km`;
}
