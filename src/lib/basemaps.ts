import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { BasemapId } from '../store/useStore';
import { t } from '@/i18n';
import darkPreview from '../assets/basemaps/dark.webp';
import libertyPreview from '../assets/basemaps/liberty.webp';
import positronPreview from '../assets/basemaps/positron.webp';
import satellitePreview from '../assets/basemaps/satellite.webp';
import topoPreview from '../assets/basemaps/topo.webp';
import osmPreview from '../assets/basemaps/osm.webp';

export const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
export const FONT = ['Noto Sans Regular'];
export const FONT_BOLD = ['Noto Sans Bold'];

function raster(tiles: string[], attribution: string, maxzoom = 19): StyleSpecification {
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      base: { type: 'raster', tiles, tileSize: 256, attribution, maxzoom },
    },
    layers: [{ id: 'base', type: 'raster', source: 'base' }],
  };
}

export interface Basemap {
  id: BasemapId;
  label: string;
  dark: boolean;
  style: string | StyleSpecification;
  preview: string;
  /** Placeholder colour behind the thumbnail while it loads. */
  swatch: string;
}

export const BASEMAPS: Basemap[] = [
  {
    id: 'dark',
    get label() {
      return t('lib.basemap.dark');
    },
    dark: true,
    style: 'https://tiles.openfreemap.org/styles/dark',
    preview: darkPreview,
    swatch: '#1b1b1b',
  },
  {
    id: 'liberty',
    get label() {
      return t('lib.basemap.liberty');
    },
    dark: false,
    style: 'https://tiles.openfreemap.org/styles/liberty',
    preview: libertyPreview,
    swatch: '#f3efe6',
  },
  {
    id: 'positron',
    get label() {
      return t('lib.basemap.positron');
    },
    dark: false,
    style: 'https://tiles.openfreemap.org/styles/positron',
    preview: positronPreview,
    swatch: '#f2f2f2',
  },
  {
    id: 'satellite',
    get label() {
      return t('lib.basemap.satellite');
    },
    dark: true,
    get style() {
      return raster(['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], t('lib.basemap.attributionEsri'));
    },
    preview: satellitePreview,
    swatch: '#3d4a32',
  },
  {
    id: 'topo',
    get label() {
      return t('lib.basemap.topo');
    },
    dark: false,
    style: raster(
      ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://b.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://c.tile.opentopomap.org/{z}/{x}/{y}.png'],
      '© OpenStreetMap, SRTM | Style © OpenTopoMap (CC-BY-SA)',
      17,
    ),
    preview: topoPreview,
    swatch: '#4f9a3c',
  },
  {
    id: 'osm',
    label: 'OSM',
    dark: false,
    get style() {
      return raster(['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], t('lib.basemap.attributionOsm'));
    },
    preview: osmPreview,
    swatch: '#f2efe9',
  },
];

export const basemapById = (id: BasemapId) => BASEMAPS.find((b) => b.id === id) ?? BASEMAPS[0];
