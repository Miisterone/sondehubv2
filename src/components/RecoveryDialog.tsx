import { useState, type ClipboardEvent, type ReactNode } from 'react';
import { AlertCircle, Car, Globe, Loader2, LocateFixed, PackageCheck, SearchX, Send } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from 'cn';
import { useStore } from '@/store/useStore';
import { submitRecovery } from '@/lib/api';
import { locateUser } from '@/lib/geolocation';
import { usefulPrediction } from '@/lib/filter';
import { distance } from '@/lib/geo';
import { ago, fmtDist } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { t, Trans, useT } from '@/i18n';

type Status = 'recovered' | 'notfound' | 'planned';

const statusOption = (value: Status, icon: ReactNode, recovered: boolean, planned: boolean) => ({
  value,
  icon,
  recovered,
  planned,
  get label() {
    return t(`map.recovery.status.${value}.label`);
  },
  get hint() {
    return t(`map.recovery.status.${value}.hint`);
  },
});

const STATUSES: { value: Status; label: string; hint: string; icon: ReactNode; recovered: boolean; planned: boolean }[] = [
  statusOption('recovered', <PackageCheck />, true, false),
  statusOption('notfound', <SearchX />, false, false),
  statusOption('planned', <Car />, false, true),
];

const PLACEHOLDER: Record<Status | 'none', string> = {
  get none() {
    return t('map.recovery.placeholder.recovered');
  },
  get recovered() {
    return t('map.recovery.placeholder.recovered');
  },
  get notfound() {
    return t('map.recovery.placeholder.notfound');
  },
  get planned() {
    return t('map.recovery.placeholder.planned');
  },
};

/** Escape closes the dialog only: stop it reaching App's global "Escape = deselect" shortcut. */
const keepSelection = (e: KeyboardEvent) => e.stopPropagation();

/** Accepts "48.12345", "48,12345" (French decimal comma) and surrounding spaces. */
function parseNum(v: string): number {
  const t = v.trim().replace(',', '.');
  return t === '' ? NaN : Number(t);
}

/** "48.77, 2.01" / "48.77 2.01" / "48,77 ; 2,01" → [lat, lon]. */
function parsePair(text: string): [number, number] | null {
  const m = text.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*[,; ]\s*(-?\d+(?:[.,]\d+)?)$/);
  if (!m) return null;
  const lat = parseNum(m[1]);
  const lon = parseNum(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lat, lon] : null;
}

/**
 * Publishes a recovery report ("récupérée", "pas trouvée", "je vais la récupérer") to SondeHub.
 * The form only mounts while the dialog is open, so it starts fresh from the latest data each time.
 */
