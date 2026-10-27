# Offer- und Booking-Verträge des Frontends

Ausgelagert aus der Regeldatei (Stand origin/main, 2026-10-19). Wird nicht automatisch geladen. Lesen bei Arbeit an Angebot, Buchung, Sendung, Adresse, Preis, Labelformat, Absicherung, Sendungsverfolgung oder Fehlerdarstellung. Bei Widerspruch gewinnt der Canonical Context, danach der aktuelle Code.

Diese Regeln sind Frontend-spezifisch. Die **projektweiten** Provider-, Preis- und Buchbarkeitsregeln stehen im Canonical Context (§5, §6) und werden hier nicht wiederholt.

### Angebotsidentität

- `offerKey(tariff)` (`utils/offerIdentity.mjs`) ist die **einzige** Antwort auf „welches Angebot ist das?": `offerId` zuerst, Tarif-ID nur als Rückfall, sonst `null`.
- `sameOffer()` vergleicht zwei `null` ausdrücklich als **verschieden**. Ohne diese Regel gälte `undefined === undefined` — jede kennungslose Karte wäre „ausgewählt", teilte sich ein Badge und eine DOM-Kennung.
- `offerBlocked(t)` ist wahr **nur** bei einer ausdrücklichen Serveraussage (`bookable === false` oder `availableForDate === false`). Ein **fehlendes** Feld sperrt nichts — `!t.bookable` würde jedes Angebot aus einer älteren Antwort sperren.
- `offerBookable()` sagt, ob ein Angebot beauftragt werden kann (Auszeichnungen). Die **Aktionen** (CTA, Kartenklick, Weg zur Buchungsseite) hängen an `offerSelectable()`: buchbar **oder** nur noch auf die Art der Lieferadresse wartend (`unavailableReason: "price_inputs_required"`) **oder** — seit Gesamtauftrag B — nur noch auf einen Firmennamen wartend (`business_sender_required`/`business_recipient_required`, `offerAwaitsBusinessDetails`). Keines von beiden steuert die optische Wertigkeit — ein nicht bestellbares Angebot bleibt eine vollwertige Preisauskunft und wird nicht blass gezeichnet; sein Preis bleibt sichtbar.
- Der Grund wird **übersetzt**, nie durchgereicht; ein unbekannter Grund ergibt den neutralen Satz. Kein Einkaufsprovider im sichtbaren Text.

### Sendungshandle

Kundenseitige Sendungsoperationen adressieren über **`ceShipmentId`** (`shipments.id`) — nach der Buchung (Label, Tracking, Stornoanfrage) **und** davor (Buchung, Neubepreisung, Warenkorbvorschau, Abholzeitfenster, Handelsrechnung, Entwurf speichern). Eine Providerreferenz kennt der Client nicht: sie steht in keiner Kundenantwort, wird nie gesendet und nie im Vorgang geführt. Das Backend nimmt die Altform nur noch als Eingabe älterer Bundles an.

### Dreiwertige Angaben

`true` / `false` / unbeantwortet sind drei Zustände. `false` ist eine vollwertige Antwort. Deshalb `?? null` statt `|| null`, `tristate()` statt `bool()` und `checked={wert === true}` statt `checked={wert}`. Kein `<Switch>` für eine dreiwertige Angabe — er stünde beim Öffnen auf „aus" und behauptete eine Antwort, die niemand gegeben hat.

### Angaben zur Art der Adresse — aktueller Vertrag

Die Art der Lieferadresse ist **keine Formularangabe** mehr. „Neue Sendung" erhebt vor dem Vergleich nur Inhalt und Warenwert; eine Abholadressfrage gibt es nicht. Eine Adressart aus einem älteren Entwurf oder Vorgang wird beim Zurücklesen ignoriert — nie gesendet, nie zur Sperre.

