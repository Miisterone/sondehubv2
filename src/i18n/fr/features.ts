export const features = {
  'app.siteTitle': '{site} — SondeHub V2',
  'app.command.glossary.keywords': 'glossaire lexique definitions vocabulaire termes',

  'sonde.data.exportGpx': 'Exporter en GPX',
  'sonde.share.instant': 'Radiosonde {serial} à {alt}, à {time}',
  'sonde.replay.shareInstant': 'Partager cet instant',

  'map.site.share': 'Partager ce site',
  'map.site.shareNext': 'Site de lâcher {site} — prochain lâcher {when}',
  'map.site.shareText': 'Site de lâcher de radiosondes : {site}',
  'map.site.nextLaunch': 'Prochain lâcher · {day}, {time}',

  'sidebar.history.recordsTitle': 'Records sur {days} jours',
  'sidebar.history.recordBurst': 'Plus haut éclatement',
  'sidebar.history.recordDrift': 'Plus longue dérive',
  'sidebar.history.recordDuration': 'Vol le plus long',
  'sidebar.history.recordRow': '{serial} · {day}',

  'charts.skewt.compareAt': '{label} : {temp} à ce niveau, soit {delta}',
  'charts.skewt.compareNone': '{label} : pas de mesure à ce niveau',
  'charts.skewt.compareLegend': 'Sondage comparé (pointillés : point de rosée)',
  'charts.compare.label': 'Comparer à un vol précédent du même site',
  'charts.compare.none': 'Sans comparaison',
  'charts.compare.option': '{day}, {time} · {serial}',
  'charts.compare.short': '{day}, {time}',
  'charts.compare.loading': 'Chargement du sondage…',
  'charts.compare.error': 'Ce vol n’a pas de sondage exploitable.',
  'charts.compare.t500': 'Temp. à 500 hPa',
  'charts.compare.note': 'Valeurs du sondage comparé ; l’écart est donné par rapport à ce vol.',

  'app.glossary.title': 'Glossaire',
  'app.glossary.intro': 'Les termes utilisés dans SondeHub V2, expliqués simplement.',
  'app.glossary.search': 'Rechercher un terme',
  'app.glossary.empty': 'Aucun terme ne correspond.',
  'app.glossary.radiosonde.term': 'Radiosonde',
  'app.glossary.radiosonde.text':
    'Petit boîtier de mesure emporté par un ballon. Il transmet par radio la température, l’humidité, la pression et sa position tout au long du vol.',
  'app.glossary.burst.term': 'Éclatement',
  'app.glossary.burst.text':
    'Moment où le ballon, dilaté par la baisse de pression, se déchire. Il survient en général entre 25 et 35 km d’altitude et marque le début de la descente.',
  'app.glossary.ascentRate.term': 'Vitesse ascensionnelle',
  'app.glossary.ascentRate.text': 'Vitesse verticale du ballon pendant la montée, le plus souvent autour de 5 m/s.',
  'app.glossary.prediction.term': 'Prévision d’atterrissage',
  'app.glossary.prediction.text':
    'Point de chute calculé à partir de la position de la sonde et des vents prévus par un modèle météo. Elle se précise à mesure que la sonde descend.',
  'app.glossary.receiver.term': 'Station de réception',
  'app.glossary.receiver.text': 'Récepteur radio, souvent tenu par un radioamateur, qui décode le signal des sondes et l’envoie au réseau SondeHub.',
  'app.glossary.utc.term': '00Z et 12Z',
  'app.glossary.utc.text':
    'Heures synoptiques, 00 h et 12 h en temps universel (UTC). La plupart des services météo lâchent leurs ballons environ une heure avant.',
  'app.glossary.hpa.term': 'Hectopascal (hPa)',
  'app.glossary.hpa.text': 'Unité de pression atmosphérique. Elle vaut environ 1 013 hPa au niveau de la mer, 500 hPa vers 5,5 km et 100 hPa vers 16 km.',
  'app.glossary.dewPoint.term': 'Point de rosée',
  'app.glossary.dewPoint.text':
    'Température à laquelle l’air doit être refroidi pour que sa vapeur d’eau condense. Plus il est proche de la température, plus l’air est humide.',
  'app.glossary.freezing.term': 'Isotherme 0 °C',
  'app.glossary.freezing.text': 'Altitude à laquelle la température passe sous 0 °C. Elle sépare la pluie de la neige en altitude.',
  'app.glossary.lcl.term': 'Niveau de condensation (LCL)',
  'app.glossary.lcl.text': 'Altitude à laquelle une particule d’air soulevée depuis le sol devient saturée. Elle donne la base théorique des cumulus.',
  'app.glossary.tropopause.term': 'Tropopause',
  'app.glossary.tropopause.text':
    'Limite entre la troposphère, où se forme la météo, et la stratosphère. La température y cesse de baisser avec l’altitude, entre 8 et 17 km selon la latitude.',
  'app.glossary.skewt.term': 'Émagramme Skew-T',
  'app.glossary.skewt.text':
    'Diagramme qui trace la température et le point de rosée selon la pression, avec des isothermes inclinées. Il sert à lire la stabilité de l’atmosphère.',
  'app.glossary.cape.term': 'CAPE',
  'app.glossary.cape.text':
    'Énergie disponible pour la convection, en J/kg. Plus elle est élevée, plus les orages peuvent être violents s’ils se déclenchent.',
  'app.glossary.shear.term': 'Cisaillement',
  'app.glossary.shear.text': 'Variation du vent en force ou en direction entre deux altitudes. Un fort cisaillement favorise les orages organisés.',

  'app.whatsNew.compare.title': 'Comparer deux sondages',
  'app.whatsNew.compare.text':
    'Dans l’onglet Atmosphère, superposez sur l’émagramme Skew-T un vol précédent du même site et lisez l’écart de température à chaque niveau.',
  'app.whatsNew.gpx.title': 'Export GPX',
  'app.whatsNew.gpx.text': 'La trace d’un vol s’exporte aussi en GPX, et le CSV contient désormais la pression.',
  'app.whatsNew.records.title': 'Records de la zone',
  'app.whatsNew.records.text': 'L’Historique affiche le plus haut éclatement, la plus longue dérive et le vol le plus long de la période.',
  'app.whatsNew.site.title': 'Sites de lâcher : compte à rebours et lien direct',
  'app.whatsNew.site.text': 'La fiche d’un site indique le temps restant avant le prochain lâcher et se partage par un lien.',
  'app.whatsNew.instant.title': 'Partager un instant du vol',
  'app.whatsNew.instant.text': 'Pendant la relecture, partagez un lien qui rouvre le vol exactement à l’instant affiché.',
  'app.whatsNew.glossary.title': 'Glossaire',
  'app.whatsNew.glossary.text': 'Tropopause, CAPE, point de rosée : les termes de l’interface sont expliqués en une phrase.',
  'app.whatsNew.glossary.action': 'Ouvrir le glossaire',
};
