import { useEffect, useRef } from 'react';
import { Map as MlMap, Marker, Popup, setWorkerUrl, type GeoJSONSource, type MapLayerMouseEvent } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { ExpressionSpecification, LayerSpecification, SymbolLayerSpecification } from '@maplibre/maplibre-gl-style-spec';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useStore } from '../store/useStore';
import { basemapById, FONT } from '../lib/basemaps';
import { addIcons, COLOURS, PHASE_COLOUR } from '../lib/icons';
import {
  burstFC,
  EMPTY,
  listenersFC,
  predictionPathsFC,
  predictionPointsFC,
  receiverLinksFC,
  recoveriesFC,
  reverseFC,
  selectedTrackFC,
  sitePathsFC,
  sitePointsFC,
  sitesFC,
  sondeFeature,
  trackAt,
  trackDeps,
  trackFeature,
} from '../lib/mapData';
import { IncrementalSource, type Entry } from '../lib/incrementalSource';
import { circleRing, viewForTimeZone } from '../lib/region';
import { makeVisible } from '../lib/filter';
import { ago, fmtAlt, fmtAltShort } from '../lib/format';

// MapLibre locates its worker relative to its own module URL, which bundling breaks: point at the emitted file.
setWorkerUrl(workerUrl);

/** Altitude colour ramp for the selected flight (metres → colour). Mirrored by the legend in the detail panel. */
export const ALT_RAMP: [number, string][] = [
  [0, '#34d399'],
  [6000, '#38bdf8'],
  [14000, '#818cf8'],
  [22000, '#e879f9'],
  [30000, '#fb7185'],
  [38000, '#fbbf24'],
];

const SOURCES = [
  'tracks',
  'track-selected',
  'pred-paths',
  'pred-points',
  'burst',
  'links',
  'sondes',
  'listeners',
  'sites',
  'recoveries',
  'reverse',
  'site-paths',
  'site-points',
  'me',
  'alert-radius',
] as const;
type SourceId = (typeof SOURCES)[number];

/** Sources diffed feature by feature (see IncrementalSource): need a stable id. */
const KEYED_SOURCES = new Set<string>(['sondes', 'tracks']);

const LISTENER_LAYERS = ['listeners-icons', 'chase-icons', 'listeners-dots'];
const SONDE_LAYERS = ['sondes-air', 'sondes-ground', 'sondes-ground-dots'];
const INTERACTIVE = [...SONDE_LAYERS, 'tracks-line', 'track-selected-line', 'pred-points-icons', 'sites-icons', 'recoveries-icons', 'site-past-dots', ...LISTENER_LAYERS];

/** Below this zoom, sondes on the ground are drawn as dots so flights in progress stand out. */
const GROUND_ICON_ZOOM = 6;

const PHASE_MATCH = (values: Record<'ascending' | 'descending' | 'landed' | 'lost', unknown>) =>
  ['match', ['get', 'phase'], 'ascending', values.ascending, 'descending', values.descending, 'landed', values.landed, values.lost] as unknown as ExpressionSpecification;

/** Background tracks: landed flights recede, and everything dims while one sonde is selected. */
const trackOpacity = (dim: boolean) =>
  PHASE_MATCH(dim ? { ascending: 0.3, descending: 0.3, landed: 0.16, lost: 0.12 } : { ascending: 0.85, descending: 0.85, landed: 0.4, lost: 0.3 });

