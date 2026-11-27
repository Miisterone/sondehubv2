import type { Prediction, Sonde } from './types';
import { t } from '@/i18n';

function save(name: string, mime: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const cell = (v: number) => (Number.isFinite(v) ? String(v) : '');

export function downloadCSV(s: Sonde) {
  const rows = ['datetime_utc,lat,lon,alt_m,temp_c,humidity_pct,vel_v_ms,pressure_hpa'];
  for (const p of s.track) {
    rows.push([new Date(p[3]).toISOString(), p[1].toFixed(6), p[0].toFixed(6), p[2].toFixed(1), cell(p[4]), cell(p[5]), cell(p[6]), cell(p[7])].join(','));
  }
  save(`${s.serial}.csv`, 'text/csv', rows.join('\n'));
}

const xml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);

export function downloadGPX(s: Sonde) {
  const points = s.track
    .map((p) => {
      const ext = [Number.isFinite(p[4]) ? `<gpxtpx:atemp>${p[4]}</gpxtpx:atemp>` : '', Number.isFinite(p[5]) ? `<gpxtpx:hr>${p[5]}</gpxtpx:hr>` : ''].join('');
      return `      <trkpt lat="${p[1].toFixed(6)}" lon="${p[0].toFixed(6)}"><ele>${p[2].toFixed(1)}</ele><time>${new Date(p[3]).toISOString()}</time>${
        ext ? `<extensions><gpxtpx:TrackPointExtension>${ext}</gpxtpx:TrackPointExtension></extensions>` : ''
      }</trkpt>`;
    })
    .join('\n');
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="SondeHub V2" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <metadata><name>${xml(s.serial)}</name><time>${new Date(s.track[0]?.[3] ?? s.lastTime).toISOString()}</time></metadata>
  <trk>
    <name>${xml(t('lib.export.track', { serial: s.serial }))}</name>
    <type>${xml(s.subtype ?? s.type ?? 'radiosonde')}</type>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>`;
  save(`${s.serial}.gpx`, 'application/gpx+xml', gpx);
}

export function downloadKML(s: Sonde, pred?: Prediction) {
  const coords = s.track.map((p) => `${p[0]},${p[1]},${p[2].toFixed(0)}`).join(' ');
  const predCoords = pred?.path.map((p) => `${p.lon},${p.lat},${p.alt.toFixed(0)}`).join(' ');
  const landing = pred?.landing;
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${xml(s.serial)}</name>
  <Style id="track"><LineStyle><color>fff8bd38</color><width>3</width></LineStyle></Style>
  <Style id="pred"><LineStyle><color>ff8571fb</color><width>2</width></LineStyle></Style>
  <Placemark><name>${xml(t('lib.export.track', { serial: s.serial }))}</name><styleUrl>#track</styleUrl>
    <LineString><altitudeMode>absolute</altitudeMode><coordinates>${coords}</coordinates></LineString></Placemark>
  <Placemark><name>${xml(t('lib.export.lastPosition', { serial: s.serial }))}</name>
    <Point><altitudeMode>absolute</altitudeMode><coordinates>${s.last.lon},${s.last.lat},${s.last.alt.toFixed(0)}</coordinates></Point></Placemark>
${
  predCoords
    ? `  <Placemark><name>${xml(t('lib.export.prediction'))}</name><styleUrl>#pred</styleUrl>
    <LineString><altitudeMode>absolute</altitudeMode><coordinates>${predCoords}</coordinates></LineString></Placemark>`
    : ''
}
${landing ? `  <Placemark><name>${xml(t('lib.export.landing'))}</name><Point><coordinates>${landing.lon},${landing.lat},0</coordinates></Point></Placemark>` : ''}
</Document>
</kml>`;
  save(`${s.serial}.kml`, 'application/vnd.google-earth.kml+xml', kml);
}
