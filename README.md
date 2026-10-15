# SondeHub V2

Suivi en temps réel des radiosondes météo, construit sur les données ouvertes de [SondeHub](https://sondehub.org).
Une réinterprétation moderne de [sondehub-tracker](https://github.com/projecthorus/sondehub-tracker) : carte vectorielle fluide,
panneau de détail clair, graphiques, thème clair/sombre et interface mobile.

> **Projet entièrement vibecodé** : tout le code a été généré par IA.

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
- MapLibre GL, 6 fonds (Nuit, Plan, Clair, Satellite, Relief, OSM), vue de départ sur la région du visiteur (fuseau horaire).
- Icônes illustrées par phase de vol (ballon, parachute, au sol, signal perdu) avec flèche de cap ; sondes au sol réduites à des points en vue large.
- Sonde sélectionnée : trajectoire colorée par altitude, trajectoire prédite, éclatement prévu/réel, liens vers les récepteurs.
- Mises à jour incrémentales (seules les sondes modifiées sont renvoyées au moteur), animation de sélection en CSS.

**Temps réel**
- Flux MQTT-over-WebSocket de SondeHub (`batch`, `prediction/#`, `listener/#`, `recovery/#`), appliqué une fois par seconde.
- Avis de perte / retour de connexion.

**Interface (shadcn/ui)**
- Liste : recherche, filtres par phase, tri, favoris « Suivies » épinglés, mode **Près de moi** (sondes et atterrissages prévus dans un rayon de 25 à 200 km, autour de la position GPS ou d'un lieu choisi : recherche Photon, coordonnées GPS ou point sur la carte), navigation clavier.
- Fiche sonde : résumé en langage clair, prédiction d'atterrissage avec compte à rebours et menu **Naviguer** (Google Maps, Waze, Plans, OSM), graphiques (altitude, sondage T°/HR, vitesse verticale), récepteurs avec SNR, bulles d'aide ⓘ sur le jargon.
- **Prochains lâchers** : stations à moins de 400 km triées par heure de lâcher estimée (onglet Près de moi, et liste En vol vide).
- **Rejouer le vol** : lecture accélérée (×60, ×300, ×1200) ou curseur, marqueur sur la carte, tracé parcouru mis en avant, suivi caméra.
- **Émagramme Skew-T** : température, point de rosée, particule de surface, adiabatiques sèches et humides, rapport de mélange, barbules de vent ; pression mesurée ou recalculée (hypsométrie) quand la sonde n'a pas de capteur ; dépiquage des trames incohérentes entre stations.
- **Indices** : CAPE, CIN, LI, K, Total Totals, LCL, isotherme 0 °C, eau précipitable, tropopause, cisaillement 0–1 et 0–6 km.
- **Vent en altitude** : vent moyen par couche de 250 m déduit du déplacement GPS, profil vitesse/direction et hodographe.
- **Fiabilité de la prévision** : historique des prédictions d'atterrissage pendant la session et écart dans le temps.
- **Fiche station** : sondes captées, portée max, SNR, élévation minimale, diagramme polaire de couverture (depuis la carte, la fiche sonde ou ⌘K).
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
  lib/watchPoint.ts lieu choisi à la place du GPS (recherche, coordonnées, centre de référence)
  lib/atmo.ts       thermodynamique : profil, pression, adiabatiques, indices, vent par couche
  lib/flight.ts     données de vol pour les graphiques, interpolation du replay
  components/       MapView, Sidebar, SondeDetail, CommandPalette, Notifiers, RecoveryDialog…
  components/ui/    composants shadcn/ui
```

Endpoints utilisés (`https://api.v2.sondehub.org`) : `/sondes/telemetry?duration=` , `/sondes/telemetry?serial=`,
`/predictions`, `/listeners/telemetry?duration=1d`, `/sites`, `/recovered?last=`, `PUT /recovered` (signalements) — et `wss://ws-reader.v2.sondehub.org/`.

## Crédits

Données : SondeHub / Project Horus. Prédictions : Tawhiri (CUSF). Fonds : OpenFreeMap, OpenStreetMap, Esri, OpenTopoMap.
Projet indépendant, non affilié à SondeHub.
