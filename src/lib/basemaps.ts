import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { BasemapId } from '../store/useStore';

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
  /** Colour used for the preview swatch in the layer picker. */
  swatch: string;
}

export const BASEMAPS: Basemap[] = [
  { id: 'dark', label: 'Nuit', dark: true, style: 'https://tiles.openfreemap.org/styles/dark', swatch: '#1b2233' },
  { id: 'liberty', label: 'Plan', dark: false, style: 'https://tiles.openfreemap.org/styles/liberty', swatch: '#f3efe6' },
  { id: 'positron', label: 'Clair', dark: false, style: 'https://tiles.openfreemap.org/styles/positron', swatch: '#fafafa' },
  {
    id: 'satellite',
    label: 'Satellite',
    dark: true,
    style: raster(
      ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      'Imagerie © Esri, Maxar, Earthstar Geographics',
    ),
    swatch: '#2f4a2a',
  },
  {
    id: 'topo',
    label: 'Relief',
    dark: false,
    style: raster(
      ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://b.tile.opentopomap.org/{z}/{x}/{y}.png', 'https://c.tile.opentopomap.org/{z}/{x}/{y}.png'],
      '© OpenStreetMap, SRTM | Style © OpenTopoMap (CC-BY-SA)',
      17,
    ),
    swatch: '#e8e0c8',
  },
  {
    id: 'osm',
    label: 'OSM',
    dark: false,
    style: raster(['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], '© les contributeurs OpenStreetMap'),
    swatch: '#f2efe9',
  },
];

export const basemapById = (id: BasemapId) => BASEMAPS.find((b) => b.id === id) ?? BASEMAPS[0];

/** Free global DEM (Terrarium encoding) for the optional 3D relief. */
export const TERRAIN_SOURCE = {
  type: 'raster-dem' as const,
  tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  encoding: 'terrarium' as const,
  tileSize: 256,
  maxzoom: 14,
  attribution: 'Relief © Mapzen, AWS Terrain Tiles',
};
