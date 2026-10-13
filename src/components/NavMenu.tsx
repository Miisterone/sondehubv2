import type { ComponentProps } from 'react';
import { ChevronDown, ExternalLink, MapPinned, Navigation } from 'lucide-react';
import { useStore } from '@/store/useStore';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const keepSelection = (e: KeyboardEvent) => e.stopPropagation();

export function navLinks(t: { lat: number; lon: number }, me: { lat: number; lon: number } | null) {
  const ll = `${t.lat},${t.lon}`;
  return [
    { label: 'Google Maps', href: `https://www.google.com/maps/dir/?api=1&destination=${ll}` },
    { label: 'Waze', href: `https://waze.com/ul?ll=${ll}&navigate=yes` },
    { label: 'Apple Plans', href: `https://maps.apple.com/?daddr=${ll}&dirflg=d` },
    {
      label: 'OpenStreetMap',
      href: `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${me ? `${me.lat},${me.lon}` : ''}%3B${ll}`,
    },
  ];
}

export function NavMenu({
  target,
  label = 'Y aller',
  heading,
  variant = 'outline',
  className,
}: {
  target: { lat: number; lon: number };
  label?: string;
  heading: string;
  variant?: ComponentProps<typeof Button>['variant'];
  className?: string;
}) {
  const me = useStore((s) => s.userLocation);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size="sm" className={className}>
          <Navigation /> {label} <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56" onEscapeKeyDown={keepSelection}>
        <DropdownMenuLabel className="text-muted-foreground text-[12px] font-normal">{heading}</DropdownMenuLabel>
        {navLinks(target, me).map((l) => (
          <DropdownMenuItem key={l.label} asChild className="text-[13.5px]">
            <a href={l.href} target="_blank" rel="noreferrer">
              <MapPinned /> {l.label}
              <ExternalLink className="ml-auto size-3!" />
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
