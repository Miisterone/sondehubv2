import type { Locale } from '../src/i18n/locales';

export interface SeoText {
  body: string;
  loading: string;
  languages: string;
}

export const SEO_TEXT: Record<Locale, SeoText> = {
  fr: {
    body: "SondeHub V2 affiche en direct les ballons-sondes lancés chaque jour par les services météorologiques : position, altitude, vitesse, trajectoire, prévision du point d'atterrissage et stations de réception. Les données proviennent du réseau ouvert SondeHub, alimenté par des radioamateurs du monde entier.",
    loading: 'Chargement de la carte interactive… JavaScript doit être activé.',
    languages: 'Langues',
  },
  en: {
    body: 'SondeHub V2 shows the weather balloons launched every day by meteorological services on a live map: position, altitude, speed, flight path, landing prediction and receiving stations. Data comes from the open SondeHub network, fed by radio amateurs around the world.',
    loading: 'Loading the interactive map… JavaScript must be enabled.',
    languages: 'Languages',
  },
  de: {
    body: 'SondeHub V2 zeigt die täglich von Wetterdiensten gestarteten Wetterballons live auf einer Karte: Position, Höhe, Geschwindigkeit, Flugbahn, Landevorhersage und Empfangsstationen. Die Daten stammen aus dem offenen SondeHub-Netz, das von Funkamateuren weltweit gespeist wird.',
    loading: 'Interaktive Karte wird geladen… JavaScript muss aktiviert sein.',
    languages: 'Sprachen',
  },
  es: {
    body: 'SondeHub V2 muestra en directo los globos sonda que los servicios meteorológicos lanzan cada día: posición, altitud, velocidad, trayectoria, predicción del punto de aterrizaje y estaciones receptoras. Los datos proceden de la red abierta SondeHub, alimentada por radioaficionados de todo el mundo.',
    loading: 'Cargando el mapa interactivo… JavaScript debe estar activado.',
    languages: 'Idiomas',
  },
  it: {
    body: 'SondeHub V2 mostra in diretta i palloni sonda lanciati ogni giorno dai servizi meteorologici: posizione, altitudine, velocità, traiettoria, previsione del punto di atterraggio e stazioni riceventi. I dati provengono dalla rete aperta SondeHub, alimentata da radioamatori di tutto il mondo.',
    loading: 'Caricamento della mappa interattiva… JavaScript deve essere attivato.',
    languages: 'Lingue',
  },
  nl: {
    body: 'SondeHub V2 toont de weerballonnen die weerdiensten dagelijks oplaten live op een kaart: positie, hoogte, snelheid, traject, landingsvoorspelling en ontvangststations. De gegevens komen van het open SondeHub-netwerk, gevoed door radioamateurs over de hele wereld.',
    loading: 'Interactieve kaart wordt geladen… JavaScript moet ingeschakeld zijn.',
    languages: 'Talen',
  },
  pl: {
    body: 'SondeHub V2 pokazuje na żywo balony meteorologiczne wypuszczane codziennie przez służby meteorologiczne: położenie, wysokość, prędkość, trajektorię, prognozę miejsca lądowania i stacje odbiorcze. Dane pochodzą z otwartej sieci SondeHub, zasilanej przez krótkofalowców z całego świata.',
    loading: 'Ładowanie interaktywnej mapy… JavaScript musi być włączony.',
    languages: 'Języki',
  },
  cs: {
    body: 'SondeHub V2 zobrazuje živě meteorologické balony, které meteorologické služby vypouštějí každý den: polohu, výšku, rychlost, trajektorii, předpověď místa přistání a přijímací stanice. Data pocházejí z otevřené sítě SondeHub, kterou napájejí radioamatéři z celého světa.',
    loading: 'Načítání interaktivní mapy… JavaScript musí být povolen.',
    languages: 'Jazyky',
  },
  pt: {
    body: 'O SondeHub V2 mostra em direto os balões meteorológicos lançados todos os dias pelos serviços de meteorologia: posição, altitude, velocidade, trajetória, previsão do local de aterragem e estações recetoras. Os dados vêm da rede aberta SondeHub, alimentada por radioamadores de todo o mundo.',
    loading: 'A carregar o mapa interativo… O JavaScript tem de estar ativado.',
    languages: 'Idiomas',
  },
  sv: {
    body: 'SondeHub V2 visar de väderballonger som vädertjänster skickar upp varje dag live på en karta: position, höjd, hastighet, bana, landningsprognos och mottagarstationer. Datan kommer från det öppna SondeHub-nätverket, som matas av radioamatörer över hela världen.',
    loading: 'Laddar den interaktiva kartan… JavaScript måste vara aktiverat.',
    languages: 'Språk',
  },
  ja: {
    body: 'SondeHub V2 は、各国の気象機関が毎日放球するラジオゾンデをライブマップに表示します。位置、高度、速度、飛行経路、着地予測、受信局を確認できます。データは世界中のアマチュア無線家が支えるオープンな SondeHub ネットワークから取得しています。',
    loading: 'インタラクティブマップを読み込み中… JavaScript を有効にしてください。',
    languages: '言語',
  },
  zh: {
    body: 'SondeHub V2 在实时地图上显示各国气象部门每天施放的探空气球：位置、高度、速度、飞行轨迹、落点预测和接收站。数据来自由全球业余无线电爱好者支持的开放 SondeHub 网络。',
    loading: '正在加载交互式地图… 请启用 JavaScript。',
    languages: '语言',
  },
  ru: {
    body: 'SondeHub V2 показывает на карте в реальном времени метеозонды, которые метеослужбы запускают каждый день: положение, высоту, скорость, траекторию, прогноз места посадки и приёмные станции. Данные поступают из открытой сети SondeHub, которую поддерживают радиолюбители со всего мира.',
    loading: 'Загрузка интерактивной карты… Необходимо включить JavaScript.',
    languages: 'Языки',
  },
};