function installOverlays(map: MlMap, darkBase: boolean) {
  addIcons(map);
  for (const id of SOURCES) {
    if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: EMPTY, ...(KEYED_SOURCES.has(id) ? { promoteId: 'serial' } : {}) });
  }
  const textColour = darkBase ? '#e5edf7' : '#0f172a';
  const haloColour = darkBase ? 'rgba(8,12,20,0.9)' : 'rgba(255,255,255,0.95)';
  const ramp = ALT_RAMP.flat();

  const add = (layer: LayerSpecification) => {
    if (!map.getLayer(layer.id)) map.addLayer(layer);
  };

  add({
    id: 'sites-icons',
    type: 'symbol',
    source: 'sites',
    minzoom: 4,
    layout: {
      'icon-image': 'site',
      'icon-allow-overlap': true,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.65, 8, 1],
      'text-field': ['step', ['zoom'], '', 8, ['get', 'name']],
      'text-font': FONT,
      'text-size': 11,
      'text-offset': [0, 1.1],
      'text-anchor': 'top',
      'text-optional': true,
    },
    paint: { 'text-color': textColour, 'text-halo-color': haloColour, 'text-halo-width': 1.4, 'icon-opacity': 0.9 },
  });

  add({
    id: 'pred-paths-line',
    type: 'line',
    source: 'pred-paths',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['case', ['get', 'selected'], COLOURS.landing, darkBase ? '#cbd5e1' : '#475569'],
      'line-width': ['case', ['get', 'selected'], 2.5, 1.3],
      'line-opacity': ['case', ['get', 'selected'], 0.95, 0.5],
      'line-dasharray': [2, 2],
    },
  });

  add({
    id: 'site-paths-line',
    type: 'line',
    source: 'site-paths',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['case', ['get', 'next'], COLOURS.landing, darkBase ? '#cbd5e1' : '#475569'],
      'line-width': ['case', ['get', 'next'], 2.5, 1.4],
      'line-opacity': ['case', ['get', 'next'], 0.95, 0.55],
      'line-dasharray': [2, 2],
    },
  });

  add({
    id: 'reverse-line',
    type: 'line',
    source: 'reverse',
    filter: ['==', ['get', 'kind'], 'path'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': darkBase ? '#cbd5e1' : '#475569', 'line-width': 2, 'line-opacity': 0.8, 'line-dasharray': [1, 2] },
  });

  add({
    id: 'tracks-line',
    type: 'line',
    source: 'tracks',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': PHASE_MATCH(PHASE_COLOUR),
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.2, 10, 2.5],
      'line-opacity': trackOpacity(false),
    },
  });

  // Track under the cursor (map or list), drawn on top of the others.
  add({
    id: 'track-hover',
    type: 'line',
    source: 'tracks',
    filter: ['==', ['get', 'serial'], ''],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': PHASE_MATCH(PHASE_COLOUR),
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 3, 10, 5],
      'line-opacity': 1,
    },
  });

  add({
    id: 'track-selected-casing',
    type: 'line',
    source: 'track-selected',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': darkBase ? '#020617' : '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 5, 12, 9], 'line-opacity': 0.8 },
  });
  add({
    id: 'track-selected-line',
    type: 'line',
    source: 'track-selected',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['interpolate', ['linear'], ['get', 'alt'], ...ramp] as unknown as ExpressionSpecification,
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 3, 12, 5.5],
    },
  });

  add({
    id: 'links-line',
    type: 'line',
    source: 'links',
    paint: {
      'line-color': COLOURS.listener,
      'line-width': 1.4,
      'line-opacity': 0.7,
      'line-dasharray': [1, 2],
    },
  });

  add({
    id: 'recoveries-icons',
    type: 'symbol',
    source: 'recoveries',
    layout: { 'icon-image': ['get', 'icon'], 'icon-allow-overlap': true },
  });

  // ~800 fixed stations: discreet dots when zoomed out, icons + callsigns closer in.
  add({
    id: 'listeners-dots',
    type: 'circle',
    source: 'listeners',
    maxzoom: 7,
    filter: ['==', ['get', 'mobile'], false],
    paint: {
      'circle-color': COLOURS.listener,
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 1.6, 7, 3.2],
      'circle-opacity': 0.55,
      'circle-stroke-width': 0,
    },
  });
  for (const [id, mobile, minzoom] of [
    ['listeners-icons', false, 7],
    ['chase-icons', true, 0],
  ] as const) {
    add({
      id,
      type: 'symbol',
      source: 'listeners',
      minzoom,
      filter: ['==', ['get', 'mobile'], mobile],
      layout: {
        'icon-image': ['get', 'icon'],
        'icon-allow-overlap': true,
        'icon-size': mobile ? ['interpolate', ['linear'], ['zoom'], 3, 0.75, 8, 1] : 1,
        'text-field': ['step', ['zoom'], '', 9, ['get', 'label']],
        'text-font': FONT,
        'text-size': 11,
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
        'text-optional': true,
      },
      paint: { 'text-color': textColour, 'text-halo-color': haloColour, 'text-halo-width': 1.4 },
    });
  }

  add({
    id: 'pred-points-icons',
    type: 'symbol',
    source: 'pred-points',
    layout: {
      'icon-image': ['case', ['==', ['get', 'kind'], 'burst'], 'burst', ['get', 'selected'], 'landing', 'landing-small'],
      'icon-allow-overlap': true,
    },
    paint: { 'icon-opacity': ['case', ['get', 'selected'], 1, 0.75] },
  });

  add({
    id: 'burst-icon',
    type: 'symbol',
    source: 'burst',
    layout: {
      'icon-image': 'burst',
      'icon-allow-overlap': true,
      'text-field': ['concat', 'Éclatement ', ['to-string', ['get', 'alt']], ' m'],
      'text-font': FONT,
      'text-size': 11,
      'text-offset': [0, 1.3],
      'text-anchor': 'top',
    },
    paint: { 'text-color': textColour, 'text-halo-color': haloColour, 'text-halo-width': 1.5 },
  });

  add({
    id: 'site-past-dots',
    type: 'circle',
    source: 'site-points',
    filter: ['==', ['get', 'kind'], 'past'],
    paint: {
      'circle-color': darkBase ? '#94a3b8' : '#64748b',
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 3, 10, 5],
      'circle-opacity': 0.75,
      'circle-stroke-color': darkBase ? '#0b1220' : '#ffffff',
      'circle-stroke-width': 1.2,
    },
  });
  add({
    id: 'site-forecast-icons',
    type: 'symbol',
    source: 'site-points',
    filter: ['==', ['get', 'kind'], 'forecast'],
    layout: {
      'icon-image': ['case', ['get', 'next'], 'landing', 'landing-small'],
      'icon-allow-overlap': true,
      'text-field': ['step', ['zoom'], ['case', ['get', 'next'], ['get', 'label'], ''], 7, ['get', 'label']],
      'text-font': FONT,
      'text-size': 11,
      'text-offset': [0, 1.2],
      'text-anchor': 'top',
      'text-optional': true,
    },
    paint: { 'text-color': textColour, 'text-halo-color': haloColour, 'text-halo-width': 1.4 },
  });
  add({
    id: 'reverse-point',
    type: 'circle',
    source: 'reverse',
    filter: ['==', ['get', 'kind'], 'launch'],
    paint: {
      'circle-color': darkBase ? '#cbd5e1' : '#475569',
      'circle-radius': 5,
      'circle-stroke-color': darkBase ? '#0b1220' : '#ffffff',
      'circle-stroke-width': 2,
    },
  });
  add({
    id: 'reverse-label',
    type: 'symbol',
    source: 'reverse',
    filter: ['==', ['get', 'kind'], 'launch'],
    layout: { 'text-field': ['get', 'label'], 'text-font': FONT, 'text-size': 11, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-optional': true },
    paint: { 'text-color': textColour, 'text-halo-color': haloColour, 'text-halo-width': 1.4 },
  });

  // Alert radius around the user (only when landing alerts are on).
  add({
    id: 'alert-radius-fill',
    type: 'fill',
    source: 'alert-radius',
    paint: { 'fill-color': COLOURS.me, 'fill-opacity': 0.05 },
  });
  add({
    id: 'alert-radius-line',
    type: 'line',
    source: 'alert-radius',
    paint: { 'line-color': COLOURS.me, 'line-width': 1.5, 'line-opacity': 0.6, 'line-dasharray': [3, 2] },
  });
  add({
    id: 'me-accuracy',
    type: 'circle',
    source: 'me',
    paint: {
      'circle-color': COLOURS.me,
      'circle-opacity': 0.12,
      'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 0, ['get', 'r0'], 20, ['get', 'r20']],
      'circle-pitch-alignment': 'map',
    },
  });
  add({
    id: 'me-dot',
    type: 'circle',
    source: 'me',
    paint: { 'circle-color': COLOURS.me, 'circle-radius': 7, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 },
  });

  const sondeLayout = (labelZoom: number): SymbolLayerSpecification['layout'] => ({
      'icon-image': ['get', 'icon'],
      'icon-allow-overlap': true,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 2, ['case', ['get', 'selected'], 1.15, 0.8], 7, ['case', ['get', 'selected'], 1.3, 1]],
      'symbol-sort-key': ['get', 'sortKey'],
      'symbol-z-order': 'source',
      'text-field': ['step', ['zoom'], ['case', ['get', 'selected'], ['get', 'serial'], ''], labelZoom, ['get', 'serial']],
      'text-font': FONT,
      'text-size': ['case', ['get', 'selected'], 13, 11],
      'text-offset': [0, 1.35],
      'text-anchor': 'top',
      'text-optional': true,
  });
  const sondePaint = { 'text-color': textColour, 'text-halo-color': haloColour, 'text-halo-width': 1.6 };
  const air = ['==', ['get', 'air'], true] as ExpressionSpecification;
  const ground = ['==', ['get', 'air'], false] as ExpressionSpecification;

  add({
    id: 'sondes-ground-dots',
    type: 'circle',
    source: 'sondes',
    maxzoom: GROUND_ICON_ZOOM,
    filter: ground,
    paint: {
      'circle-color': PHASE_MATCH(PHASE_COLOUR),
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 2.5, GROUND_ICON_ZOOM, 4],
      'circle-stroke-color': darkBase ? '#0b1220' : '#ffffff',
      'circle-stroke-width': 1,
      'circle-opacity': 0.85,
    },
  });
  add({ id: 'sondes-ground', type: 'symbol', source: 'sondes', minzoom: GROUND_ICON_ZOOM, filter: ground, layout: sondeLayout(9), paint: sondePaint });

  // Direction-of-travel chevron orbiting flying sondes.
  add({
    id: 'sondes-heading',
    type: 'symbol',
    source: 'sondes',
    minzoom: 4,
    filter: ['all', air, ['>=', ['get', 'heading'], 0]],
    layout: {
      'icon-image': ['concat', 'heading-', ['get', 'phase']],
      'icon-rotate': ['get', 'heading'],
      'icon-rotation-alignment': 'map',
      'icon-offset': [0, -24],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  });
  add({ id: 'sondes-air', type: 'symbol', source: 'sondes', filter: air, layout: sondeLayout(6), paint: sondePaint });
}

