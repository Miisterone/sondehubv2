import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Profile } from '@/lib/atmo';
import { fmtAltShort, fmtHSpeed, fmtNum, fmtTemp, type Units } from '@/lib/format';
import { HelpHint } from './HelpHint';
import { Stat, cx } from './ui';
import { Button } from '@/components/ui/button';

const n0 = (v: number | null, suffix = '') => (v === null || !Number.isFinite(v) ? '—' : fmtNum(v, suffix, 0));
const n1 = (v: number | null, suffix = '') => (v === null || !Number.isFinite(v) ? '—' : fmtNum(v, suffix, 1));

function capeText(cape: number | null): string | undefined {
  if (cape === null) return undefined;
  if (cape < 100) return 'stable';
  if (cape < 1000) return 'instabilité faible';
  if (cape < 2500) return 'modérée';
  return 'forte';
}

function liText(li: number | null): string | undefined {
  if (li === null) return undefined;
  if (li > 2) return 'stable';
  if (li > -2) return 'neutre';
  if (li > -6) return 'instable';
  return 'très instable';
}

function kText(k: number | null): string | undefined {
  if (k === null) return undefined;
  if (k < 20) return 'orages rares';
  if (k < 30) return 'orages isolés';
  if (k < 35) return 'orages épars';
  return 'orages nombreux';
}

export function AtmoIndices({ profile, units }: { profile: Profile; units: Units }) {
  const i = profile.indices;
  const sb = i.surfaceBased;
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3 border-t pt-4">
      <h4 className="flex items-center gap-1.5 text-[14px] font-semibold">
        Indices
        <HelpHint title="Ce que mesurent ces indices">
          CAPE : énergie disponible pour une bulle d’air soulevée depuis la surface (J/kg), CIN : énergie à vaincre pour la déclencher. LI : écart de température à 500 hPa
          entre l’environnement et la bulle, négatif si elle est plus chaude. K et Total Totals combinent températures et humidité à 850, 700 et 500 hPa. LCL : niveau
          où la bulle se condense, la base des cumulus. Cisaillement : différence de vent entre la surface et 6 km, élevé au-delà de 70 km/h pour des orages organisés.
        </HelpHint>
      </h4>
      <div className="grid grid-cols-3 gap-x-4 gap-y-4">
        <Stat label="CAPE" value={sb ? n0(i.cape, '\u00a0J/kg') : '—'} sub={sb ? capeText(i.cape) : 'départ en altitude'} />
        <Stat label="LI" value={n1(i.li, '\u00a0°C')} sub={liText(i.li)} />
        <Stat label="Base des nuages" value={i.lcl ? fmtAltShort(i.lcl.z, units) : '—'} sub={i.lcl ? `LCL ${n0(i.lcl.p, '\u00a0hPa')}` : undefined} />
        <Stat label={'Isotherme 0\u00a0°C'} value={i.freezing !== null ? fmtAltShort(i.freezing, units) : '—'} sub="en montée" />
        <Stat
          label="Tropopause"
          value={i.tropopause ? fmtAltShort(i.tropopause.z, units) : '—'}
          sub={i.tropopause ? `${n0(i.tropopause.p, '\u00a0hPa')}, ${fmtTemp(i.tropopause.t, units)}` : undefined}
        />
        <Stat label="Cisaillement" value={i.shear06 !== null ? fmtHSpeed(i.shear06, units) : '—'} sub="0–6 km" />
        {open && (
          <>
            <Stat label="CIN" value={sb && i.cin !== null ? n0(i.cin, '\u00a0J/kg') : '—'} sub={sb && i.cape === 0 ? 'aucune' : undefined} />
            <Stat label="Indice K" value={n1(i.k)} sub={kText(i.k)} />
            <Stat label="Total Totals" value={n1(i.tt)} sub={i.tt !== null ? (i.tt >= 50 ? 'orages probables' : i.tt >= 44 ? 'orages possibles' : 'faible') : undefined} />
            <Stat label="Eau précipitable" value={n1(i.pw, '\u00a0mm')} sub="sous 300 hPa" />
            <Stat label="Cisaillement" value={i.shear01 !== null ? fmtHSpeed(i.shear01, units) : '—'} sub="0–1 km" />
          </>
        )}
      </div>
      <Button variant="ghost" size="sm" className="-ml-2 text-[13px]" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <ChevronDown className={cx('transition-transform', open && 'rotate-180')} />
        {open ? 'Moins d’indices' : 'Tous les indices (11)'}
      </Button>
      <p className="text-[12.5px] leading-relaxed">
        {profile.measuredPressure
          ? 'Pression mesurée par la sonde.'
          : 'Cette sonde ne mesure pas la pression : elle est recalculée à partir de l’altitude GPS et de la température (écart typique de 1 à 2 %).'}
        {open &&
          ` ${sb ? 'Particule de surface : médiane des 50 premiers hPa.' : 'La sonde a été captée en altitude : les indices liés à la surface ne sont pas calculés.'} Valeurs indicatives, calculées sans correction de température virtuelle.`}
      </p>
    </div>
  );
}
