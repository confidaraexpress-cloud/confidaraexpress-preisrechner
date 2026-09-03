// Regressions-Fixture der Angebotsfilterung — 41 Tarife aus EINER echten,
// belegten `/api/jumingo/calculate-price`-Antwort (DE→DE, 3 kg, 10×10×10 cm,
// Versanddatum 2026-08-28, serviceFilter/shippingModeFilter beide "all").
//
// Seit der Uhrzeit-Erweiterung tragen die Zeilen zusätzlich `deliveryTimeUntil`
// und `deliveryTimeUntilMinutes` — beide unverändert aus derselben Antwort. Die
// Verteilung ist die gemessene: 19 Tarife tragen den generischen Tagesendwert
// (17:00/18:00), 22 eine konkrete Produktzeit (08:00–13:00), dazwischen liegt
// kein Wert. Keine Zeit ist erfunden oder gerundet.
//
// Reduziert auf GENAU die Felder, die die Ergebnisfilter lesen — es sind keine
// Adress-, Konto-, Preis-Einkaufs- oder Providerdaten enthalten, keine IDs
// jenseits der öffentlichen Tarifkennung.
//
// Diese Liste hält den im Audit gemessenen Fall fest: mit
// `latestDeliveryDate = "2026-08-31"` bleiben davon 21 Tarife übrig, und die
// Oberfläche behauptete trotzdem „41 Angebote gefunden". Bewusst der ECHTE
// Datenstand statt einer erfundenen Miniaturliste: die entscheidende
// Eigenschaft — Shopabgabe-Tarife (dropoff) tragen durchgängig ein um ein bis
// zwei Tage späteres `deliveryDateMax` als die Abholtarife — hätte eine
// handgeschriebene Fixture nicht zwingend getroffen.
// ─── Der Zeitpunkt, zu dem diese Antwort gemessen wurde ──────────────────────
//
// Die Tarife tragen ABSOLUTE Zustelldaten (29.08. / 31.08. / 01.09. / 02.09.2026)
// — das ist der echte, belegte Datenstand und wird nicht umgeschrieben. Damit
// hängt aber jeder Test, der den Lieferdatum-Kalender BEDIENT, an einem realen
// Kalendermonat: `DateCalendar` zeigt den Monat des Versanddatums (Vorbelegung
// `todayISO()`) und deaktiviert alles davor.
//
// Genau daran ist die Browser-E2E am 01.09.2026 zerbrochen: vier Suiten klickten
// fest den Tag „31", und der September hat 30 Tage — die Zelle existierte nicht,
// jeder Klick lief 30 s in einen Timeout. Der letzte grüne main-Lauf war der
// 31.08.2026, also der letzte Tag, an dem es den Tag 31 gab.
//
// Der Ausweg ist NICHT, die Daten monatlich nachzuziehen oder „31" durch „30" zu
// ersetzen — beides wäre dieselbe Bombe mit neuem Zünddatum. Stattdessen wird die
// BROWSERZEIT auf den Messzeitpunkt fixiert (`page.clock.setFixedTime`, im Repo
// bereits für die Paketshop-Öffnungszeiten etabliert). Dann zeigt der Kalender
// verlässlich den August 2026, und die Daten unten bleiben unverändert gültig —
// unabhängig davon, welchen Tag, Monat oder welches Jahr die CI gerade hat.
//
// Mittag mit explizitem Offset, nicht Mitternacht: `setFixedTime` fixiert einen
// absoluten Zeitpunkt, den lokalen Kalendertag bildet erst die Zeitzone des
// Browsers. 12:00+02:00 (= 10:00 UTC) liegt in JEDER Zone zwischen UTC-9 und
// UTC+13 auf dem 28.08.2026; um Mitternacht kippte der Tag schon bei einer
// Stunde Versatz. Dieselbe Begründung wie bei `FREITAG` in
// `tests/fixtures/accessPointsDpd.mjs`.
export const VERSANDZEITPUNKT = "2026-08-28T12:00:00+02:00";

// Die Lieferfrist, auf die die Ergebnisfilter-Tests einschränken: Versandtag + 3.
// `deliveryDateMax <= LIEFERFRIST_ISO` trifft 4 + 17 = 21 der 41 Tarife.
export const LIEFERFRIST_ISO = "2026-08-31";

// Derselbe Tag als Kalenderzelle. Die E2E-Suiten klicken AUSSCHLIESSLICH über
// diese Konstante — eine abgeschriebene „31" in einer einzelnen Testdatei wäre
// genau das Copy/Paste-Datum, das diese Bombe erzeugt hat.
export const LIEFERFRIST_TAG = "31";