export function MapView() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);

  // Create the map once.
  useEffect(() => {
    const { settings } = useStore.getState();
    const base = basemapById(settings.basemap);
    // A shared link wins; otherwise start over the visitor's region (from the time zone).
    const hashCenter = parseHashView() ?? viewForTimeZone();
    const map = new MlMap({
      container: container.current!,
      style: base.style,
      center: hashCenter.center,
      zoom: hashCenter.zoom,
      attributionControl: { compact: true },
      maxPitch: 75,
      fadeDuration: 120,
      // Rendering at 3x on phones costs a lot of GPU for no visible gain.
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    });
    mapRef.current = map;
    (window as unknown as { __map: MlMap }).__map = map;

    // Keep camera targets clear of the side panel (desktop) or the bottom sheet (mobile).
    const applyPadding = () => {
      const mobile = window.innerWidth < 768;
      map.setPadding(mobile ? { top: 0, right: 0, left: 0, bottom: Math.round(window.innerHeight * 0.45) } : { top: 0, right: 56, bottom: 0, left: 380 });
    };
    applyPadding();
    window.addEventListener('resize', applyPadding);

    let synced: Partial<Record<SourceId, unknown[]>> = {};
    const sondesSrc = new IncrementalSource(map, 'sondes');
    const tracksSrc = new IncrementalSource(map, 'tracks');
    let lastSondeInputs: unknown[] = [];
    let dimmed = false;
    let frame = 0;
    let basemapDark = base.dark;

    const setData = (id: SourceId, deps: unknown[], build: () => GeoJSON.FeatureCollection) => {
      const prev = synced[id];
      if (prev && prev.length === deps.length && prev.every((d, i) => d === deps[i])) return;
      const src = map.getSource(id) as GeoJSONSource | undefined;
      if (!src) return;
      src.setData(build());
      synced[id] = deps;
    };

    const sync = () => {
      frame = 0;
      if (!map.isStyleLoaded() && !map.getSource('sondes')) return;
      const s = useStore.getState();
      const { sondes, selected, predictions, listeners, sites, recoveries, settings, query, phaseFilter, typeFilter, userLocation, now, reverse, siteOverlay } = s;
      const L = settings.layers;
      const sel = selected ? sondes[selected] : undefined;
      // Sondes and their tracks: diffed per sonde, only when the inputs changed at all.
      const inputs = [sondes, selected, query, phaseFilter, typeFilter];
      if (!lastSondeInputs.every((v, i) => v === inputs[i]) || lastSondeInputs.length === 0) {
        lastSondeInputs = inputs;
        const visible = makeVisible(query, phaseFilter, typeFilter);
        const points = new Map<string, Entry>();
        const lines = new Map<string, Entry>();
        for (const so of Object.values(sondes)) {
          const isSel = so.serial === selected;
          if (!isSel && !visible(so)) continue;
          points.set(so.serial, { deps: [so, isSel], build: () => sondeFeature(so, isSel) });
          if (!isSel && so.track.length >= 2) lines.set(so.serial, { deps: trackDeps(so), build: () => trackFeature(so) });
        }
        sondesSrc.sync(points);
        tracksSrc.sync(lines);
        placeSelectionRing(sel);
      }
      setData('track-selected', [sel, sel?.track.length], () => selectedTrackFC(sel));
      setData('pred-paths', [predictions, selected, L.allPredictions, sondes], () =>
        predictionPathsFC(predictions, sondes, selected, L.allPredictions),
      );
      setData('pred-points', [predictions, selected, L.landings, sondes], () => predictionPointsFC(predictions, sondes, selected, L.landings));
      setData('burst', [sel], () => burstFC(sel));
      setData('reverse', [sel, selected ? reverse[selected] : undefined], () => reverseFC(selected ? reverse[selected] : undefined, sel));
      setData('site-paths', [siteOverlay?.forecasts], () => sitePathsFC(siteOverlay?.forecasts ?? []));
      setData('site-points', [siteOverlay?.forecasts, siteOverlay?.past], () => sitePointsFC(siteOverlay?.forecasts ?? [], siteOverlay?.past ?? []));
      setData('links', [sel, L.receiverLinks, listeners], () => (L.receiverLinks ? receiverLinksFC(sel, listeners, now) : EMPTY));
      setData('listeners', [listeners, L.listeners, L.chase, Math.floor(now / 60000)], () => listenersFC(listeners, L.listeners, L.chase, now));
      setData('sites', [sites, L.sites], () => (L.sites ? sitesFC(sites) : EMPTY));
      setData('recoveries', [recoveries, L.recoveries], () => (L.recoveries ? recoveriesFC(recoveries, sondes) : EMPTY));
      const alerts = settings.alerts;
      setData('alert-radius', [userLocation?.lat, userLocation?.lon, alerts.enabled, alerts.radiusKm], () =>
        userLocation && alerts.enabled
          ? {
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  geometry: { type: 'Polygon', coordinates: [circleRing(userLocation.lon, userLocation.lat, alerts.radiusKm * 1000)] },
                  properties: {},
                },
              ],
            }
          : EMPTY,
      );
      setData('me', [userLocation], () =>
        userLocation
          ? {
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  geometry: { type: 'Point', coordinates: [userLocation.lon, userLocation.lat] },
                  // Accuracy circle radius in px at z0 and z20 (512 px tiles: 78 271.5 m/px at z0 on the equator).
                  properties: accuracyRadii(userLocation.accuracy, userLocation.lat),
                },
              ],
            }
          : EMPTY,
      );
      // Dim other flights while one is selected (only touch the style when it actually changes).
      if (map.getLayer('tracks-line') && dimmed !== !!selected) {
        dimmed = !!selected;
        map.setPaintProperty('tracks-line', 'line-opacity', trackOpacity(dimmed));
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(sync);
    };

    // Some basemap styles reference sprite images they don't ship: register a blank one instead of logging warnings.
    map.setMissingStyleImageResolver((id) => {
      if (!map.hasImage(id)) map.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
    });

    map.on('style.load', () => {
      installOverlays(map, basemapDark);
      synced = {};
      sondesSrc.reset();
      tracksSrc.reset();
      lastSondeInputs = [];
      dimmed = false;
      sync();
    });

    // Selection ring: a DOM marker animated in CSS, so the map itself doesn't need to repaint every frame.
    const ringEl = document.createElement('div');
    ringEl.className = 'sel-ring';
    const ring = new Marker({ element: ringEl, pitchAlignment: 'map', rotationAlignment: 'map' });
    let ringOn = false;
    function placeSelectionRing(sel: { last: { lon: number; lat: number } } | undefined) {
      if (sel) {
        ring.setLngLat([sel.last.lon, sel.last.lat]);
        if (!ringOn) ring.addTo(map);
        ringOn = true;
      } else if (ringOn) {
        ring.remove();
        ringOn = false;
      }
    }

    // Hovering a sonde (on the map or in the list) highlights its track.
    const unsubHover = useStore.subscribe((s, prev) => {
      if (s.hovered !== prev.hovered && map.getLayer('track-hover')) {
        map.setFilter('track-hover', ['==', ['get', 'serial'], s.hovered ?? '']);
      }
    });

    const unsub = useStore.subscribe(schedule);

    // Basemap changes.
    const unsubSettings = useStore.subscribe((s, prev) => {
      if (s.settings.basemap !== prev.settings.basemap) {
        const b = basemapById(s.settings.basemap);
        basemapDark = b.dark;
        map.setStyle(b.style, { diff: false });
      }
    });

    // Camera requests from the UI.
    const unsubFly = useStore.subscribe((s, prev) => {
      if (s.flyTo && s.flyTo !== prev.flyTo) {
        map.flyTo({ center: [s.flyTo.lon, s.flyTo.lat], zoom: s.flyTo.zoom ?? Math.max(map.getZoom(), 9), speed: 1.6, essential: true });
      }
    });

    const replayEl = document.createElement('div');
    replayEl.className = 'replay-dot';
    const replayMarker = new Marker({ element: replayEl });
    let replayOn = false;
    let replayPaintAt = 0;
    const setTrackOpacity = (t: number | null) => {
      for (const [id, full] of [
        ['track-selected-line', 1],
        ['track-selected-casing', 0.8],
      ] as const) {
        if (!map.getLayer(id)) continue;
        map.setPaintProperty(id, 'line-opacity', t === null ? full : (['case', ['<=', ['get', 't0'], t], full, full * 0.2] as ExpressionSpecification));
      }
    };
    const applyReplay = (s: ReturnType<typeof useStore.getState>, force = false) => {
      const r = s.replay;
      const sonde = r && s.selected === r.serial ? s.sondes[r.serial] : undefined;
      const pos = r && sonde ? trackAt(sonde.track, r.t * 1000) : null;
      if (!r || !pos) {
        if (replayOn) {
          replayMarker.remove();
          replayOn = false;
          setTrackOpacity(null);
        }
        return;
      }
      replayMarker.setLngLat(pos);
      if (!replayOn) replayMarker.addTo(map);
      replayOn = true;
      const nowMs = performance.now();
      if (force || !r.playing || nowMs - replayPaintAt > 150) {
        replayPaintAt = nowMs;
        setTrackOpacity(r.t);
      }
      if (s.follow) map.jumpTo({ center: pos });
    };
    const unsubReplay = useStore.subscribe((s, prev) => {
      if (s.replay !== prev.replay || s.selected !== prev.selected || (s.replay && s.follow !== prev.follow)) applyReplay(s);
    });
    map.on('style.load', () => {
      replayPaintAt = 0;
      if (replayOn) applyReplay(useStore.getState(), true);
    });

    // Follow mode: keep the selected sonde centred.
    const unsubFollow = useStore.subscribe((s, prev) => {
      if (!s.follow || !s.selected) return;
      if (s.replay?.serial === s.selected) return;
      const cur = s.sondes[s.selected];
      if (!cur || (cur === prev.sondes[s.selected] && s.follow === prev.follow)) return;
      map.easeTo({ center: [cur.last.lon, cur.last.lat], duration: 900 });
    });

    // Stop following as soon as the user drags the map.
    map.on('dragstart', () => {
      if (useStore.getState().follow) useStore.getState().setFollow(false);
    });

    // Interactions -----------------------------------------------------------
    const selectFromEvent = (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      const serial = f?.properties?.serial as string | undefined;
      if (serial) useStore.getState().select(serial);
    };
    map.on('click', SONDE_LAYERS, selectFromEvent);
    map.on('click', 'tracks-line', selectFromEvent);
    map.on('click', 'pred-points-icons', selectFromEvent);

    const popup = new Popup({ closeButton: true, maxWidth: '280px', className: 'st-popup', offset: 14 });
    const hoverPopup = new Popup({ closeButton: false, closeOnClick: false, className: 'st-popup st-hover', offset: 18 });

    map.on('click', LISTENER_LAYERS, (e: MapLayerMouseEvent) => {
      const callsign = e.features?.[0]?.properties?.callsign as string;
      if (callsign && useStore.getState().listeners[callsign]) useStore.getState().selectListener(callsign);
    });

    map.on('click', 'sites-icons', (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id as string;
      if (id) useStore.getState().selectSite(id);
    });

    map.on('click', 'site-past-dots', (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      const p = f?.properties;
      if (!f || !p || f.geometry.type !== 'Point') return;
      const units = useStore.getState().settings.units;
      const when = new Date(Number(p.time)).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      popup
        .setLngLat(f.geometry.coordinates as [number, number])
        .setHTML(
          `<div class="pp-title">${esc(String(p.serial))}</div><div class="pp-row">Lâchée ${esc(when)}</div><div class="pp-row">Éclatement à ${fmtAltShort(Number(p.top), units)}</div><div class="pp-row muted">Dernier signal à ${fmtAlt(Number(p.alt), units)}</div>`,
        )
        .addTo(map);
    });

    map.on('click', 'recoveries-icons', (e: MapLayerMouseEvent) => {
      const serial = e.features?.[0]?.properties?.serial as string;
      const r = useStore.getState().recoveries[serial];
      if (!r) return;
      const rows = [
        r.recovered ? 'Récupérée' : r.planned ? 'Récupération prévue' : 'Non retrouvée',
        r.recoveredBy && `Par ${esc(r.recoveredBy)}`,
        `Signalé ${ago(r.datetime)}`,
        r.description && `<em>${esc(r.description)}</em>`,
      ].filter(Boolean);
      popup
        .setLngLat([r.lon, r.lat])
        .setHTML(`<div class="pp-title">${esc(r.serial)}</div>${rows.map((x) => `<div class="pp-row">${x}</div>`).join('')}`)
        .addTo(map);
    });

    map.on('mousemove', SONDE_LAYERS, (e: MapLayerMouseEvent) => {
      const p = e.features?.[0]?.properties;
      if (!p) return;
      const s = useStore.getState().sondes[p.serial as string];
      if (!s) return;
      useStore.getState().setHovered(s.serial);
      const units = useStore.getState().settings.units;
      hoverPopup
        .setLngLat([s.last.lon, s.last.lat])
        .setHTML(
          `<div class="pp-title">${esc(s.serial)}</div><div class="pp-row">${esc(s.subtype ?? s.type ?? '')} · ${fmtAlt(s.last.alt, units)}</div><div class="pp-row muted">${ago(s.lastTime)}</div>`,
        )
        .addTo(map);
    });
    map.on('mouseleave', SONDE_LAYERS, () => {
      hoverPopup.remove();
      useStore.getState().setHovered(null);
    });

    for (const id of INTERACTIVE) {
      map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
    }

    // Keep the view in the URL so links reopen the same place.
    map.on('moveend', () => writeHashView(map));

    return () => {
      window.removeEventListener('resize', applyPadding);
      unsub();
      unsubSettings();
      unsubFly();
      unsubFollow();
      unsubHover();
      unsubReplay();
      replayMarker.remove();
      ring.remove();
      if (frame) cancelAnimationFrame(frame);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // MapLibre's own CSS forces `position: relative` on the map element, so position a wrapper instead.
  return (
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" />
    </div>
  );
}

function accuracyRadii(metres: number, lat: number) {
  const r0 = metres / (78271.5 * Math.cos((lat * Math.PI) / 180));
  return { r0, r20: r0 * 2 ** 20 };
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Hash format: #s=SERIAL&map=lat,lon,zoom */
export function parseHash(): URLSearchParams {
  return new URLSearchParams(window.location.hash.replace(/^#!?/, ''));
}

function parseHashView(): { center: [number, number]; zoom: number } | null {
  const v = parseHash().get('map');
  if (!v) return null;
  const [lat, lon, z] = v.split(',').map(Number);
  if (![lat, lon, z].every(Number.isFinite)) return null;
  return { center: [lon, lat], zoom: z };
}

function writeHashView(map: MlMap) {
  const p = parseHash();
  const c = map.getCenter();
  p.set('map', `${c.lat.toFixed(4)},${c.lng.toFixed(4)},${map.getZoom().toFixed(2)}`);
  history.replaceState(null, '', `#${p.toString().replace(/%2C/g, ',')}`);
}

export function getMap(): MlMap | undefined {
  return (window as unknown as { __map?: MlMap }).__map;
}
