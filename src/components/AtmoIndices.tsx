import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Profile } from '@/lib/atmo';
import { fmtAltShort, fmtHSpeed, fmtNum, fmtTemp, type Units } from '@/lib/format';
import { HelpHint } from './HelpHint';
import { Stat, cx } from './ui';
import { Button } from '@/components/ui/button';
import { t, useT } from '@/i18n';

const n0 = (v: number | null, suffix = '') => (v === null || !Number.isFinite(v) ? '—' : fmtNum(v, suffix, 0));
const n1 = (v: number | null, suffix = '') => (v === null || !Number.isFinite(v) ? '—' : fmtNum(v, suffix, 1));

function capeText(cape: number | null): string | undefined {
  if (cape === null) return undefined;
  if (cape < 100) return t('charts.indices.capeStable');
  if (cape < 1000) return t('charts.indices.capeWeak');
  if (cape < 2500) return t('charts.indices.capeModerate');
  return t('charts.indices.capeStrong');
}

function liText(li: number | null): string | undefined {
  if (li === null) return undefined;
  if (li > 2) return t('charts.indices.liStable');
  if (li > -2) return t('charts.indices.liNeutral');
  if (li > -6) return t('charts.indices.liUnstable');
  return t('charts.indices.liVeryUnstable');
}

function kText(k: number | null): string | undefined {
  if (k === null) return undefined;
  if (k < 20) return t('charts.indices.kRare');
  if (k < 30) return t('charts.indices.kIsolated');
  if (k < 35) return t('charts.indices.kScattered');
  return t('charts.indices.kNumerous');
}

export function AtmoIndices({ profile, units }: { profile: Profile; units: Units }) {
  const t = useT();
  const i = profile.indices;
  const sb = i.surfaceBased;
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3 border-t pt-4">
      <h4 className="flex items-center gap-1.5 text-[14px] font-semibold">
        {t('charts.indices.title')}
        <HelpHint title={t('charts.indices.helpTitle')}>{t('charts.indices.help')}</HelpHint>
      </h4>
      <div className="grid grid-cols-3 gap-x-4 gap-y-4">
        <Stat label={t('charts.indices.cape')} value={sb ? n0(i.cape, '\u00a0J/kg') : '—'} sub={sb ? capeText(i.cape) : t('charts.indices.elevatedStart')} />
        <Stat label={t('charts.indices.li')} value={n1(i.li, '\u00a0°C')} sub={liText(i.li)} />
        <Stat label={t('charts.indices.cloudBase')} value={i.lcl ? fmtAltShort(i.lcl.z, units) : '—'} sub={i.lcl ? t('charts.indices.lclPressure', { pressure: n0(i.lcl.p, '\u00a0hPa') }) : undefined} />
        <Stat label={t('charts.indices.freezingLevel')} value={i.freezing !== null ? fmtAltShort(i.freezing, units) : '—'} sub={t('charts.indices.ascending')} />
        <Stat
          label={t('charts.indices.tropopause')}
          value={i.tropopause ? fmtAltShort(i.tropopause.z, units) : '—'}
          sub={i.tropopause ? t('charts.indices.tropopauseSub', { pressure: n0(i.tropopause.p, '\u00a0hPa'), temp: fmtTemp(i.tropopause.t, units) }) : undefined}
        />
        <Stat label={t('charts.indices.shear')} value={i.shear06 !== null ? fmtHSpeed(i.shear06, units) : '—'} sub="0–6 km" />
        {open && (
          <>
            <Stat label={t('charts.indices.cin')} value={sb && i.cin !== null ? n0(i.cin, '\u00a0J/kg') : '—'} sub={sb && i.cape === 0 ? t('charts.indices.none') : undefined} />
            <Stat label={t('charts.indices.kIndex')} value={n1(i.k)} sub={kText(i.k)} />
            <Stat
              label={t('charts.indices.totalTotals')}
              value={n1(i.tt)}
              sub={i.tt !== null ? (i.tt >= 50 ? t('charts.indices.ttLikely') : i.tt >= 44 ? t('charts.indices.ttPossible') : t('charts.indices.ttWeak')) : undefined}
            />
            <Stat label={t('charts.indices.precipitableWater')} value={n1(i.pw, '\u00a0mm')} sub={t('charts.indices.below300')} />
            <Stat label={t('charts.indices.shear')} value={i.shear01 !== null ? fmtHSpeed(i.shear01, units) : '—'} sub="0–1 km" />
          </>
        )}
      </div>
      <Button variant="ghost" size="sm" className="-ml-2 text-[13px]" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <ChevronDown className={cx('transition-transform', open && 'rotate-180')} />
        {open ? t('charts.indices.less') : t('charts.indices.all')}
      </Button>
      <p className="text-[12.5px] leading-relaxed">
        {profile.measuredPressure
          ? t('charts.indices.pressureMeasured')
          : t('charts.indices.pressureComputed')}
        {open &&
          ` ${sb ? t('charts.indices.surfaceParcelNote') : t('charts.indices.elevatedNote')} ${t('charts.indices.indicativeNote')}`}
      </p>
    </div>
  );
}