export const TARIFE_41 = [
  {
    "id": "s-2036",
    "netPrice": 5.71,
    "serviceType": "dropoff",
    "shippingMode": "standard",
    "deliveryDateMax": "2026-09-02",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "17:00",
    "deliveryTimeUntilMinutes": 1020
  },
  {
    "id": "s-1381",
    "netPrice": 10.69,
    "serviceType": "dropoff",
    "shippingMode": "standard",
    "deliveryDateMax": "2026-09-02",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "17:00",
    "deliveryTimeUntilMinutes": 1020
  },
  {
    "id": "1381",
    "netPrice": 12.84,
    "serviceType": "pickup",
    "shippingMode": "standard",
    "deliveryDateMax": "2026-09-01",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "17:00",
    "deliveryTimeUntilMinutes": 1020
  },
  {
    "id": "s-3708",
    "netPrice": 14.7,
    "serviceType": "dropoff",
    "shippingMode": "standard",
    "deliveryDateMax": "2026-09-02",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "17:00",
    "deliveryTimeUntilMinutes": 1020
  },
  {
    "id": "3262",
    "netPrice": 17.26,
    "serviceType": "pickup",
    "shippingMode": "standard",
    "deliveryDateMax": "2026-09-01",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "17:00",
    "deliveryTimeUntilMinutes": 1020
  },
  {
    "id": "3708",
    "netPrice": 17.26,
    "serviceType": "pickup",
    "shippingMode": "standard",
    "deliveryDateMax": "2026-09-01",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "17:00",
    "deliveryTimeUntilMinutes": 1020
  },
  {
    "id": "s-3298",
    "netPrice": 17.44,
    "serviceType": "dropoff",
    "shippingMode": "standard",
    "deliveryDateMax": "2026-09-02",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "17:00",
    "deliveryTimeUntilMinutes": 1020
  },
  {
    "id": "3307",
    "netPrice": 18.65,
    "serviceType": "pickup",
    "shippingMode": "express",
    "deliveryDateMax": "2026-08-31",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "18:00",
    "deliveryTimeUntilMinutes": 1080
  },
  {
    "id": "3297",
    "netPrice": 19.93,
    "serviceType": "pickup",
    "shippingMode": "standard",
    "deliveryDateMax": "2026-09-01",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "17:00",
    "deliveryTimeUntilMinutes": 1020
  },
  {
    "id": "s-3264",
    "netPrice": 23.16,
    "serviceType": "dropoff",
    "shippingMode": "express",
    "deliveryDateMax": "2026-09-01",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "17:00",
    "deliveryTimeUntilMinutes": 1020
  },
  {
    "id": "3264",
    "netPrice": 25.72,
    "serviceType": "pickup",
    "shippingMode": "express",
    "deliveryDateMax": "2026-08-31",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "17:00",
    "deliveryTimeUntilMinutes": 1020
  },
  {
    "id": "s-3266",
    "netPrice": 30.9,
    "serviceType": "dropoff",
    "shippingMode": "express",
    "deliveryDateMax": "2026-09-01",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "12:00",
    "deliveryTimeUntilMinutes": 720
  },
  {
    "id": "3283",
    "netPrice": 33,
    "serviceType": "pickup",
    "shippingMode": "standard",
    "deliveryDateMax": "2026-09-01",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "17:00",
    "deliveryTimeUntilMinutes": 1020
  },
  {
    "id": "3266",
    "netPrice": 33.46,
    "serviceType": "pickup",
    "shippingMode": "express",
    "deliveryDateMax": "2026-08-31",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "12:00",
    "deliveryTimeUntilMinutes": 720
  },
  {
    "id": "3588",
    "netPrice": 35.46,
    "serviceType": "pickup",
    "shippingMode": "standard",
    "deliveryDateMax": "2026-08-29",
    "deliveryDate": "2026-08-29",
    "deliveryTimeUntil": "17:00",
    "deliveryTimeUntilMinutes": 1020
  },
  {
    "id": "3278",
    "netPrice": 37.06,
    "serviceType": "pickup",
    "shippingMode": "express",
    "deliveryDateMax": "2026-08-31",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "17:00",
    "deliveryTimeUntilMinutes": 1020
  },
  {
    "id": "s-3257",
    "netPrice": 41.39,
    "serviceType": "dropoff",
    "shippingMode": "express",
    "deliveryDateMax": "2026-09-01",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "18:00",
    "deliveryTimeUntilMinutes": 1080
  },
  {
    "id": "3267",
    "netPrice": 41.99,
    "serviceType": "pickup",
    "shippingMode": "express",
    "deliveryDateMax": "2026-08-31",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "17:00",
    "deliveryTimeUntilMinutes": 1020
  },
  {
    "id": "4088",
    "netPrice": 41.99,
    "serviceType": "pickup",
    "shippingMode": "express",
    "deliveryDateMax": "2026-08-31",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "13:00",
    "deliveryTimeUntilMinutes": 780
  },
  {
    "id": "s-3265",
    "netPrice": 43.67,
    "serviceType": "dropoff",
    "shippingMode": "express",
    "deliveryDateMax": "2026-09-01",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "10:30",
    "deliveryTimeUntilMinutes": 630
  },
  {
    "id": "3257",
    "netPrice": 44.39,
    "serviceType": "pickup",
    "shippingMode": "express",
    "deliveryDateMax": "2026-08-31",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "18:00",
    "deliveryTimeUntilMinutes": 1080
  },
  {
    "id": "3265",
    "netPrice": 46.21,
    "serviceType": "pickup",
    "shippingMode": "express",
    "deliveryDateMax": "2026-08-31",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "10:30",
    "deliveryTimeUntilMinutes": 630
  },
  {
    "id": "3287",
    "netPrice": 46.4,
    "serviceType": "pickup",
    "shippingMode": "express",
    "deliveryDateMax": "2026-09-01",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "12:00",
    "deliveryTimeUntilMinutes": 720
  },
  {
    "id": "3279",
    "netPrice": 52.45,
    "serviceType": "pickup",
    "shippingMode": "express",
    "deliveryDateMax": "2026-08-31",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "12:00",
    "deliveryTimeUntilMinutes": 720
  },
  {
    "id": "s-3258",
    "netPrice": 59.46,
    "serviceType": "dropoff",
    "shippingMode": "express",
    "deliveryDateMax": "2026-09-01",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "12:00",
    "deliveryTimeUntilMinutes": 720
  },
  {
    "id": "3258",
    "netPrice": 62.46,
    "serviceType": "pickup",
    "shippingMode": "express",
    "deliveryDateMax": "2026-08-31",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "12:00",
    "deliveryTimeUntilMinutes": 720
  },
  {
    "id": "4087",
    "netPrice": 64.67,
    "serviceType": "pickup",
    "shippingMode": "standard",
    "deliveryDateMax": "2026-08-31",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "10:00",
    "deliveryTimeUntilMinutes": 600
  },
  {
    "id": "3587",
    "netPrice": 66.89,
    "serviceType": "pickup",
    "shippingMode": "express",
    "deliveryDateMax": "2026-08-29",
    "deliveryDate": "2026-08-29",
    "deliveryTimeUntil": "18:00",
    "deliveryTimeUntilMinutes": 1080
  },
  {
    "id": "3280",
    "netPrice": 68.58,
    "serviceType": "pickup",
    "shippingMode": "express",
    "deliveryDateMax": "2026-08-31",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "10:00",
    "deliveryTimeUntilMinutes": 600
  },
  {
    "id": "3573",
    "netPrice": 84.65,
    "serviceType": "pickup",
    "shippingMode": "express",
    "deliveryDateMax": "2026-08-29",
    "deliveryDate": "2026-08-29",
    "deliveryTimeUntil": "12:00",
    "deliveryTimeUntilMinutes": 720
  },
  {
    "id": "3281",
    "netPrice": 86.53,
    "serviceType": "pickup",
    "shippingMode": "express",
    "deliveryDateMax": "2026-08-31",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "09:00",
    "deliveryTimeUntilMinutes": 540
  },
  {
    "id": "s-3259",
    "netPrice": 95.62,
    "serviceType": "dropoff",
    "shippingMode": "express",
    "deliveryDateMax": "2026-09-01",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "10:30",
    "deliveryTimeUntilMinutes": 630
  },
  {
    "id": "3259",
    "netPrice": 98.62,
    "serviceType": "pickup",
    "shippingMode": "express",
    "deliveryDateMax": "2026-08-31",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "10:30",
    "deliveryTimeUntilMinutes": 630
  },
  {
    "id": "1016",
    "netPrice": 100.84,
    "serviceType": "pickup",
    "shippingMode": "express",
    "deliveryDateMax": "2026-08-29",
    "deliveryDate": "2026-08-29",
    "deliveryTimeUntil": "12:00",
    "deliveryTimeUntilMinutes": 720
  },
  {
    "id": "3282",
    "netPrice": 103.61,
    "serviceType": "pickup",
    "shippingMode": "express",
    "deliveryDateMax": "2026-08-31",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "08:00",
    "deliveryTimeUntilMinutes": 480
  },
  {
    "id": "3286",
    "netPrice": 129.44,
    "serviceType": "pickup",
    "shippingMode": "standard",
    "deliveryDateMax": "2026-09-01",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "17:00",
    "deliveryTimeUntilMinutes": 1020
  },
  {
    "id": "3290",
    "netPrice": 142.85,
    "serviceType": "pickup",
    "shippingMode": "express",
    "deliveryDateMax": "2026-09-01",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "12:00",
    "deliveryTimeUntilMinutes": 720
  },
  {
    "id": "s-3260",
    "netPrice": 167.92,
    "serviceType": "dropoff",
    "shippingMode": "express",
    "deliveryDateMax": "2026-09-01",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "09:00",
    "deliveryTimeUntilMinutes": 540
  },
  {
    "id": "3260",
    "netPrice": 170.92,
    "serviceType": "pickup",
    "shippingMode": "express",
    "deliveryDateMax": "2026-08-31",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "09:00",
    "deliveryTimeUntilMinutes": 540
  },
  {
    "id": "s-3268",
    "netPrice": 395.21,
    "serviceType": "dropoff",
    "shippingMode": "express",
    "deliveryDateMax": "2026-09-01",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "09:00",
    "deliveryTimeUntilMinutes": 540
  },
  {
    "id": "3268",
    "netPrice": 397.75,
    "serviceType": "pickup",
    "shippingMode": "express",
    "deliveryDateMax": "2026-08-31",
    "deliveryDate": "2026-08-31",
    "deliveryTimeUntil": "09:00",
    "deliveryTimeUntilMinutes": 540
  }
];
