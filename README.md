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

Aucune clé d'API : l'application parle directement à l'API publique SondeHub (CORS ouvert). Deux petites fonctions Vercel (`api/`)
lisent les archives S3 de SondeHub pour l'historique ; `npm run dev` et `npm run preview` les servent aussi en local. Sur un hébergement
purement statique, l'historique par site lit S3 en direct et seuls les vols des 3 derniers jours s'ouvrent en détail.

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
- **Historique** : vols des 7 ou 30 derniers jours autour de votre position ou du centre de la carte, résumé de la zone (éclatement médian, direction et distance de retombée), points de chute sur la carte ; chaque vol, même ancien, s'ouvre dans la fiche complète et par lien direct.
- **Prochains lâchers** : stations à moins de 400 km triées par heure de lâcher estimée (onglet Près de moi, et liste En vol vide).
- **Rejouer le vol** : lecture accélérée (×60, ×300, ×1200) ou curseur, marqueur sur la carte, tracé parcouru mis en avant, suivi caméra.
- **Émagramme Skew-T** : température, point de rosée, particule de surface, adiabatiques sèches et humides, rapport de mélange, barbules de vent ; pression mesurée ou recalculée (hypsométrie) quand la sonde n'a pas de capteur ; dépiquage des trames incohérentes entre stations.
- **Indices** : CAPE, CIN, LI, K, Total Totals, LCL, isotherme 0 °C, eau précipitable, tropopause, cisaillement 0–1 et 0–6 km.
- **Vent en altitude** : vent moyen par couche de 250 m déduit du déplacement GPS, profil vitesse/direction et hodographe.
- **Fiabilité de la prévision** : historique des prédictions d'atterrissage pendant la session et écart dans le temps.
- **Fiche station** : sondes captées, portée max, SNR, élévation minimale, diagramme polaire de couverture (depuis la carte, la fiche sonde ou ⌘K).
- **Alertes** dans l'app, réglées depuis l'onglet Près de moi : atterrissages, lâchers détectés et lâchers prévus dans le rayon, éclatement et atterrissage imminent des favoris.
- **Signaler une récupération** directement sur SondeHub (publication publique, après confirmation).
- Palette de commandes **⌘K / Ctrl K** : sondes, stations, sites, actions.
- **Visite guidée** en 9 étapes à la première visite : projecteur sur chaque zone (carte, listes, recherche, fiche, vue 3D, outils, Nouveautés, alertes), choix de la langue, bouton Passer ; relançable depuis « À propos et aide », ⌘K ou Nouveautés.
- FAQ, thème clair/sombre, unités métriques/impériales, partage natif, export KML/CSV.
- **Nouveautés** : menu dans l'en-tête (et ⌘K) listant les dernières fonctionnalités par date, avec pastille tant qu'il reste des entrées non lues et raccourcis pour les essayer.
- Mobile : tiroir à 3 hauteurs (vaul).

## Architecture

```
src/
  lib/api.ts        appels REST SondeHub + normalisation
  lib/live.ts       client MQTT temps réel (tampon 1 s)
  lib/mapData.ts    construction des GeoJSON pour la carte
  lib/icons.ts      icônes dessinées en canvas (HiDPI), couleurs
  store/useStore.ts état global (zustand) : sondes, prédictions, réglages
  lib/alerts.ts     alertes (activation, permissions)
  lib/geolocation.ts position de l'utilisateur partagée
  lib/watchPoint.ts lieu choisi à la place du GPS (recherche, coordonnées, centre de référence)
  lib/atmo.ts       thermodynamique : profil, pression, adiabatiques, indices, vent par couche
  lib/flight.ts     données de vol pour les graphiques, interpolation du replay
  lib/history.ts    historique : vols par site, derniers signaux récents, chargement d'un vol passé
  lib/whatsNew.ts   entrées du menu Nouveautés et suivi des entrées lues (localStorage)
api/
  site-flights.ts   vols d'un site de lâcher sur 31 jours (résumés S3, cache CDN 30 min)
  flight.ts         vol archivé complet, dédoublonné et allégé (cache CDN long)
  components/       MapView, Sidebar, SondeDetail, CommandPalette, Notifiers, RecoveryDialog…
  components/ui/    composants shadcn/ui
```

Endpoints utilisés (`https://api.v2.sondehub.org`) : `/sondes/telemetry?duration=` , `/sondes/telemetry?serial=`,
`/predictions`, `/listeners/telemetry?duration=1d`, `/sites`, `/sondes?lat=&lon=&distance=&last=`, `/recovered?last=`, `PUT /recovered` (signalements)
— et `wss://ws-reader.v2.sondehub.org/`. Archives : `https://sondehub-history.s3.amazonaws.com` (`launchsites/`, `serial/`).

## Référencement

- Une URL par langue (`/fr/`, `/en/`, `/de/`…) générée au build par `seo/plugin.ts` : `lang`, titre, description, `canonical`,
  `hreflang`, Open Graph, Twitter et JSON-LD traduits. La racine `/` reste en détection automatique (`x-default`).
- Chaque page contient un écran d'accueil statique traduit (`seo/content.ts`), lisible sans JavaScript, remplacé au démarrage de l'app.
- `sitemap.xml` est généré au build ; `robots.txt` et l'image de partage (`og-image.png`) sont dans `public/`.
- L'URL de production est définie dans `SITE_URL` (`seo/plugin.ts`) et dans `public/robots.txt`.
- Ajouter une langue : l'ajouter dans `src/i18n/locales.ts`, `seo/content.ts` et la liste des redirections de `vercel.json`.

## Annoncer une nouveauté

1. Ajouter l'entrée **en tête** de `WHATS_NEW` dans `src/lib/whatsNew.ts` : `id` unique et stable, `date` (AAAA-MM-JJ), icône 3D,
   clés de titre et de texte, action facultative (`terrain`, `history`, `nearby`, `tour`).
2. Ajouter les textes dans `src/i18n/fr/whatsNew.ts` puis dans les 12 fichiers `src/i18n/locales/*.json`.
3. Si la fonctionnalité change l'interface, mettre à jour la visite guidée (`src/components/Tour.tsx`, clés `app.tour.*`).

La pastille réapparaît pour les visiteurs dont la dernière entrée vue n'est plus la première de la liste ; seules les entrées
ajoutées depuis leur dernière ouverture portent le badge « Nouveau ». Un premier visiteur ne voit pas de pastille.

## Crédits

Données : SondeHub / Project Horus. Prédictions : Tawhiri (CUSF). Fonds : OpenFreeMap, OpenStreetMap, Esri, OpenTopoMap. Relief 3D : Mapterhorn.
Projet indépendant, non affilié à SondeHub.
