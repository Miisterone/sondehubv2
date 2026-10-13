import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import type { Feature } from 'geojson';

export interface Entry {
  /** Values compared by identity: the feature is rebuilt only when one of them changes. */
  deps: unknown[];
  build: () => Feature;
}

const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Keeps a GeoJSON source (declared with `promoteId`) in step with a keyed collection,
 * sending only the features that changed through `updateData` instead of re-serialising
 * and re-tiling the whole collection every second.
 */
export class IncrementalSource {
  private deps = new Map<string, unknown[]>();
  private ready = false;

  constructor(
    private map: MlMap,
    private id: string,
  ) {}

  /** Call after a style reload: the source was recreated empty. */
  reset() {
    this.deps.clear();
    this.ready = false;
  }

  sync(entries: Map<string, Entry>) {
    const src = this.map.getSource(this.id) as GeoJSONSource | undefined;
    if (!src) return;

    if (!this.ready) {
      const features: Feature[] = [];
      for (const [key, e] of entries) {
        features.push(e.build());
        this.deps.set(key, e.deps);
      }
      src.setData({ type: 'FeatureCollection', features });
      this.ready = true;
      return;
    }

    const add: Feature[] = [];
    const remove: string[] = [];
    for (const [key, e] of entries) {
      const prev = this.deps.get(key);
      if (prev && same(prev, e.deps)) continue;
      if (prev) remove.push(key);
      add.push(e.build());
      this.deps.set(key, e.deps);
    }
    for (const key of this.deps.keys()) {
      if (!entries.has(key)) {
        remove.push(key);
        this.deps.delete(key);
      }
    }
    if (add.length || remove.length) void src.updateData({ remove, add });
  }
}
