import type { Map as MlMap } from 'maplibre-gl';
import type { RasterDEMSourceSpecification, SkySpecification } from '@maplibre/maplibre-gl-style-spec';
import type { Basemap } from './basemaps';

export const TERRAIN_PITCH = 60;
const EXAGGERATION = 1.3;

const TERRAIN_SOURCE = 'relief-dem';
const HILLSHADE_SOURCE = 'relief-hillshade-dem';
const HILLSHADE_LAYER = 'relief-hillshade';

function demSource(credit: boolean): RasterDEMSourceSpecification {
  const src: RasterDEMSourceSpecification = {
    type: 'raster-dem',
    tiles: ['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'],
    encoding: 'terrarium',
    tileSize: 512,
    maxzoom: 12,
  };
  if (credit) src.attribution = '<a href="https://mapterhorn.com/attribution" target="_blank" rel="noopener">© Mapterhorn</a>';
  return src;
}

function sky(dark: boolean): SkySpecification {
  const blends = { 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.85, 'atmosphere-blend': 0 };
  return dark
    ? { 'sky-color': '#0D1117', 'horizon-color': '#1A1F27', 'fog-color': '#14181E', ...blends }
    : { 'sky-color': '#EAF0F6', 'horizon-color': '#F6F8FA', 'fog-color': '#FFFFFF', ...blends };
}

function hillshadeBeforeId(map: MlMap): string | undefined {
  return map.getStyle().layers.find((l) => l.type === 'symbol' || ('source' in l && map.getSource(l.source)?.type === 'geojson'))?.id;
}

export function applyTerrain(map: MlMap, on: boolean, base: Basemap) {
  map.setSky(sky(base.dark));
  if (!on) {
    map.setTerrain(null);
    if (map.getLayer(HILLSHADE_LAYER)) map.removeLayer(HILLSHADE_LAYER);
    for (const id of [HILLSHADE_SOURCE, TERRAIN_SOURCE]) if (map.getSource(id)) map.removeSource(id);
    return;
  }
  if (!map.getSource(TERRAIN_SOURCE)) map.addSource(TERRAIN_SOURCE, demSource(true));
  if (!map.getSource(HILLSHADE_SOURCE)) map.addSource(HILLSHADE_SOURCE, demSource(false));
  if (!map.getLayer(HILLSHADE_LAYER) && base.hillshade > 0) {
    map.addLayer(
      {
        id: HILLSHADE_LAYER,
        type: 'hillshade',
        source: HILLSHADE_SOURCE,
        paint: {
          'hillshade-method': 'igor',
          'hillshade-exaggeration': base.hillshade,
          'hillshade-shadow-color': base.dark ? '#000000' : '#425466',
          'hillshade-highlight-color': base.dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.5)',
          'hillshade-accent-color': base.dark ? '#000000' : '#425466',
        },
      },
      hillshadeBeforeId(map),
    );
  }
  map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: EXAGGERATION });
}
