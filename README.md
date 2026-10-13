# SondeHub V2

Suivi en temps réel des radiosondes météo, construit sur les données ouvertes de [SondeHub](https://sondehub.org).
Une réinterprétation moderne de [sondehub-tracker](https://github.com/projecthorus/sondehub-tracker) : carte vectorielle fluide,
panneau de détail clair, graphiques, thème clair/sombre et interface mobile.

## Démarrer

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # build statique dans dist/ (hébergeable n'importe où : Netlify, Vercel, GitHub Pages, nginx…)
npm run preview    # sert le build
```

Aucune clé d'API ni backend : l'application parle directement à l'API publique SondeHub (CORS ouvert).

## Fonctionnalités

**Carte**
- MapLibre GL, 6 fonds (Nuit, Plan, Clair, Satellite, Relief, OSM), relief 3D optionnel, vue de départ sur la région du visiteur (fuseau horaire).
- Icônes illustrées par phase de vol (ballon, parachute, au sol, signal perdu) avec flèche de cap ; sondes au sol réduites à des points en vue large.
- Sonde sélectionnée : trajectoire colorée par altitude, trajectoire prédite, éclatement prévu/réel, liens vers les récepteurs.
- Mises à jour incrémentales (seules les sondes modifiées sont renvoyées au moteur), animation de sélection en CSS.

**Temps réel**
- Flux MQTT-over-WebSocket de SondeHub (`batch`, `prediction/#`, `listener/#`, `recovery/#`), appliqué une fois par seconde.
- Avis de perte / retour de connexion.

**Interface (shadcn/ui)**
- Liste : recherche, filtres par phase, tri, favoris « Suivies » épinglés, mode **Près de moi** (sondes et atterrissages prévus dans un rayon de 25 à 200 km), navigation clavier.
- Fiche sonde : résumé en langage clair, prédiction d'atterrissage avec compte à rebours et menu **Naviguer** (Google Maps, Waze, Plans, OSM), graphiques (altitude, sondage T°/HR, vitesse verticale), récepteurs avec SNR, bulles d'aide ⓘ sur le jargon.
- **Alertes d'atterrissage** près de vous et pour les sondes suivies (toasts + notifications système).
- **Signaler une récupération** directement sur SondeHub (publication publique, après confirmation).
- Palette de commandes **⌘K / Ctrl K** : sondes, stations, sites, actions.
- Carte de bienvenue à la première visite, FAQ, thème clair/sombre, unités métriques/impériales, partage natif, export KML/CSV.
- Mobile : tiroir à 3 hauteurs (vaul).

## Architecture

```
src/
  lib/api.ts        appels REST SondeHub + normalisation
  lib/live.ts       client MQTT temps réel (tampon 1 s)
  lib/mapData.ts    construction des GeoJSON pour la carte
  lib/icons.ts      icônes dessinées en canvas (HiDPI), couleurs
  store/useStore.ts état global (zustand) : sondes, prédictions, réglages
  lib/alerts.ts     alertes d'atterrissage (activation, permissions)
  lib/geolocation.ts position de l'utilisateur partagée
  components/       MapView, Sidebar, SondeDetail, CommandPalette, Notifiers, RecoveryDialog…
  components/ui/    composants shadcn/ui
```

Endpoints utilisés (`https://api.v2.sondehub.org`) : `/sondes/telemetry?duration=` , `/sondes/telemetry?serial=`,
`/predictions`, `/listeners/telemetry?duration=1d`, `/sites`, `/recovered?last=`, `PUT /recovered` (signalements) — et `wss://ws-reader.v2.sondehub.org/`.

## Crédits

Données : SondeHub / Project Horus. Prédictions : Tawhiri (CUSF). Fonds : OpenFreeMap, OpenStreetMap, Esri, OpenTopoMap.
Projet indépendant, non affilié à SondeHub.