export function RecoveryDialog({ serial, open, onOpenChange }: { serial: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-1.5rem)] gap-0 overflow-y-auto p-0 sm:max-w-md"
        onEscapeKeyDown={keepSelection}
        // Keep typing (e.g. "f" in the description) away from App's global keyboard shortcuts.
        onKeyDown={(e) => e.stopPropagation()}
      >
        {open && <RecoveryForm serial={serial} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function RecoveryForm({ serial, onDone }: { serial: string; onDone: () => void }) {
  const sonde = useStore((s) => s.sondes[serial]);
  const prediction = useStore((s) => s.predictions[serial]);
  const savedCallsign = useStore((s) => s.settings.callsign);
  const now = useStore((s) => s.now);
  const t = useT();

  // Default position: where the sonde was last heard, or the predicted landing if it was lost in the air.
  const [initial] = useState(() => {
    if (!sonde) return { lat: '', lon: '', alt: '', source: '' };
    const f = sonde.last;
    const flying = sonde.phase === 'ascending' || sonde.phase === 'descending';
    const landing = usefulPrediction(sonde, prediction) ? prediction.landing : null;
    const p = landing ?? f;
    return {
      lat: p.lat.toFixed(5),
      lon: p.lon.toFixed(5),
      alt: String(Math.max(0, Math.round(p.alt))),
      source: landing ? (flying ? t('map.recovery.source.predicted') : t('map.recovery.source.estimated')) : t('map.recovery.source.lastPosition', { ago: ago(sonde.lastTime, now) }),
    };
  });

  const [status, setStatus] = useState<Status | ''>('');
  const [callsign, setCallsign] = useState(savedCallsign);
  const [lat, setLat] = useState(initial.lat);
  const [lon, setLon] = useState(initial.lon);
  const [alt, setAlt] = useState(initial.alt);
  const [source, setSource] = useState(initial.source);
  const [description, setDescription] = useState('');
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const latN = parseNum(lat);
  const lonN = parseNum(lon);
  const altN = parseNum(alt);
  const errors = {
    status: !status ? t('map.recovery.error.status') : null,
    callsign: !callsign.trim() ? t('map.recovery.error.callsign') : null,
    lat: !Number.isFinite(latN) || Math.abs(latN) > 90 ? t('map.recovery.error.lat') : null,
    lon: !Number.isFinite(lonN) || Math.abs(lonN) > 180 ? t('map.recovery.error.lon') : null,
    alt: !Number.isFinite(altN) || altN < -500 || altN > 9000 ? t('map.recovery.error.alt') : null,
    description: description.trim().length < 3 ? t('map.recovery.error.description') : null,
  };
  const valid = Object.values(errors).every((e) => !e);
  const show = (k: keyof typeof errors) => (touched[k] ? errors[k] : null);
  const touch = (k: keyof typeof errors) => () => setTouched((t) => ({ ...t, [k]: true }));

  // Sanity check for typos: how far the entered point is from where the sonde was last heard.
  const offset = sonde && !errors.lat && !errors.lon ? distance(latN, lonN, sonde.last.lat, sonde.last.lon) : null;

  const fillMyPosition = async () => {
    setLocating(true);
    const ok = await locateUser({ fly: false });
    setLocating(false);
    const me = useStore.getState().userLocation;
    if (!ok || !me) return;
    setLat(me.lat.toFixed(5));
    setLon(me.lon.toFixed(5));
    if (me.alt !== undefined && Number.isFinite(me.alt)) setAlt(String(Math.round(me.alt)));
    setSource(t('map.recovery.source.mine', { accuracy: fmtDist(me.accuracy, 'metric') }));
  };

  // Pasting "48.77, 2.01" into either coordinate field fills both.
  const onPasteCoords = (e: ClipboardEvent<HTMLInputElement>) => {
    const pair = parsePair(e.clipboardData.getData('text'));
    if (!pair) return;
    e.preventDefault();
    setLat(pair[0].toFixed(5));
    setLon(pair[1].toFixed(5));
    setSource(t('map.recovery.source.pasted'));
  };

  const submit = async () => {
    setTouched({ status: true, callsign: true, lat: true, lon: true, alt: true, description: true });
    if (!valid || submitting || !status) return;
    const s = STATUSES.find((x) => x.value === status)!;
    setSubmitting(true);
    setError(null);
    const recovered_by = callsign.trim();
    useStore.getState().setSettings({ callsign: recovered_by });
    try {
      await submitRecovery({
        serial,
        lat: Number(latN.toFixed(6)),
        lon: Number(lonN.toFixed(6)),
        alt: Math.round(altN),
        recovered: s.recovered,
        planned: s.planned,
        recovered_by,
        description: description.trim(),
      });
      // Show it on the map right away instead of waiting for the next recoveries fetch.
      useStore.getState().setRecoveries(
        [{ serial, lat: latN, lon: lonN, recovered: s.recovered, planned: s.planned, recoveredBy: recovered_by, description: description.trim(), datetime: Date.now() }],
        false,
      );
      toast.success(t('map.recovery.published'), { description: `${serial} · ${s.label}` });
      onDone();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('map.recovery.unknownError'));
      setSubmitting(false);
    }
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <DialogHeader className="border-b px-5 pt-5 pb-4 text-left">
        <DialogTitle className="text-base">{t('map.recovery.title')}</DialogTitle>
        <DialogDescription className="text-[12.5px]">
          <Trans k="map.recovery.description" params={{ serial }} tags={{ b: (c) => <span className="text-foreground tabular font-medium">{c}</span> }} />
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 px-5 py-4">
        {/* Status */}
        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 text-[13px] font-medium">{t('map.recovery.statusLegend')}</legend>
          <RadioGroup
            value={status}
            onValueChange={(v) => {
              setStatus(v as Status);
              touch('status')();
            }}
            className="grid grid-cols-1 gap-2 sm:grid-cols-3"
            aria-invalid={!!show('status')}
          >
            {STATUSES.map((s) => (
              <Label
                key={s.value}
                htmlFor={`rec-${s.value}`}
                className={cn(
                  'hover:bg-accent/60 relative flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 font-normal transition-colors sm:flex-col sm:items-start sm:gap-1.5',
                  'has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/8 has-[[data-state=checked]]:ring-primary/30 has-[[data-state=checked]]:ring-1',
                )}
              >
                <RadioGroupItem id={`rec-${s.value}`} value={s.value} className="sm:absolute sm:top-2.5 sm:right-2.5" />
                <span className="text-muted-foreground [&>svg]:size-4.5 hidden sm:block">{s.icon}</span>
                <span className="min-w-0">
                  <span className="block text-[13px] leading-tight font-medium">{s.label}</span>
                  <span className="text-muted-foreground block text-[11.5px] leading-tight">{s.hint}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>
          <FieldError>{show('status')}</FieldError>
        </fieldset>

        {/* Callsign */}
        <div className="space-y-1.5">
          <Label htmlFor="rec-callsign" className="text-[13px]">
            {t('map.recovery.callsign')}
          </Label>
          <Input
            id="rec-callsign"
            value={callsign}
            onChange={(e) => setCallsign(e.target.value)}
            onBlur={touch('callsign')}
            placeholder={t('map.recovery.callsignPlaceholder')}
            autoComplete="nickname"
            maxLength={40}
            aria-invalid={!!show('callsign')}
          />
          <FieldError>{show('callsign')}</FieldError>
        </div>

        {/* Position */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="rec-lat" className="text-[13px]">
              {t('map.recovery.position')}
            </Label>
            <Button type="button" variant="outline" size="xs" onClick={fillMyPosition} disabled={locating}>
              {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
              {t('map.recovery.useMyPosition')}
            </Button>
          </div>
          <div className="grid grid-cols-[1fr_1fr_5.5rem] gap-2">
            <CoordField id="rec-lat" label={t('map.recovery.latitude')} value={lat} onChange={(v) => { setLat(v); setSource(''); }} onBlur={touch('lat')} onPaste={onPasteCoords} invalid={!!show('lat')} />
            <CoordField id="rec-lon" label={t('map.recovery.longitude')} value={lon} onChange={(v) => { setLon(v); setSource(''); }} onBlur={touch('lon')} onPaste={onPasteCoords} invalid={!!show('lon')} />
            <CoordField id="rec-alt" label={t('map.recovery.altitude')} value={alt} onChange={setAlt} onBlur={touch('alt')} invalid={!!show('alt')} />
          </div>
          <FieldError>{show('lat') ?? show('lon') ?? show('alt')}</FieldError>
          <p className="text-muted-foreground text-[11.5px]">
            {source || t('map.recovery.source.manual')}
            {offset !== null && offset >= 50 && (
              // Far from where the sonde was last heard: likely a typo or swapped lat/lon.
              <span className={cn(offset > 30_000 && 'text-foreground font-semibold')}>
                {' '}
                · {offset > 30_000 ? t('map.recovery.offsetCheck', { dist: fmtDist(offset, 'metric') }) : t('map.recovery.offset', { dist: fmtDist(offset, 'metric') })}
              </span>
            )}
          </p>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label htmlFor="rec-desc" className="text-[13px]">
            {t('map.recovery.descriptionLabel')}
          </Label>
          <Textarea
            id="rec-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={touch('description')}
            placeholder={PLACEHOLDER[status || 'none']}
            rows={3}
            maxLength={500}
            className="min-h-20 resize-y text-sm"
            aria-invalid={!!show('description')}
          />
          <FieldError>{show('description')}</FieldError>
        </div>

        {/* Public warning */}
        <div className="bg-surface flex gap-2.5 rounded-md border px-3 py-2.5 text-[12.5px] leading-snug">
          <Globe className="text-foreground mt-0.5 size-4 shrink-0" />
          <p>
            <Trans k="map.recovery.publicWarning" tags={{ b: (c) => <span className="font-semibold">{c}</span> }} />
          </p>
        </div>

        {error && (
          <div role="alert" className="border-destructive/40 bg-destructive/10 text-destructive flex gap-2.5 rounded-lg border px-3 py-2.5 text-[12px] leading-snug">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold">{t('map.recovery.sendFailed')}</p>
              <p className="line-clamp-3 break-words opacity-90">{error}</p>
              <p className="text-foreground/80 mt-0.5">{t('map.recovery.checkConnection')}</p>
            </div>
          </div>
        )}
      </div>

      <DialogFooter className="border-t px-5 py-3.5">
        <Button type="button" variant="ghost" onClick={onDone}>
          {t('map.recovery.cancel')}
        </Button>
        <Button type="submit" disabled={!valid || submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : <Send />}
          {submitting ? t('map.recovery.publishing') : t('map.recovery.publish')}
        </Button>
      </DialogFooter>
    </form>
  );
}

function CoordField({
  id,
  label,
  value,
  onChange,
  onBlur,
  onPaste,
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  onPaste?: (e: ClipboardEvent<HTMLInputElement>) => void;
  invalid: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={id} className="text-muted-foreground text-[11px] font-normal">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onPaste={onPaste}
        autoComplete="off"
        spellCheck={false}
        className="h-8 px-2 tabular text-[13px]"
        aria-invalid={invalid}
      />
    </div>
  );
}

function FieldError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="text-destructive text-[11.5px]">{children}</p>;
}