- **Welches Angebot fragt, sagt der Server:** nur ein Angebot, dessen `requiredPriceInputs` `deliveryIsResidential` nennt (`utils/residentialPriceInputs.mjs`). Im Vergleich ist es `bookable: false` mit `unavailableReason: "price_inputs_required"` — auswählbar, nicht buchbar; die Karte zeigt „Vorläufiger Preis" (Marke neben dem Carrier), „Bei einer privaten Lieferadresse kann ein Zuschlag anfallen." steht in der Preisaufschlüsselung ihrer Details (kein „ab"-Betrag). Jedes andere Angebot bekommt weder Frage noch Anfrage.
- **Schritt 1 der Buchungsseite lädt die Optionen selbst** (`POST /api/offers/price-input-options` über `src/api/client.js`) und zeigt zwei Karten mit den Serverbeträgen — in der Nettoanzeige „+ Y,YY € netto", darunter „X,XX € brutto", in der Bruttoanzeige „+ X,XX € brutto", darunter „Y,YY € netto". Kein lokaler Ersatzpreis: bei einem Fehler nur der Hinweis und „Erneut versuchen".
- **Die Wahl bindet der Server** (`POST /api/offers/price-inputs`; `expectedShippingGross` ist nur ein Wächter). Während einer Bindung sind beide Karten gesperrt, ein Doppelklick bindet einmal. Die Antwort geht ins ausgewählte Angebot **und** in die Angebotsliste des Vorgangs (`offerRevision`, `priceInputs`, `priceComponents`); `requiredPriceInputs` bleibt die Liste des Vergleichs.
- **Bis zur Bindung** ist der Preis vorläufig (`PRICE_STATUS.PRICE_INPUTS_REQUIRED`), die Absicherung weder sichtbar noch bepreisbar und die Buchung gesperrt (Weiter-Gate und `doBook`).
- **Wiederherstellung** nach Reload oder Rückkehr ausschließlich über `boundValue` der Optionsantwort — nie aus einem Clientspeicher. Trägt das Angebot die Serverbindung nicht, wird dieselbe Wahl still und idempotent gebunden.
- **Veralteter Stand** (`OFFER_PRICE_CONFLICT`, `PRICE_INPUT_OPTIONS_EXPIRED`, `PRICE_CONFIRMATION_REQUIRED`) lädt die Optionen neu, der Kunde wählt erneut. `PRICE_CHANGED` mit `priceInputsRebindRequired` (Neubepreisung oder `/book`) hat **keinen Übernahmeweg**: zurück an die Auswahl, neu bestätigen.
- `/book` sendet für ein solches Angebot `offerRevision` und die gebundene Wahl als `priceInputs` (Konsistenzwächter) — nie einen Formularwert. `false` bleibt „Geschäftsadresse" und wird nie als „fehlt" behandelt.
- **Ohne Zuschlag (DHL Foundation):** nennt das Angebot die Angabe zusätzlich in `surchargeFreePriceInputs` (`offerResidentialSurchargeFree`), lautet der Hinweis in der Preisaufschlüsselung der Angebotsdetails „Die Art der Lieferadresse wird vor der Buchung abgefragt.", beide Karten zeigen „+ 0,00 €", der Abschnitt lädt mit „Preis wird geprüft …" und meldet einen vorübergehenden Fehler als „Der Preis konnte nicht geprüft werden.". Optionen mit Zuschlag oder zwei verschiedenen Preisen und eine Bindung mit „Zuschlag Privatadresse" werden verworfen. Ohne das Feld gilt der bisherige Vertrag; entschieden wird nur am Feld, nie an Service oder Carrier. Es gibt dafür keine eigenen Browser-Zeitlimits — Optionen und Neubepreisung tragen wie jedes Angebot 75 s (`src/api/client.js`).
- **Zuschlag der bestätigten Option (DHL-Privatadresszuschlag, 2026-10-10):** ohne `surchargeFreePriceInputs` kann eine Privatoption auch „+ 0,00 €" tragen (der Anbieter nennt für diese Sendung keinen Zuschlag) — dann mit genau dem Preis der Geschäftsadresse, sonst wird die Antwort verworfen. Die Seite prüft die Bindung gegen die Option, die der Kunde bestätigt hat (`readPriceInputBinding(d, { tariff, value, options })`): „Zuschlag Privatadresse" steht genau dann in den Bestandteilen, wenn diese Option einen Zuschlag nannte, und genau mit deren Betrag. Das gebundene Angebot hält das Ergebnis (`residentialSurchargeConfirmed`, nur von `tariffWithPriceInputBinding` gesetzt), `residentialBoundValue` liest es; fehlt es — und ohne bestätigte Option —, gilt „Privatadresse heißt Zuschlagszeile", und dieselbe Wahl wird still und idempotent neu gebunden. Kein Zuschlag wird erfunden, berechnet oder übergangen; nie eine Service- oder Carrierprüfung. Browserprüfung: `tests/e2e/dhlResidentialSurchargeAsQuoted.test.mjs`.
- **Bestandteile** (`shipping_base` „Versand", `residential_delivery_surcharge` „Zuschlag Privatadresse", `transport_insurance` „Zusätzliche Transportabsicherung") liest `utils/priceComponentsView.mjs` — nur zum bestätigten Preis, nie addiert. Ein unbekannter Typ ergibt keine Zeilen; die Server-Totals bleiben. Für eine Abholung am selben Tag steht `same_day_collection_surcharge` („Zuschlag für Abholung am selben Tag") zwischen Versand und Privatadresse.

### Abholung am selben Tag (TG22/TG23 Same-Day) — aktueller Vertrag

Ob ein Angebot **heute** abgeholt werden kann, bis wann und mit welchem Zuschlag, sagt ausschließlich der Server. Die Oberfläche vergleicht kein Datum, liest keine Uhr und rechnet nichts (`utils/sameDayCollectionView.mjs`).

- **Karte:** nur mit `pickupToday: true`, `pickupTodayUntil` („HH:MM") **und** beiden Beträgen `sameDaySurchargeNet`/`sameDaySurchargeGross` erscheinen in den Angebotsdetails „Zuschlag für Abholung am selben Tag" mit beiden Beträgen (Preisaufschlüsselung) und „Abholung heute bei Buchung bis HH:MM Uhr" (Termin & Abholung; seit dem Einheitlichen Abholtermin 2026-10-24 — die Uhrzeit ist der Buchungsschluss, kein Abholende; derselbe Satz aus `sameDayBookByText` auf Karte, Zusammenfassung und im Abschnitt „Abholtermin"); die Kartenfläche selbst zeigt „Abholung heute" und den Kartenpreis (seit 2026-10-04 keine Zuschlagszeile mehr darauf). Der Kartenpreis **enthält** den Zuschlag — nichts wird addiert. Ein Tarif mit `pickupToday`, aber ohne diese Angaben, bekommt keine Zeile. Das ist der **Normalfall** für die gebührenfreien Abholverträge (TNT, DHL): `pickupToday: true` sagt nur, dass heute abgeholt wird — der Timeline-Knoten heißt „Abholung heute", der Filter greift, und es entsteht trotzdem weder eine Zuschlagszeile noch ein „+ 0,00 €". Die Oberfläche entscheidet darüber nichts: kein Datumsvergleich, keine Uhr, keine ServiceID.
- **Gesperrte Abholung heute** — drei Gründe, sichtbar mit Preis, nicht auswählbar; der Knopf sagt den Satz, die Angebotsdetails (Zusatzhinweise) immer „Bitte wählen Sie einen späteren Abholtag.":
  - `same_day_unavailable` (Abholschluss vorbei): „Abholung heute nicht mehr möglich."
  - `same_day_unconfirmed` (kein bestätigter Abholschluss): „Abholung heute für dieses Angebot nicht verfügbar."
  - `same_day_unverifiable` (Angaben nicht prüfbar): „Abholung heute kann derzeit nicht bestätigt werden."
  - Ein unbekannter Grund ergibt den neutralen Satz. Der Server nennt den Tag, aber `collectionReadyFrom: null` — die Karte zeigt keine „bereit ab"-Zeile. Ein späterer Abholtag behält seine Zeit (09:00), eine verfügbare Abholung heute die dynamische.
  - **Das Versanddatum ist der früheste Abholtag** (TG Effective Collection): ist der gewünschte Tag für ein Angebot nicht abholbar — Wochenende, oder heute zu spät —, trägt das Angebot den frühesten tatsächlich möglichen Tag in `collectionDate` und ist wie jeder spätere Abholtag auswählbar. Die drei Sätze oben erscheinen deshalb nur für Angebote ohne diesen Rückfall. Die Oberfläche entscheidet darüber nicht: kein Datumsvergleich, keine Uhr, keine ServiceID; Karte, ausgewähltes Angebot und Live-Leiste zeigen den Tag des Angebots (`pickupContractOf`, `pickupSummaryOf`), das Versanddatumsfeld bleibt der Wunschtag des Kunden.
    - **Dass verschoben wurde, sagt der Server** (`collectionDateAdjusted`, ein Ja/Nein ohne Grund und ohne Wunschtag). Nur daran — nie aus einem Vergleich — beschriftet `pickupDayLabel` die Abholzeile mit „Frühester Abholtag" und setzt `pickupAdjustedNote` die Unterzeile „frühester Abholtag" (Timeline, Live-Leiste). Der Wortlaut steht ausschließlich in `utils/pickupContractView.mjs`; keine Fläche formuliert ihn selbst, und ein **Grund** wird nie gezeigt — die Oberfläche kennt keinen. Ein stillschweigend verschobenes Datum wäre die einzige Variante, die den Kunden täuscht.
- **Buchungsseite:** Options- und Bindungsantwort tragen für eine Abholung heute den Block `sameDayCollection` (`pickupTodayUntil`, `collectionDate`, `collectionReadyFrom`, `surcharge`); ein Block in anderer Form verwirft die Antwort. Die Bindung übernimmt `collectionReadyFrom` ins Angebot — die „bereit ab"-Zeit, die jetzt gälte. Live-Leiste und ausgewähltes Angebot nennen „inkl. Zuschlag für Abholung am selben Tag X,XX €" (vorläufig aus dem Angebot, bestätigt aus dem Bestandteil) und den Abholschluss.
- **`/book` sendet keine Same-Day-Angabe.** Der Erfolg nennt die tatsächlich gesendete Abholzeit ausschließlich aus `booking.sameDayCollection` — nie aus dem Angebot.
- **`SAME_DAY_COLLECTION_UNAVAILABLE`** (Optionen, Bindung, Neubepreisung, `/book`): der Satz zu `sameDayUnavailableKind` (`expired` / `unconfirmed` / `unverifiable`, über `sameDayUnavailableBookingText`) mit dem Hinweis und „Angebote neu berechnen" — nie „erneut versuchen". Fehlt die Art oder ist sie unbekannt, gilt „kann derzeit nicht bestätigt werden". Eine Änderung des Zuschlags kommt als `PRICE_CHANGED` mit `priceInputsRebindRequired` und läuft über den bestehenden Neubestätigungsweg.
- Ein Datumswechsel verwirft die Angebote (`resetResults`); Entwürfe und Vorgang speichern keine Same-Day-Angabe.

### Abholtermin auf der Buchungsseite (Einheitlicher Abholtermin, Betreiberentscheidung 2026-10-24) — aktueller Vertrag

Jede **Fahrerabholung** bekommt denselben Abschnitt (`components/booking/PickupWindowModule.jsx`). Die Variante
entscheidet allein `pickupTimeProfileOf` (`utils/pickupContractView.mjs`) an den Feldern des Angebots — kein Provider,
keine ServiceID. Gleiche Klassen, Zeilen und Typografie wie bisher (`calc-panel`, `summary-detail-row`, `pw-*`).

| Profil | Felder | Abschnitt |
|---|---|---|
| `window_adjustable` | `pickupTimeFrom`/`pickupTimeUntil` + `pickupWindowAdjustable: true` | „Gewünschter Abholtermin“: Datum, Zeit, Zwei-Griff-Regler (15-Minuten-Schritte, Mindestdauer des Servers, mindestens 2 Std.), „Verfügbar … · Mindestdauer …“, Speicherhinweis |
| `window_fixed` | dieselben Fensterfelder ohne Wahl (JUMiNGO ohne Verstellbarkeit, Portalzeitraum GLS 110 / DPD 137) | „Abholtermin“: Datum, „Abholzeitfenster 09:00–17:00 Uhr“, „Vom Versanddienstleister vorgegeben … eine genaue Uhrzeit wird nicht zugesagt.“ |
| `ready_from` | `collectionReadyFrom` (Transglobal-Direktbuchung) | „Abholtermin“: Datum, „Sendung bereit ab 09:00 Uhr“, „… Ein festes Abholzeitfenster nennt der Versanddienstleister für diesen Tarif nicht.“ |
| `date_only` | nur der Tag | „Abholtermin“: Datum, „Die Uhrzeit der Abholung legt der Versanddienstleister fest.“ |
| `none` | Paketshopabgabe oder nichts zu zeigen | kein Abschnitt |

- **Abholung heute:** zusätzlich „Abholung heute bei Buchung bis HH:MM Uhr“ aus `pickupTodayUntil` (`sameDayBookByText`).
  Die Uhrzeit ist der Buchungsschluss, kein Abholende.
- **Der Entwurf wird nur bei einer Wahl gelesen oder beschrieben.** `GET`/`POST /api/jumingo/draft/pickup-window`
  tragen `offerId` des Angebots (`api/client.js`). Der Server zeigt und bucht einen Wunsch nur für das Angebot, an das er
  gebunden ist. Ein Tarifwechsel übernimmt deshalb kein Fenster.
- **Ohne Wahl:** Ein Angebot ohne Wahl liest und schreibt den Entwurf nicht und sperrt die Buchung nicht. Es verwirft
  eine noch im Seitenzustand liegende Auswahl; `pickupSummaryOf` übernimmt eine Auswahl nur an einem verstellbaren
  Fenster.
- **409 `PICKUP_WINDOW_CHANGED`:** Der Dialog nennt ein neues Fenster nur, wenn der Server eines nennt; bei
  `adjustable: false` heißt es fest vorgegeben.
- **Tests:** `src/utils/pickupTimeProfile.test.mjs`, E2E `tests/e2e/pickupScheduleProfiles.test.mjs` (A–L: alle Varianten,
  120/180 Minuten, Wiederherstellung, 409, Same-Day, Tarifwechsel, 768/390 px, Tastatur und Touch).

### Frühzeiten auf der Tarifkarte — aktueller Vertrag

- **Frühzeit-Hinweis** („Lieferung bis HH:MM Uhr", grün): nur aus `deliveryTimeUntil`/`deliveryTimeUntilMinutes` des Angebots und nur vor 15:00 (`utils/deliveryTimeView.mjs`, Darstellungsgrenze). Er steht **im Endknoten** direkt unter dem Lieferdatum; dort entfällt die graue Uhrzeitzeile. Die Spuren der Ablaufbeschriftung sind `minmax(0, 1fr)` — der Hinweis verzieht weder Timeline noch Preisspalte. Gleiches Feld, gleiche Darstellung, unabhängig vom Provider.
- **Uhrzeit im sichtbaren Servicenamen** (Betreiberentscheidung 2026-10-03): eine bereits im Namen stehende frühe Uhrzeit („Express 9:00") erscheint **rein optisch** grün (`utils/serviceNameTimeView.mjs`, `.offer-service-time`, dieselbe Grünfamilie). Der Text bleibt zeichengleich; daraus entsteht keine Zustellzeit und kein „bis" — keine Wirkung auf Lieferzeitfilter (K2), Sortierung, Auszeichnungen, Preis oder Buchung, keine ServiceID- oder Carrierprüfung. Nur die Tarifkarte liest das Modul.

### Produktprofil (TG22 Package A) — aktueller Vertrag

Welche Produktangaben ein Angebot trägt, sagt ausschließlich der Server: `serviceDetails` (`summaryKey`, `volumetricDivisor`, `notAccepted`, `basicCoverMaxGoodsValue`, `maxCoverValue` — Codes und Zahlen) neben `tariffLimits`, `trackingAvailable`, `printerRequired`, `chargeableWeight`, Labelangaben und Laufzeit. `utils/serviceDetailsView.mjs` bildet daraus die Sätze, `components/offers/ServiceProfileDetails.jsx` zeigt sie.

- **Nur mit gültigem Profil:** ein unbekannter Code, ein Divisor, der weder `null` noch eine positive ganze Zahl ist, oder unvollständige Absicherungsgrenzen ergeben `null` — dann bleibt der bisherige Detailbereich (Merkmalsraster, Einschränkungen, Versicherung) unverändert. Keine ServiceID-, Carrier- oder Providerprüfung im JSX.
- **Nicht belegter Divisor** (`volumetricDivisor: null`): das Profil entsteht, aber „Größe & Gewicht" zeigt weder die Formel noch den Abrechnungshinweis; ohne Zeilen entfällt der Abschnitt (`size: null`).
- **Fünf Abschnitte statt Hauptmerkmale/Einschränkungen/Versicherung:** „Hauptmerkmale", „Laufzeit" (genau einmal), „Größe & Gewicht", „Transportabsicherung", „Einschränkungen". „Termin & Abholung" (bei Shopabgabe „Termin & Abgabe" mit „Abgabetermin" — allein über die Übergabeart, `utils/pickupContractView.mjs`), „Preisaufschlüsselung", Links und Zusatzhinweise bleiben für jedes Angebot.
- **Nichts wird gerechnet:** der Divisor steht nur in „Volumengewicht: L × B × H ÷ 5.000" (nur mit belegtem Divisor); das Abrechnungsgewicht ist der Serverwert; aus der Laufzeit rechnet die Oberfläche kein Datum (die voraussichtliche Lieferung kommt fertig vom Server, siehe unten).
- **Nie im Profil:** Access Point, Samstagszustellung, Zustelluhrzeit, ein Zustelldatum außer der Prognose des Servers, „garantiert", statische Zuschläge, Anbietername, externe Links. Länge und Gurtmaß nur als vom Server gelieferte, belegte Grenze (`first_length`, `length_and_girth` — Auftrag 2 / P4, Beleg im Backend `docs/transglobal/servicegrenzen.md`), nie aus `girth` ohne belegte Formel und nie ergänzt.
- **Verpackungsregeln** (`packageRules`: nicht zugelassene Verpackungen, Ladehilfe ab Gewicht) stehen bei Karten ohne Profil unter „Einschränkungen“ (`utils/packageRulesView.mjs`); ein unbekannter Code ergibt keine Zeile.
- **Selbstbeteiligung** nur aus `insuranceDetails` und nur, wenn die zusätzliche Absicherung wählbar ist; eine Absicherung in Stufen beschreibt das Profil nicht (dann bisheriger Bereich).
- **Responsive:** `.offer-profile-*` mit Umbruchschutz; bis 767 px Merkmale einspaltig, bis 480 px Beschriftung über dem Wert.

### Voraussichtliche Zustellung (TG22 Package B, TG-L2) — aktueller Vertrag

Ob ein Angebot eine voraussichtliche Zustellung trägt, welche Tage und ob eine Uhrzeit, sagt ausschließlich der Server: `deliveryProjection { kind: "estimated", dateMin, dateMax, timeUntil }` — eine Prognose von ConfidaraExpress aus Abhol- bzw. Abgabetag und Laufzeit (Montag bis Freitag ohne die neun bundesweiten Feiertage), keine Anbieterzusage. Seit TG-L1 (Backend, 2026-10-23) trägt sie jedes der 15 Transglobal-Launchprodukte; `timeUntil` ist die belegte Zustellzeit des gebuchten Produkts (heute DHL 85 09:00, 86 10:30, 87 12:00, nur DE→DE und nur an einem einzelnen Tag), sonst `null`. `utils/deliveryProjectionView.mjs` prüft und formatiert nur.

- **Nichts wird gerechnet:** keine Versandtage, kein `Date.now`, keine Browseruhr, kein `toLocale…`; die Wochentage kommen aus einer festen Tabelle („Di., 15.09."). Ein ungültiges Datum, `dateMax` vor `dateMin` oder ein anderer `kind` ergibt keine Prognose — nie einen Fehler und nie einen Ersatz.
- **Rangfolge** (`utils/deliveryContractView.mjs`): Zeitraum des Anbieters → Datum des Anbieters → Prognose → Laufzeit → „Auf Anfrage". Zustelldaten eines Anbieters haben immer Vorrang; JUMiNGO bleibt „Zustellung" mit „bis HH:MM Uhr".
- **Karte (dasselbe Kartendesign wie bei JUMiNGO):** Endknoten „Voraussichtliche Zustellung" mit „Di., 15.09. – Mi., 16.09.", „Di., 15.09." oder „ab Di., 15.09." (`dateMax: null`). Eine belegte Uhrzeit steht wie eine Anbieteruhrzeit darunter — früh (vor 15:00) im grünen Feld „Lieferung bis 12:00 Uhr", sonst grau (`deliveryTimeUntilOf` in `utils/deliveryTimeView.mjs`: Anbieter zuerst, sonst `timeUntil`). Die Laufzeit („1–2 Tage") bleibt stehen. Eine Shopabgabe ohne eigenen Termin nennt im Startknoten den Tag, auf dem die Prognose beruht („ab Mo., 26.10." — das gewählte Versanddatum, nur mit Prognose).
- **Detailbereich:** mit Produktprofil im Abschnitt „Laufzeit" unter „Voraussichtliche Laufzeit" genau eine Zeile „Voraussichtliche Zustellung" (mit „, bis 12:00 Uhr", wenn belegt), ohne Profil dieselbe Zeile unter „Termin & Abholung"/„Termin & Abgabe" (TT.MM.JJJJ). Dazu der Hinweis „Aus Abholtag und Laufzeit berechnet; …" — bei der Abgabe „Aus Abgabetag und Laufzeit berechnet; …", mit Uhrzeit ergänzt um „Die Uhrzeit ist die Zustellzeit, die der Versanddienstleister für dieses Produkt nennt." (`projectedDeliveryNote`).
- **Buchungsflächen** (`deliveryInfo`): „Voraussichtliche Zustellung" mit TT.MM.JJJJ („15.09.2026 – 16.09.2026", „ab 15.09.2026"), `until` nur mit belegter Uhrzeit („bis 12:00").
- **Öffentlicher Preisrechner:** „Voraussichtliche Zustellung" mit dem Zusatz „aus Versandtag und Laufzeit berechnet" (nicht „laut Versanddienstleister" — das bleibt Laufzeit und Anbieterdatum vorbehalten).
- **Autorität nur im Lieferzeitfilter:** er liest die Prognose als eigene Stufe „voraussichtlich" (siehe „Lieferzeitfilter in Gruppen"); Auszeichnungen und Sortierung lesen weiter Preis und Laufzeittage. Nie sichtbar: „garantiert", eine Uhrzeit aus dem Produktnamen, Anbietername, Quelle oder `kind`.

### Lieferzeitfilter in Gruppen (TG-L2, Betreiberentscheidung 2026-10-23) — aktueller Vertrag

Beide Bedienflächen — oben das Formularfeld „Späteste Lieferzeit", unten der Chip „Lieferung" an der Liste — schreiben denselben Zustand (`form.latestDeliveryDate`, `form.latestDeliveryTime`); jede Änderung wirkt sofort und löst keine Preisanfrage aus (`FILTER_ONLY_FIELDS`). Die Regel steht genau einmal in `utils/offersFilterView.mjs` (`deliveryDeadlineAssessment`), für JUMiNGO und Transglobal gleich:

- **„Passend"** (`met`): Zustelldaten des Anbieters in der Frist — spätester Tag vor der Frist, oder am Fristtag ohne Fristuhrzeit bzw. mit Anbieteruhrzeit ≤ Fristuhrzeit (unverändert seit Block B).
- **„Voraussichtlich passend"** (`projected`): ohne Anbieterdaten die Prognose des Servers nach derselben Regel, eine belegte Uhrzeit wird wie eine Anbieteruhrzeit verglichen (DHL 12:00 passt zu „bis 12:00", nicht zu „bis 10:00").
- **„Frist nicht bestätigt"** (`not_assessable`): offenes Fenster („1+") mit frühestem Tag in der Frist, am Fristtag eine Fristuhrzeit ohne Uhrzeit des Angebots, ein unbrauchbares Datum oder gar keine Angabe — sichtbar, als eigene Gruppe.
- **„Zu spät"** (`too_late`): frühester Tag nach der Frist, ein Zeitraum über die Frist hinaus oder am Fristtag eine spätere Uhrzeit — eingeklappt hinter „n Angebote stellen nach Ihrer Frist zu – anzeigen" (`aria-expanded`), mit jeder neuen Frist wieder zu; die Preisgrenze gilt auch dort (`lateResultOffers`).

Ohne Frist bleibt die Liste ungegliedert. Die Überschrift zählt die sichtbaren Angebote (ohne „Zu spät"), jeder Gruppenkopf seine eigenen. Auszeichnungen („Günstigste", „Schnellste") nur unter „Passend" und „Voraussichtlich passend". Hält kein Angebot die Frist, steht „Kein Angebot hält Ihre Frist nach den verfügbaren Daten ein." über den übrigen Gruppen, darunter „Filter zurücksetzen". Fällt die Auswahl durch eine neue Frist unter „Zu spät", wird sie gelöst — eine bewusste Wahl in der aufgeklappten Gruppe bleibt. Die Karten tragen keinen Fristhinweis mehr (der frühere „Zustelltermin nicht bewertbar" ist entfallen). Die Uhrzeitliste hängt als Portal an `document.body`; ein Druck auf ihren Scrollbalken, Innenabstand oder Rand gilt für das Lieferungs-Dropdown als Druck nach innen (Filterzone in `OffersList.jsx` erkennt das Ereignis im React-Baum) und schließt es nicht — nur ein Druck außerhalb der Zone schließt. Browserprüfungen: `tests/e2e/tgL2DeliveryGroups.test.mjs`, `tests/e2e/tariffPresentation.test.mjs` (D), `tests/e2e/deliveryFilterPortalClick.test.mjs` (Scrollbalken, Innenabstand, Mausrad, Tastatur, Touch, Außenklick).

### Firmenpflicht auf der Angebotskarte (Gesamtauftrag B, Betreiberentscheidung 2026-10-24) — aktueller Vertrag

Ein Produkt mit Firmenpflicht (TNT 41/44/49 aus der Policy, JUMiNGO `from_company_only`/`to_company_only`) bleibt eine **auswählbare** Karte. Die Regeln und Texte stehen einmal in `utils/offerIdentity.mjs`:

- **Welche Partei:** `offerBusinessRequirement(t)` liest die Produkteigenschaften `senderRequirement`/`recipientRequirement` (= `"business"`, auch bei schon eingetragener Firma) **oder** den Grund, solange der Firmenname fehlt. Ergebnis `party`: `sender` | `recipient` | `both` | `null`. Ohne `senderRequirement` (älteres Backend) zählt allein der Grund.
- **Karte** (`OfferCard.jsx`, links in der Folgezeile): „Angebot auswählen", die Anforderung je Partei („Nur für Geschäftsempfänger: Zugestellt wird ausschließlich an Unternehmen." usw.) und — nur wenn die Seite `onBusinessConfirm` hereinreicht — ein Bestätigungsfeld („Der Empfänger ist ein Unternehmen."). Ein Klick in diesen Block wählt die Karte nicht aus.
- **„Neue Sendung"** (`NewShipmentPage.jsx`, `handleBook`):
  1. Fehlt der Firmenname der Partei, steht die Meldung am Firmenfeld (Serverfehlerweg `serverErrors`, nur dieses Feld). Das Feld kommt weich ins Bild (bei reduzierter Bewegung `"instant"`), bekommt den Fokus, und die Auswahl wird gemerkt (`productKey`, Partei).
  2. Verlässt der Kunde das ergänzte Feld, startet **genau ein** neuer Vergleich. Danach wird das Angebot über den `productKey` wiedergefunden: genau ein auswählbarer Treffer, der nicht mehr auf den Namen wartet. Es wird ausgewählt, und sein Bestätigungsfeld bekommt über `useComparisonLoadingFocus` (Ziel `"element"`) den Fokus. Fehlt es, steht der Hinweis `#ns-firmen-hinweis`, und nichts wird gewählt.
  3. Fehlt die Bestätigung, gibt es eine Meldung und den Fokus am Feld. Erst mit Name und Bestätigung geht es zur Buchungsseite.
- **Lebensdauer:** Bestätigungen gelten nur im Seitenzustand je `offerKey`. Sie fallen mit jeder neuen Angebotsliste (`resetResults`, neuer Vergleich), also auch bei jeder Namensänderung. Sie gehen nie in Vorgang, Entwurf oder Request.
- **Versandkostenrechner im Portal:** Hinweis ohne Bestätigungsfeld; „Angebot auswählen" übergibt wie bisher an „Neue Sendung".
- **Öffentlicher Preisrechner:** unverändert (eigene Karte).
- **Server bleibt Autorität:** `/book` und die Revalidierung sind unverändert. Transglobal bucht mit den beim Vergleich gespeicherten Adressen — deshalb ist ein neuer Vergleich Pflicht.

Browserprüfung: `tests/e2e/businessRequirementOffers.test.mjs` (B1–B6).

### Nur buchbare Tarife sichtbar (Betreiberentscheidung 2026-10-26, Canonical v2.80) — aktueller Vertrag

Der **Server** liefert nur noch Angebote, die für die Sendung buchbar sind oder es nach einer kundenlösbaren Angabe
werden (Backend `lib/offers/customerOfferVisibility.js`, Canonical 6.4a). Die Oberfläche hat **keine eigene
Filterregel**: sie zeigt jedes gelieferte Angebot (`utils/offerVisibilityContract.test.mjs`). Daraus folgt:

- **Keine graue Karte.** Kundenlösbare Fälle sind auswählbar (`offerSelectable`): Art der Lieferadresse und
  Firmenpflicht wie bisher; neu eine zu lange Adressangabe und die fehlende Inhaltsangabe
  (`offerAwaitsCustomerCorrection`). Die Karte nennt in der Folgezeile die kurze Notiz
  (`offerCustomerCorrection(t).note`: „Nur mit gekürzter Adressangabe buchbar." / „Nur mit Angabe des Inhalts
  buchbar."), der genaue Hinweis steht in den Details.
- **„Neue Sendung"** (`handleBook`): die Auswahl einer solchen Karte führt zum Feld aus `offerCustomerCorrection(t).field`
  (aus `unavailableDetail` — Partei und Feld; ohne Einzelheit kein geratenes Feld, dann der allgemeine Hinweis über den
  Angeboten), mit dem genauen Hinweis am Feld (Serverfehlerweg) und dem Fokus. Verlässt der Kunde **genau dieses** Feld
  mit einem geänderten Wert, startet **genau ein** neuer Vergleich; das Angebot wird über den `productKey`
  wiedergefunden und gewählt, sobald es auf keine Angabe mehr wartet. Gebucht wird nur, was der Server danach buchbar
  nennt.
- **Angemeldeter Preisrechner** wählt **vor** den Sendungsangaben (`OFFER_SELECTION_STAGE.BEFORE_SHIPMENT_DETAILS`,
  `offerSelectableFor`): auswählbar ist, was der Server „buchbar mit Sendungsangaben" nennt
  (`availableWithShipmentDetails`); die Auswahl übergibt wie bisher nach „Neue Sendung", wo der volle Vergleich bindet.
  „Neue Sendung" bleibt bei der strengen Stufe.
- **Leerzustand:** „Keine direkt buchbaren Tarife" / „Für diese Sendung ist derzeit kein Tarif direkt buchbar. Ändern
  Sie das Datum oder wählen Sie „Alle Dienstleistungen"." (bei unterschiedlichen Paketen dazu „Weniger oder gleich große
  Pakete erweitern die Auswahl."); öffentlicher Preisrechner „Keine direkt buchbaren Angebote". Dorthin führt im
  öffentlichen Rechner auch die Serverantwort 422 `PACKAGE_COMBINATION_UNAVAILABLE` (unterschiedliche Pakete ohne
  Angebot, z. B. sechs Packstücke) — mit demselben Paketzusatz, nie als „Angaben prüfen" ohne markiertes Feld
  (`quoteOutcomeFromResponse`, seit 2026-10-26; Portal: `apiError.mjs`).
- **Altzustand:** ein dennoch geliefertes, nicht buchbares Angebot (Sitzungswiederherstellung, alter Server) erscheint wie
  bisher gesperrt mit Grund — die Darstellung „Preisauskunft bleibt lesbar" (UPS-Familie unten) gilt nur noch dafür.

Browserprüfung: `tests/e2e/onlyBookableOffers.test.mjs` (B1 Leerzustand 1440/768/375, B2 Feldführung mit genau einem
neuen Vergleich, B3 Preisrechner-Übergabe). Einheitstests: `utils/offerSelectionStage.test.mjs`.

### Versandartfilter ohne „Economy" (Gesamtauftrag F, 2026-10-24) — aktueller Vertrag

Drei Optionen: „Alle Versandarten", „Standard", „Express". Economy-Produkte (TNT Economy Express, DHL Economy Select …) bleiben angeboten und erscheinen unter „Alle Versandarten"; die Tarifklassifizierung (`shippingMode` des Servers) ist unverändert. `FORM_SHIPPING_MODES` (`utils/formDraftsView.mjs`) kennt kein `economy` mehr — Entwurf, Sitzung, Übergabe und Snapshot landen damit an einer Stelle auf `all`; beim Fortsetzen eines Entwurfs mit „Economy" steht `RESUME_ECONOMY_FILTER_NOTICE`. Der öffentliche Preisrechner fällt über seine Optionsliste ebenso auf `all`.

### Paketshop-Finder: ein Finder, zwei Suchprofile (P2, 2026-10-24) — aktueller Vertrag

Ein Fenster, eine Liste, eine Karte (`AccessPointFinderModal`, `AccessPointList`, `AccessPointMap`, `ParcelShopFinderContext`). Das Profil kommt allein aus der Serverangabe des Angebots — `parcelShopSearch === "server"` ist die verbindliche Auswahl, sonst Orientierung. Kein ServiceID- oder Anbietervergleich im Code. Regeln und Texte stehen einmal in `utils/parcelShopSearchProfile.mjs`.

- **Orientierung (JUMiNGO, unverändert):** PLZ, Ort, Straße, Umkreis, „Jetzt geöffnet“, Karte, Status und Öffnungszeiten aus der Anbieterantwort, der bisherige Hinweissatz (`ORIENTATION_NOTE`). Einzige Änderung: Entfernungen heißen „km“ statt „KM“ (`formatDistance`, unbekannte Einheiten bleiben wörtlich).
- **Verbindliche Auswahl (TG124):** nur die fünfstellige PLZ (DE); kein Ort, keine Straße, kein Umkreis, kein Öffnungsfilter — die Portalsuche kennt sie nicht. Pflichthinweis `BINDING_NOTE` („Für diesen Versand müssen Sie vor der Buchung einen Paketshop auswählen.“), beim Laden `BINDING_LOADING_NOTE`. Der Orientierungssatz erscheint hier nie.
- **Liste:** `mapPortalShopsToList` (`utils/portalParcelShops.mjs`) übernimmt Name, Anschrift und `distanceKm` (in km, Reihenfolge des Servers; die Portalzahl ist Kilometer, obwohl das Portal „mi“ schreibt — Backend §7.59, seit 2026-10-24 ohne Meilenfaktor). Status, Öffnungszeiten und „Öffnungszeiten“-Knopf entfallen (`showStatusAndHours = false`) — die Quelle liefert sie nicht, Platzhalter werden nicht erfunden. Die Kontextzeile nennt die gesuchte PLZ und dass die Entfernung zum Gebiet der PLZ gemessen ist.
- **Karte nur mit Positionen:** Ohne mindestens eine Kartenposition gibt es keine Karte und keinen mobilen Umschalter; die Liste nimmt die Fläche ein (`ap-modal-split--listonly`, Desktop als Raster), die Zeile ist reiner Inhalt. Liefert der Server geprüfte Positionen (P3, `latitude`/`longitude`/`positionSource: "address"`, Backend §7.60), ist es **dieselbe Karte wie bei JUMiNGO**:
  - derselbe lokale Ausschnitt (`fitBounds` über die Marker, ein einzelner Marker mit Zoom 15);
  - dieselben blauen Marker mit der Nummer des Listeneintrags (Shops ohne Position überspringen ihre Nummer);
  - dieselbe Bedienung: Marker ↔ Liste und Popup;
  - auf dem Handy derselbe Umschalter Liste/Karte;
  - dieselben Stile.

  Zusätzlich gibt es nur das technisch Nötige: die Auswahl im Popup, den Herkunftshinweis und die Pflicht-Quellenangabe (© OpenStreetMap-Mitwirkende · Powered by Geoapify). Fehlt ein Teil der Positionen, nennt der Abdeckungshinweis „N von 10 Paketshops haben eine Kartenposition.“. Eine Position ist nie Buchungskennung und geht nie in `/book`.
- **Auswahl:** je Zeile „Diesen Paketshop wählen“; der zugängliche Name nennt Shop und Anschrift („Diesen Paketshop wählen – Lotto Shop Lange, Würzburger Str. 116, 63808 Haibach“). Wählen schließt das Fenster; die gewählte Zeile trägt „Ausgewählt“ und `ap-list-item--chosen`. Danach sagt der Einstieg, welcher Shop gilt: auf der Angebotskarte „Gewählt: <Name> · ändern“ (Name notfalls gekürzt, vollständig im zugänglichen Namen „Gewählter Paketshop für … – ändern“), auf der Buchungsseite — wo der Shop schon darüber steht — „Paketshop ändern“ (`ParcelShopFinderTrigger`, `showChosen`). Die Wahl gilt je `offerKey` bis zur Buchung, ein anderes Angebot hat seine eigene.
- **Suche:** genau eine Anfrage je Suchschlüssel (`portal`, Land, PLZ), späte Antworten einer älteren Suche verworfen (`laufRef`). Erfolgreiche Portalsuchen merkt sich der Finder je Schlüssel für 30 Minuten (`portalErgebnisseRef`), damit ein Wechsel zu einer anderen Abgabe und zurück keine zweite Anmeldung beim Anbieter auslöst. Fehler werden nicht gemerkt. Orientierungssuchen tragen tageszeitabhängige Öffnungsstatus und laden weiter neu. Zeitlimit `DROPOFF_PARCELSHOP_SEARCH_TIMEOUT_MS = 70000` (`api/client.js`) über dem Serverbudget von 60 s; nur dieser Aufruf, alle anderen behalten 30 s. Kein automatisches Wiederholen. Fehlertexte: Zeitüberschreitung, ungültige PLZ (400), zu viele Anfragen (429), sonst „nicht verfügbar“ — nie ein Anbieterfehler.
- **Buchung:** `dropoffParcelShopBookPayload` sendet Kennungen und Texte des gewählten Shops plus `searchPostcode` (nur fünf Ziffern). Der Server bleibt Autorität: Er sucht vor dem Warenkorb einmal mit dieser PLZ, verlangt genau einen Treffer mit gleichen Kennungen und Daten und bindet die Anbieterdaten (Backend `docs/BACKEND_ARCHITECTURE.md` §7.59).

Browserprüfung: `tests/e2e/parcelShopPortalFinder.test.mjs` (Fälle 1–12: Profil, Zeichen und km, Liste ohne Karte, Auswahl und Namen, `/book`-Payload, lange Suche, Fehler ohne Wiederholung, PLZ-Wechsel, Wechsel zur JUMiNGO-Abgabe mit später Antwort, Positionen aus P3, 390/360 px mit Touch, Tastatur); Orientierung weiter `parcelShopMapFinder`, `parcelShopParity`. Karte mit geprüften Positionen: `tests/e2e/parcelShopTg124Map.test.mjs` (Fälle 1–8):
- Marker = Listennummern, lokaler Ausschnitt;
- Marker ↔ Liste;
- Auswahl im Popup und Wechsel bis `/book`, ohne Koordinaten;
- Anbieterwechsel ohne zweite Portalsuche;
- 390/768 px wie JUMiNGO;
- unvollständige, fehlende Positionen und Ladefehler;
- keine Anfragen an fremde Hosts;
- gleiche berechnete Stile.

Die Fixture `tg124ParcelShops63808Positions.mjs` entsteht aus der freigegebenen Geoapify-Prüfung durch das echte Backend.

### Expressversand (TG23) — aktueller Vertrag

Das zweite öffentlich freigegebene Transglobal-Produkt erscheint als „UPS · Expressversand" im **gemeinsamen** Angebots- und Buchungsfluss — ohne eigene Karte, eigene Seite oder ServiceID-Prüfung. Was es kann, sagt der Server über dieselben Felder wie oben:

- **Profil:** `serviceDetails.summaryKey: "express_urgent"` → „Schneller Expressversand für eilige Sendungen." (`SERVICE_SUMMARY_TEXT` in `utils/serviceDetailsView.mjs` — die einzige TG23-Ergänzung im Produktionscode). Dazu aus den bestehenden Feldern: „1 je Sendung", „70 kg", „L × B × H ÷ 5.000", Paletten und Koffer, Sendungsverfolgung, „PDF · DIN A4 / Thermodruck".
- **Laufzeit „1 Tag"** und „Voraussichtliche Zustellung" aus `deliveryProjection` (ein Tag, ohne Uhrzeit — UPS trägt keine belegte Zeitleistung —, keine Zusage) — nie „bis 12 Uhr", „Tagesende" oder „garantiert".
- **Art der Lieferadresse, Abholung am selben Tag, Transportabsicherung, Preisbestandteile und Preisänderung** laufen unverändert über die Verträge oben; der Expressaufschlag steckt im Serverpreis, die Absicherung bleibt 1:1 und steuerfrei.
- **JUMiNGO:** das JUMiNGO-Pendant trägt seit Go-Live Block B seinen kuratierten Tarifnamen „Express Saver" (vom Server) und bleibt mit Anbieterdatum und „bis HH:MM Uhr" daneben sichtbar.
- **Nie sichtbar:** Einkaufsquelle, ServiceID, QuoteID, Anbietercodes. Browserprüfung: `tests/e2e/tg23ExpressSaver.test.mjs`.

### UPS-Familie (TG29 UPS · Express, TG26 UPS · Standardversand Mehrpaket) — aktueller Vertrag

Beide Produkte laufen durch denselben Angebots-, Buchungs- und Sendungsfluss wie 22 und 23. Der Name kommt vom Server; kein Produktionsmodul buchstabiert „Express", „Mehrpaket" oder eine ServiceID nach (`utils/upsFamilyFrontend.test.mjs`).

- **UPS · Express bis zur Freigabe:** `quote_only` — Preis sichtbar, Knopf „Derzeit nicht direkt buchbar", keine Adressfrage, keine Abholung heute, keine Absicherung, keine Auszeichnung. Das Profil (`express_urgent`) steht mit nicht belegtem Divisor und ohne Gewichtsgrenze da; „Voraussichtliche Zustellung" als ein Tag, nie eine Uhrzeit oder Zusage. Nach der Freigabe trägt der Server dieselben Felder wie bei 23 — die Oberfläche ändert sich nicht.
- **UPS · Standardversand Mehrpaket (freigegeben, TG26):** auswählbar wie der Standardversand — „Vorläufiger Preis", Zuschlagshinweis (Details), Art der Lieferadresse auf der Buchungsseite, danach Absicherung und Buchung, alles über die Verträge oben. Ohne Profil und ohne Prognose bleibt der bisherige Detailbereich: Laufzeit „1–5 Tage", Sendungsverfolgung, Drucker und die Einschränkung „max. 2 Packstücke" kommen aus den Serverfeldern — keine Zahl im Code. Eine Abholung heute gibt es nicht — ein heutiger Wunschtag oder ein Wochenendtag trägt serverseitig den nächsten Versandtag (siehe „Das Versanddatum ist der früheste Abholtag"). Solange die Art der Lieferadresse aussteht, sagt der Server nichts über die Absicherung; der Detailbereich behauptet dann auch kein „Keine Zusatzversicherung verfügbar." (`offerCardInsurance`).
- **Preisauskunft bleibt lesbar:** gesperrt ist allein der CTA (`disabled`, Grund im `aria-label`). Die Karte trägt **kein** `aria-disabled` — es vererbt sich auf „Details anzeigen", Screenreader und Playwright hielten den Knopf für gesperrt.
- **Mehrere Packstücke:** gleiche Pakete sind eine Zeile × Anzahl („Gleiche Pakete"). `packageSummaryLine` ergibt „2 Pakete · je 2 kg · 30 × 20 × 15 cm" (Buchungsseite Schritt 1 und 2). Unterschiedliche Pakete: siehe „Individuelle Mehrpaketsendungen“ unten.
- **Belege:** die Knöpfe tragen die Servernamen in Serverreihenfolge. Gemessen (TG26): eine Sendungsnummer mit „Versandlabel (A4)" und „Versandlabel (Thermodruck)" (je eine Seite je Paket), kein Abholetikett. Generisch bei mehreren Nummern „Versandlabel 1 von 2 (A4)" …, ein Abholetikett zuletzt. Keine Annahme über die Zahl der Nummern je Buchung. Der Dateiname kommt aus `Content-Disposition` (eindeutig je Position und Format), der Rückfallname nur als Netz.
- **Mehrere Trackingnummern:** Liste „2 Trackingnummern", Detail und Live-Ansicht vollständig, je Etappe „UPS · <Nummer>"; eine einzelne Nummer bleibt die bisherige Anzeige. Das Admin-Detail listet alle Referenzen und Anbieterbelege.
- Browserprüfung: `tests/e2e/upsFamilyOffers.test.mjs` (Vergleich, Details, Preisrechner, Mehrpaketbuchung nach dem gemessenen Fall, Meine Sendungen mit einer und mit mehreren Nummern, 834/390 px).

### Individuelle Mehrpaketsendungen (Paketeditor, Canonical v2.79) — aktueller Vertrag

Texte, Grenzen und Layoutstufen stehen im Canonical (§15 „Paketeditor“); hier nur der Frontendvertrag.

- **Ein Modell, ein Editor:** Zeile 1 sind die flachen Formularfelder (`packageCount`, `weight`, `length`, `width`, `height`) mit den bisherigen IDs, Zeilen 2–20 stehen unter `extraPackageLines` (Text, stabiler `key`). Die Logik liegt abhängigkeitsfrei in `utils/packageLines.mjs` (der öffentliche Rechner bündelt sie mit), das Bauteil in `components/shipping/PackageLinesEditor.jsx` (Varianten `app` und `public`). Prüfen und Senden bleiben bei der Seite; ihre Feldtexte gelten je Zeile, ab zwei Zeilen mit „Paket k: “.
- **Senden:** eine Paketart (auch mehrere gleiche Zeilen) geht flach — bytegleich zum bisherigen Payload. Erst zwei verschiedene Zeilen senden `packageLines` in Formularreihenfolge; ein Serverfehler `packageLines[i].<feld>` landet deshalb an Zeile i (`mapServerField` → `packageLines.<i>.<feld>`, die Summe unter `packageLines`). `/book` sendet keine Paketzeilen.
- **Halten:** Sitzungszustand (`normalizeForm` übernimmt `extraPackageLines`), Formularentwurf Fassung 2 nur bei unterschiedlichen Paketen (`formDraftSchemaVersion`), Fortsetzen aus `packages.packageLines` (Formular- und Sendungsentwurf), Übergaben aus beiden Rechnern mit allen Zeilen.
- **Anzeigen:** Summe und Zeilen im Format der Auftragsbestätigung („3 Pakete · 31 kg gesamt“, „2 × 8 kg · 40 × 30 × 25 cm“); Buchungsübersicht mit „Pakete anzeigen“; Klebehinweis nur aus `packageLabelHint` des Servers (`utils/packageLabelHint.mjs`); Listen und Admin aus `packageLines`/`package_lines` der API.
- Prüfung: `utils/packageLines.test.mjs`, `components/shipping/packageLinesEditor.test.mjs`; Browser: `tests/e2e/packageLinesShipment.test.mjs`, `packageLinesCalculator.test.mjs`, `publicCalculatorPackageLines.test.mjs`.

### Preisänderung

Beträge und ein Bestätigungsknopf erscheinen nur, wenn die Antwort **beide** Beträge trägt. Fehlt einer, wird kein Betrag angezeigt und nur die Neuberechnung angeboten — ein Einzelbetrag wird nicht zu „neuer Preis" umgedeutet. Entschieden wird an der **Form der Antwort**, nie an einem Requestfeld.

Mit Zusatzabsicherung übernimmt „Neuen Preis übernehmen" den Preis **ausschließlich** über die Neubepreisung mit `acceptPriceChange: { expectedTotalGross }` — nie über eine Buchung. Erst nach der Serverbindung (neue `priceRevision`) bucht der Kunde bewusst erneut; `/book` sendet diese Revision mit. Eine erneute Abweichung öffnet wieder den Dialog, ein Fehler lässt ihn mit neutralem Hinweis offen.

- `recalculationRequired: true` ergibt **nie** einen Bestätigungsweg — auch nicht mit Beträgen und nicht aus dem zuletzt bestätigten Betrag ergänzt.
- `priceInputsRebindRequired: true` ebenso wenig (`PRICE_CHANGE_KIND.REBIND`): die Art der Lieferadresse wird neu geladen und neu bestätigt.
- Der Dialog ist nur die Anzeige: Escape und Hintergrund schließen ihn, die Preisänderung bleibt offen (`priceChangePending` im Price-View-Model → Status `PRICE_CHANGED`, kein Betrag, Buchung gesperrt). Der Bestellknopf bleibt durch den Hinweis ersetzt, bis übernommen oder neu berechnet wurde.
- „Angebote neu berechnen" verwirft die gespeicherten Angebote des Vorgangs; Formular und Angaben bleiben.
- Nach einer übernommenen Preisänderung trägt das Angebot die Versandbeträge der Serverantwort (`utils/acceptedOfferPrice.mjs`) — auf der Buchungsseite und in der Angebotsliste.

### Eine Preisprojektion

Alle Preisflächen der Buchung (Beleg = Live-Zusammenfassung, Sticky-Leiste, Preiszusammenfassung, Absicherungskarten, Buchungsgate; das ausgewählte Angebot fragt nur, ob ein Preis fehlt — „Buchung, Schritt 1“ unten) lesen **ein** `priceView` (`utils/bookingPriceView.mjs`); welcher Betrag gilt und wie er heißt („Gesamt"/„Versand"), entscheidet `priceInfo` (`utils/bookingSummaryView.mjs`). Der Nettogesamtbetrag ist `customerTotalNet` der Serverantwort — keine Addition im Client; fehlt er, bleibt er leer. Zustellung („Zustellung"/„Voraussichtliche Zustellung"/„Voraussichtliche Laufzeit") steht in `utils/deliveryContractView.mjs`, Abholung in `utils/pickupContractView.mjs`, Labelnamen („DIN A4", „Thermodruck") in `utils/labelFormatOptions.mjs` — Karte und Buchung nutzen dieselben Helfer.

### Labelformat ist eine Fähigkeit des Angebots

- Die A4/A6-Auswahl erscheint **nur**, wenn `labelFormatOptions` ein nicht leeres Array ist (`utils/labelFormatOptions.mjs`). Fehlt das Feld, ist es `null` oder leer: keine Auswahl, **kein** `labelFormat` im `/book` (fail-closed).
- Gesendet wird nur ein Wert aus den Optionen; ein gespeichertes Format (Vorgang/Entwurf) wird nur übernommen, wenn das Angebot es anbietet.
- `labelSizes` bleibt reine Auskunft über gelieferte Formate (neutraler Hinweis, z. B. „DIN A4 und Thermodruck").

### Absicherung gehört zu genau einem Angebot

- Der Buchungsteil des Vorgangs trägt `insuranceOfferKey` = `offerKey:offerRevision` (`insuranceRestoreKey`, `utils/insuranceRestore.mjs`). Schritt, Absicherung, Versicherungswert und die beiden Warenantworten werden **nur** bei gleichem Schlüssel wiederhergestellt; `null` passt nie, Entwürfe stellen nie eine Absicherung wieder her. `ceShipmentId` gehört nicht zum Schlüssel.
- Eine neue Bindung der Lieferadresse (neuer Preisstand, `insuranceReset`) hebt die Absicherung auf: keine alte Auswahl, kein alter Preis, keine alten Antworten — und die Seite sagt es dem Kunden.
- Jede relevante Eingabeänderung zählt die Neubepreisungssequenz hoch und bricht ab; nur die Antwort des neuesten Aufrufs darf den Preis bestätigen.

### Buchungsfehler: kein Wiederholen bei offenem Ausgang

- Nach dem Absenden der **finalen** Buchung sind Zeitlimit, Netzabbruch, unlesbarer Erfolg und 5xx **ohne** Code ein offener Ausgang (`PRUEFUNG_LAEUFT`): Konfliktfläche statt Bestellknopf, Weg in die Sendungen, nie „erneut versuchen".
- `OFFER_ALREADY_USED` (Buchung und Neubepreisung) führt in die Sendungen, `COLLECTION_DATE_MISSING`/`LABEL_FORMAT_NOT_SUPPORTED` zur Neuberechnung, `INVALID_REFERENCE_NUMBER` an das Referenzfeld.
- `422 BUSINESS_PROFILE_INCOMPLETE` (Buchung und Preisberechnung) zeigt den Weg ins Profil — keine Abmeldung. Echte 401/403 bleiben beim zentralen Auth-Redirect.

### Sendungsverfolgung — Fortschrittsfarben

- **Chronologischer grüner Fortschritt** (Betreiberentscheidung 2026-10-04): jedes gelieferte Ereignis ist erreicht — frühere und neuestes Ereignis grün. Den Ton bestimmt **eine** Regel, `trackingEventTone` (`utils/trackingLegsView.mjs`), für die öffentliche Trackingseite und die Kundenansicht der Sendungen gleich.
- Die öffentliche Stufenleiste zeigt erreichte **und** aktuelle Stufe grün, zukünftige neutral — ausschließlich unter `.tracking-steps`; der Buchungs-Stepper teilt die Klassen und behält seine Markenfarbe.
- **Ausnahme ohne Raten:** steht ein Abschnitt im normalisierten Stand `exception`, trägt nur sein neuestes Ereignis die Warnfarbe; die Leiste markiert bei einer belegten Ausnahme **keine** Stufe (`stepIndex: -1`, `pages/trackingView.mjs`), die Ausnahme steht im Hero. Welche normale Stufe vorher erreicht war, trägt der Vertrag nicht; einen eigenen Verzögerungsstand gibt es nicht.

### Fehlerdarstellung

Kein roher Backendwert im sichtbaren Text: unbekannte Status laufen über `statusFallback`, API-Fehler über `utils/apiError.mjs`, Buchungsfehler über `utils/bookingErrors.mjs`. Ein Fehlerzustand kann Zeichenkette **oder** Objekt sein — beide Formen müssen gerendert werden können (ein Objekt als React-Kind ist ein Renderfehler).

### Kundenbereich-Demo (Betreiberentscheidung 2026-10-27, Canonical v2.81) — aktueller Vertrag

Die öffentliche Demo unter `/demo` zeigt die **echten** Kundenseiten mit Beispieldaten — ohne Anmeldung und ohne jede Verbindung zum Server. Code unter `src/demo/`, Tests `src/demo/demoWelt.test.mjs` und `tests/e2e/premiumParityApp.test.mjs`.

- **Eigene Seitenladung:** `main.jsx` importiert als ERSTES `demo/demoStart.mjs`. Nur unter `/demo` und `/demo/…` (nie `/demonstration`, Groß- und Kleinschreibung wie die Route) schirmt es ab und rendert `DemoApp` (eigener Chunk); sonst tut es nichts. Die echte Anwendung leitet `/demo/*` per Seitenneuladen dorthin (`DemoNeuLaden` in `App.jsx`), die Demo verlässt sich selbst per Seitenneuladen (`DemoVerlassen`, Abmelden → `DemoEnde`). Beide Ausstiege laufen über `demoAusgangsziel`: immer ein Pfad derselben Domain — `/demo//fremd.example` oder Rückstriche führen nie auf einen fremden Host.
- **Drei Schutzwände, jede für sich ausreichend:** (1) Speicher — `localStorage` und `sessionStorage` werden durch Arbeitsspeicher ersetzt (`demoSpeicher.mjs`); gelingt das nicht, startet die Demo nicht (Hinweis statt Demo). Das echte Token und ein laufender Versandvorgang sind in der Demo unsichtbar und bleiben unverändert. (2) Daten — `apiFetch` fragt als erste Anweisung den Demo-Transport (`setzeDemoTransport`, gesetzt allein von `demoStart.mjs`) und ruft `fetch` nie auf; `demoBackend.mjs` beantwortet die Kundenendpunkte mit Beispieldaten. (3) Netz — `fetch` lehnt API, Anmeldung und fremde Hosts mit 503 ab (`demoNetz.mjs`); nur Dateien der eigenen Seite gehen durch.
- **Keine echte Wirkung:** keine Anmeldung, keine Buchung, kein Provider, keine Zahlung, keine E-Mail, keine echten Kundendaten. Was nicht simuliert ist (Passwort, E-Mail-Wechsel, Logo, Lagerbuchungen, Auftragsstorno, unbekannte Schreibvorgänge), antwortet 409 `DEMO_NOT_AVAILABLE` mit „In der Demo nicht verfügbar.“ — nie ein stiller Erfolg; unbekannte Lesevorgänge 404.
- **Kennzeichnung:** `DemoLeiste` auf jeder Seite („Demo mit Beispieldaten“, „Geschäftskonto registrieren“, „Demo beenden“), `<html data-ce-demo>`, Seitentitel „Demo · …“, `noindex`. Nummern mit `SIM-` bzw. `DEMO`, PDFs mit dem Aufdruck „SIMULATION“ (`demoPdf.mjs`). Die Buchungsbestätigung zeigt in der Demo die Marke „Simulation“, den Titel „Simulierte Buchung abgeschlossen“, den Hinweis `DEMO_TEXTE.buchungSimuliert` und statt der E-Mail-Zusage `DEMO_TEXTE.keineEmail` (`BookingSuccessStep`, `istDemo()`); außerhalb der Demo unverändert.
- **Router:** `BrowserRouter basename="/demo"` mit genau den Kundenrouten von `App.jsx` (Übersicht, Rechner, Buchung, Artikel- und Auftragsdetail). Router-Pfade stammen deshalb immer aus dem Router (`useLocation`), nie aus `window.location` — sonst setzte `navigate` die Basis ein zweites Mal davor (`demoWelt.test.mjs`, 14).
- **Preisrechner:** Kopf „Demo ansehen“ (ab 720 px), im Abschnitt „Versand und Logistik in einem Kundenbereich“ der Knopf „Kundenbereich ausprobieren“ und die Kundenbereich-Vorschau (G3, Canonical v2.82: Miniatur aus HTML und CSS, innen `aria-hidden`, zugänglicher Name „Kundenbereich-Demo öffnen“) — alle auf `https://confidaraexpress.de/demo`; auf der Preisrechner-Domain leitet `/demo` per 302 auf die Hauptdomain (`nginx.conf`). Die Demo beantwortet auch `GET /kunde/carriers` und liefert für die Lagerübersicht Vorschauzeilen wie der Server.

### Buchung, Schritt 1: Preis und Termine einmal im Beleg (G6/M9, Canonical v2.82) — aktueller Vertrag

- **Eine Stelle:** Preis, Abholung und Zustellung stehen genau einmal — im Beleg (`BookingLiveSummary`, ab 1440 px Seitenspalte, darunter kompakt über dem Blatt) und verkürzt in der klebenden Leiste (`BookingStickySummary`). Beide lesen `priceInfo`, `pickupSummaryOf(tariff, pickupWindow)` samt `pickupAdjustedNote` und `deliveryInfo` — keine eigene Ableitung aus Rohfeldern.
- **Ausgewähltes Angebot** (`OfferSummaryModule`, Props `tariff` und `priceView`): Carrier, Dienst und Übergabeart sowie die Hinweise, die sonst nirgends stehen — „Drucker erforderlich“, der Abholschluss heute (`sameDayUntilText`, `#offer-summary-sameday-until`) und „Preis fehlt“. Kein Betrag, keine Zustellung, keine Abholzeit.
- **MwSt.-Hinweis am Preis des Belegs:** `vatIncludedNote` (`utils/bookingSummaryView.mjs`) — „inkl. 19 % MwSt.“, bei bestätigter steuerfreier Absicherung „… auf Versand“, ohne Bruttobetrag „exkl. MwSt.“, nach einer Preisänderung nichts (`#booking-live-vat-note`). Zuschläge (Privatadresse, Same-Day) stehen am Preis im Beleg (`#booking-live-surcharge-note`, `#booking-live-sameday-note`).
- Tests: `utils/tg22GoldenOfferContract.test.mjs` (A6, E5, F3), `components/offers/pickupContractView.test.mjs`, `utils/vatDisplayContract.test.mjs` (14), `utils/tg22SameDayCollection.test.mjs` (9), `utils/bookingSummaryVatNote.test.mjs` und die Browser-Suiten der Buchung.

### Versanddienstleister in der Übersicht (G2, Canonical v2.82) — aktueller Vertrag

- **Quelle:** ausschließlich `GET /kunde/carriers` (`api/carriersApi.js`, `fetchCarrierPortfolio` wirft nie). Geladen in `DashboardPage` zusammen mit Sendungen, Rechnungen und Buchungsrahmen; die Übersicht und ihre Module laden nichts selbst.
- **Abbildung** (`utils/carrierPortfolioView.mjs`, `parseCarrierPortfolio`): nur Einträge mit Kennung und Namen, ohne den neutralen Rückfall `other`, ohne Doppelte; keine Antwort → `null`, dann keine Carrierzeile — nie eine feste Liste. Logos aus der öffentlichen Carrierzuordnung, keine Laufzeiten, keine Dienstnamen, keine Zahl im Titel; „Preise vergleichen“ führt zum Versandkostenrechner.

### Lager und Aufträge in der Übersicht (G1/D7, Canonical v2.82) — aktueller Vertrag

- **Quelle:** dieselbe Abfrage wie die Lagerübersicht (`getInventoryOverview`), geladen von `DashboardPage`, jedes Mal wenn die Übersicht geöffnet wird; eine verspätete Antwort verwirft der AbortController. Fehlertexte aus `inventoryErrorText`, Wiederholung über `onRetry`.
- **Darstellung** (`InventorySnapshot`): offene Aufträge und Artikel unter Mindestbestand mit höchstens drei Vorschauzeilen (`snapshotRows`, Serverreihenfolge), dazu verfügbare und heute versendete Einheiten. Der Leertext steht nur bei einer gemeldeten 0 — nennt der Server eine Zahl ohne Vorschauzeilen, führt der Link zur Liste. Ohne Artikel der Einstieg „Lager einrichten“.

### Anmeldung: statisches Seitengerüst (Abschnitt 5, Canonical v2.82) — aktueller Vertrag

- **Gerüst:** `login.html` und `register.html` (Repository-Wurzel, Eingänge des Hauptbuilds in `vite.config.js`) tragen das Endlayout — `data-ce-bereich="auth"`, Navy-Bühne, Satz und Unterzeile aus `utils/authSeitenText.mjs`, gerahmte Nachtkarte, Ansprechpartner aus `config/companyProfile.js` und ein Blatt gleicher Gestalt (`aria-hidden`, `inert`, ohne ids und Namen). Abgleich: `pages/authSeitenGeruest.test.mjs`; im Browser `tests/e2e/authSeitengeruest.test.mjs` (Gerüst und fertige Seite deckungsgleich, kein Ladebildschirm, CLS < 0,01).
- **Auslieferung:** nginx für `/login`, `/register`, `/registrieren` (exakte Locations mit vollständigem Sicherheitsheaderblock, `no-cache`); `/login.html` und `/register.html` leiten weiter. Entwicklungs- und Vorschauserver machen dasselbe nur für Seitenaufrufe (`Accept: text/html`). Eine Quelle der Pfade: `utils/kundenAuthPfad.mjs`.
- **Kein Zwischenbild:** ohne Token startet die Sitzungsprüfung nicht als „ladend“ (`AuthContext`), es erscheint kein Ladebildschirm; mit gespeichertem Token wartet `App` wie bisher auf jedem Pfad auf die Prüfung (sonst überschriebe eine verspätete Antwort eine neue Anmeldung oder die E-Mail-Bestätigung) — auf den Seiten mit Gerüst auf dessen dunklem Grund (`LoadingScreen` mit `dunkel`, E2E A3); `main.jsx` lädt die Anmeldeseite vor dem ersten Rendern (`utils/vorladbareSeite.js`) — React ersetzt das Gerüst ohne Suspense-Fläche. Die Lichter der Karte starten erst nach `img.decode()` (`AuthKarte`). Authentifizierung und Rechte entscheidet weiter allein der Server.

### Kopfsuche des Kundenbereichs (Premium-Redesign 2026-10-27, Canonical v2.81) — aktueller Vertrag

- **Ort:** im Utility-Cluster jedes Seitenkopfs des Kundenbereichs vor „Mitteilungen“ (`components/layout/KundenSuche.jsx`; `DashboardPage`, `Overview`, `DashboardLayout`), sichtbar ab 1024 px. Combobox mit Liste: Pfeiltasten wählen (`aria-activedescendant`), Enter öffnet, Escape schließt bzw. leert.
- **Quellen — keine neue Schnittstelle:** Sendungen und Rechnungen über die bestehenden Listen (`GET /kunde/shipments`, `GET /kunde/invoices`, Seiten zu 100, höchstens 10 Seiten; reicht das nicht, sagt die Suche es), Adressen über die Adressbuchsuche (`GET /api/kunde/addresses?q=…&limit=5`). Geladen wird erst beim Suchen; der Stand gilt eine Minute und nur für dieses Konto, nur im Arbeitsspeicher (`hooks/useKundenSuche.js`).
- **Treffer** (`utils/kundenSuche.mjs`, ab zwei Zeichen, ohne Akzent- und Großschreibung): Sendung nach Auftragsbestätigung, Trackingnummern, eigener Referenz und Empfänger (Firma, Name, Ort, PLZ); Rechnung nach Belegnummer; Adresse wie die Adressbuchsuche. Höchstens 4 / 2 / 2, in dieser Reihenfolge.
- **Öffnen:** Sendung → „Sendungen“, Rechnung → „Rechnungen“ — die Zeile bzw. Karte steht hervorgehoben (`.ce-suche-fokus`) und im Blick; stand sie nicht in den geladenen Seiten, steht sie vorn (nie doppelt). Adresse → „Adressbuch“ im Reiter ihrer Rolle mit Firma (sonst Name) als Suche. Die Navigation läuft über denselben Weg wie die Seitenleiste (Verlassen-Dialog von „Neue Sendung“ inklusive). Von Rechner, Buchung und Lagerdetails steht im Router-State — und damit im Browserverlauf — nur der Verweis (`sucheFokus: { art, id }`); das Listenobjekt mit Anschrift übergibt `sucheUebergeben`/`sucheUebernehmen` im Arbeitsspeicher, genau einmal.
