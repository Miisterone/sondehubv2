import { useEffect, useId, useRef, useState } from 'react';
import { useStore } from '@/store/useStore';
import { fmtRadius, type Units } from '@/lib/format';
import { useT } from '@/i18n';
import { Input } from '@/components/ui/input';
import { Segmented, cx } from './ui';

export const RADIUS_PRESETS = [5, 25, 100] as const;
const MIN_KM = 1;
const MAX_KM = 300;
const COMMIT_DELAY_MS = 500;
const KM_PER_MI = 1.609344;

const isPreset = (km: number) => (RADIUS_PRESETS as readonly number[]).includes(km);

export function nextRadius(km: number): number | undefined {
  return RADIUS_PRESETS.find((r) => r > km);
}

const toDisplay = (km: number, units: Units) => (units === 'metric' ? km : Math.round(km / KM_PER_MI));
const toKm = (v: number, units: Units) => (units === 'metric' ? v : Math.round(v * KM_PER_MI));

export function RadiusPicker({ units, className }: { units: Units; className?: string }) {
  const radiusKm = useStore((s) => s.settings.alerts.radiusKm);
  const tr = useT();
  const [custom, setCustom] = useState(() => !isPreset(radiusKm));
  const [focusCustom, setFocusCustom] = useState(false);

  useEffect(() => {
    if (!isPreset(radiusKm)) setCustom(true);
  }, [radiusKm]);

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px]">{tr('sidebar.nearby.radius')}</span>
        <div role="group" aria-label={tr('sidebar.nearby.radiusLabel')}>
          <Segmented<string>
            size="sm"
            value={custom ? 'custom' : String(radiusKm)}
            onChange={(v) => {
              if (v === 'custom') {
                setCustom(true);
                setFocusCustom(true);
                return;
              }
              setCustom(false);
              useStore.getState().setAlerts({ radiusKm: Number(v) });
            }}
            options={[
              ...RADIUS_PRESETS.map((r) => ({ value: String(r), label: fmtRadius(r, units), title: tr('sidebar.nearby.radiusTitle', { radius: fmtRadius(r, units) }) })),
              { value: 'custom', label: tr('sidebar.nearby.radiusCustom'), title: tr('sidebar.nearby.radiusCustomTitle') },
            ]}
          />
        </div>
      </div>
      {custom && <CustomRadius radiusKm={radiusKm} units={units} autoFocus={focusCustom} onFocused={() => setFocusCustom(false)} />}
    </div>
  );
}

function CustomRadius({ radiusKm, units, autoFocus, onFocused }: { radiusKm: number; units: Units; autoFocus: boolean; onFocused: () => void }) {
  const tr = useT();
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const shown = toDisplay(radiusKm, units);
  const [draft, setDraft] = useState(String(shown));
  const unit = units === 'metric' ? 'km' : 'mi';
  const min = toDisplay(MIN_KM, units) || 1;
  const max = toDisplay(MAX_KM, units);
  const value = Number(draft.replace(',', '.'));
  const valid = draft.trim() !== '' && Number.isFinite(value) && value >= min && value <= max;

  useEffect(() => {
    if (document.activeElement !== ref.current) setDraft(String(shown));
  }, [shown]);

  useEffect(() => {
    if (!autoFocus) return;
    ref.current?.focus();
    ref.current?.select();
    onFocused();
  }, [autoFocus, onFocused]);

  const commit = () => {
    if (!valid) return;
    const km = Math.min(MAX_KM, Math.max(MIN_KM, toKm(Math.round(value), units)));
    if (km !== useStore.getState().settings.alerts.radiusKm) useStore.getState().setAlerts({ radiusKm: km });
  };

  useEffect(() => {
    if (!valid || toKm(Math.round(value), units) === radiusKm) return;
    const timer = window.setTimeout(commit, COMMIT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft]);

  return (
    <div className="mt-2">
      <div className="flex items-center justify-end gap-2.5">
        <label htmlFor={id} className="text-[13px]">
          {tr('sidebar.nearby.radiusCustomLabel')}
        </label>
        <div className="relative">
          <Input
            ref={ref}
            id={id}
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            step={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              }
            }}
            onBlur={() => {
              if (valid) commit();
              else setDraft(String(toDisplay(useStore.getState().settings.alerts.radiusKm, units)));
            }}
            aria-invalid={!valid}
            aria-describedby={`${id}-range`}
            className="bg-background text-foreground tabular h-7 w-24 rounded-md pr-9 text-right text-[13px] md:text-[13px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="text-faint pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[12px]">{unit}</span>
        </div>
      </div>
      <p id={`${id}-range`} className={cx('pt-1 text-right text-[12px]', valid ? 'text-faint' : 'text-foreground')}>
        {tr('sidebar.nearby.radiusRange', { min: `${min} ${unit}`, max: `${max} ${unit}` })}
      </p>
    </div>
  );
}
