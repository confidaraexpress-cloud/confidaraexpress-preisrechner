# Canonical Project Context — zuerst lesen

**Vor jeder Arbeit an ConfidaraExpress: `CONFIDARAEXPRESS_CANONICAL_CONTEXT.md` (Repository-Wurzel) vollständig lesen.**

Sie ist die projektweite Quelle für Produktidentität, Systemstatus, Produktentscheidungen, kritische Invarianten, Providerarchitektur, Pricing, Billing, Legal, Launch-Scope und Sicherheitsgrenzen.

Diese `CLAUDE.md` enthält **ausschließlich Frontend-spezifische Zusatzregeln**. Sie wiederholt keine projektweiten Fakten.

**Autorität** (absteigend):

1. aktuelle menschliche Produktentscheidung
2. aktueller `origin/main`
3. Tests / CI / technische Verträge
4. `CONFIDARAEXPRESS_CANONICAL_CONTEXT.md`
5. diese `CLAUDE.md`
6. ältere Dokumentation (u. a. `docs/history/`)

Widersprechen sich Canonical Context und aktueller `origin/main`: **nicht still einer Seite folgen.** Drift melden, tatsächlichen Vertrag verifizieren, erst danach implementieren.

**Vorhandener Code ist kein Beweis für ein aktives Feature.**

Änderungen an `CONFIDARAEXPRESS_CANONICAL_CONTEXT.md` müssen in derselben Änderungssitzung in Frontend **und** Backend synchronisiert werden. Ist nur eine Kopie änderbar, darf nicht behauptet werden, beide seien synchron — die offene Synchronisation gehört ausdrücklich in den Abschlussbericht.

---

## Repository Purpose

Frontend von ConfidaraExpress: React-SPA (Vite, JavaScript, kein TypeScript), ausgeliefert als statisches Bundle über nginx.

Die Backend-API ist **extern** und liegt nicht in diesem Repository.

Framework-/Runtimeversionen stehen in `package.json` und den CI-Workflows — **nicht** in dieser Datei. Sie altern dort nicht.

---

## Commands

```bash
npm run dev       # Vite Dev-Server (0.0.0.0)
npm run build     # Produktionsbuild nach dist/
npm run preview   # Build-Vorschau
npm test          # Unit-/Vertragstests (Node Test Runner)
npm run test:e2e  # Browser-E2E (Playwright, eigener Runner)
```

**Kein Lint-Skript.** Das ist der Bestand, kein Versehen — keines erfinden.

Docker: `docker build -t confidaraexpress .` → nginx auf Port 80.

---

## Testing & Build

### Architektur

- Unit-/Vertragstests laufen über den **Node Test Runner** auf `.mjs`-Dateien. Geschäftslogik gehört deshalb in framework-freie `.mjs`-Module, damit sie ohne DOM prüfbar bleibt.
- **Es gibt keine React-Render-Testschicht** (kein jsdom, kein Testing-Library, kein vitest). Aussagen über Komponentenverhalten werden über reine Helfer plus **Quelltextanker** abgesichert.
- **Testauffindung statt Testliste:** `npm test` und `scripts/run-e2e.mjs` *suchen* die Dateien. Eine neu angelegte Suite läuft dadurch zwangsläufig mit — es gibt keine Liste, die man vergessen kann.

### Quelltextanker — Fallen

- Anker auf **kommentarfreiem** Code messen. Sonst prüft der Test die Begründung statt des Programms (die Erklärung, warum kein `<Switch>` verwendet wird, enthält zwangsläufig das Wort „Switch").
- Zeilenkommentar-Ausdrücke brauchen das `m`-Flag. Ohne `m` verlangt `$` das Ende der ganzen Zeichenkette, und ein zurückbleibendes `\r` (CRLF-Checkout) lässt den Ausdruck ins Leere laufen.
- Dateipfade über `fileURLToPath(import.meta.url)` auflösen, **nicht** über `new URL(...).pathname` — unter Windows ergibt das `/C:/…` und mit `path.join` einen doppelten Laufwerksbuchstaben.

### E2E-Verträge

- Jede E2E-Suite mockt ihre Backendaufrufe über `page.route` gegen einen lokalen Dev-Server. **Kein echtes Backend, keine Bestellung, keine E-Mail.**
- **Jede Suite, die die Buchungsseite erreicht, muss `GET /api/legal/booking-context` beantworten.** Ohne Antwort greift der Sammelfall, die Auswertung wertet das fail-closed, und die Bestellung ist gesperrt — richtiges Produktverhalten, aber die Suite muss den Endpunkt kennen.
- **Dev-Server-Teardown:** `spawn` mit `detached: true`, Beendigung über `process.kill(-pid)` in `try`. Ein Signal an den npx-Prozess allein lässt Kind und Enkel samt Port stehen; ein ungefangenes `ESRCH` färbt eine bestandene Suite rot.
- **Portregel:** jede Suite hat ihren eigenen Port (`--strictPort`). Zwei Suiten auf demselben Port machen den Lauf nicht wiederholbar.
- Bedienelemente über stabile `id`s ansprechen, **nicht** über Platzhaltertexte oder Positionen. Ein Platzhalter ist Beschriftung, kein Selektor.
- Nichts erzwingen: kein `force`-Klick, kein Entfernen von `disabled`. Genau das umginge die Produktprüfung, um die es geht.

### Lokale Verifikation vs. CI

Lokal die für die Änderung **relevanten** Tests plus `npm run build`. Die vollständige Browser-E2E-Suite läuft lokal nur, wenn Umfang/Risiko es rechtfertigen — CI führt sie ohnehin als PR-Gate aus (Details: Canonical Context §17).

**Keine Testanzahlen** in dieser Datei oder im Canonical Context festschreiben; sie altern sofort.

---

## Frontend-Architektur

Logische Schichten unter `src/`:

| Verzeichnis | Zweck |
| --- | --- |
| `api/` | **einziger** Backendzugriff (`client.js` + Bereichsmodule) |
| `components/` | wiederverwendbare UI-Bauteile, nach Bereich gruppiert |
| `pages/` | Seiten und Seitenlayouts |
| `context/` | React-Provider (Auth, Versandvorgang, Benachrichtigungen, Paketshop-Finder) |
| `hooks/` | wiederverwendbare Hooks |
| `utils/` | framework-freie Logik (`.mjs`) und Helfer |
| `config/` | statische Produkt-/Launchkonstanten |
| `routes/` | Routenschutz |
| `styles/` | Stylesheets + Designsystem-Governance-Tests |
| `testing/` | Testhilfen des Produktionsbaums |
| `assets/` | Bilder, Icons, Schriften |

**Keine zweite API-Abstraktion anlegen.** Backend-Kommunikation gehört in den bestehenden `src/api/`-Vertrag — insbesondere keine Verzeichnisse `services/` oder `lib/`.

Alle Seiten sind `React.lazy`-geladen; neue Seiten ebenso einbinden.

---

## Design- und CSS-Architektur

### Getrennte Tokenfamilien — nicht vermischen

| Familie | Gilt für |
| --- | --- |
| `--ce-app-*`, `--ce-sidebar-*` | App-Chrome des eingeloggten Bereichs |
| `--surface*`, `--border-*`, `--text-*`, `--shadow-card*` | Inhaltsflächen im eingeloggten Bereich |
| `--ce-kpi-*` | ausschließlich die KPI-Karten der Übersicht |
| `--auth-*` | ausschließlich Auth-Bereich |
| `--adm-*` / `.adm-*` | ausschließlich Adminbereich |
| Legacy (`--navy`, `--gray*`, `--blue*`) | Booking, Legal, Angebots-/Preisrechnerkarten |

Farbwerte, Radien und Tiefen kommen aus `variables.css` (`--ce-radius-*`, `--ce-elevation-*`). Bereichs-Stylesheets tragen keine Farbliterale.

### Importreihenfolge (`styles/index.css`) — tragend

`primitives.css` steht **nach** `buttons.css`/`forms.css` (der Fokusstandard soll dort greifen) und **vor** allen Bereichs-Stylesheets (deren höher spezifische Sonderfälle bleiben wirksam). `dashboard-premium.css` steht **nach** `dashboard.css`. `patterns.css` wird als einzige Datei **nach** den Bereichs-Stylesheets importiert.

### Primitives und Muster zuerst benutzen

Buttons (`.btn` + Varianten), Eingaben (`.field-*`), `Switch`, Badges, Karten, `Icon.jsx`, `PageHeader`, `UserChip`, `StateView`, `useDialog`, `statusFallback` — vor jedem neuen Bauteil prüfen, ob das Muster bereits existiert.

**Eigenes Icon-System** (`components/ui/Icon.jsx`). Keine externe Icon-Bibliothek einführen; mehrere Tests verbieten das ausdrücklich.

### Typografie

Eine Skala aus `--ce-text-*`. Cormorant nur für Kundenseitentitel und die Begrüßung, DM Sans für alles Funktionale und alle Zahlen. Keine Halbpixel, nichts unter 11 px, höchstes Gewicht 600. Zahlen tabellarisch und in Zahlenspalten rechtsbündig.

### App-Shell und Sidebar

`.app-shell` ist der einzige Layoutrahmen des eingeloggten Bereichs — keine seitenabhängigen Theme-Klassen, keine zweite Hintergrundebene, keine Dekoration im Hintergrund. Die Navigation hat genau zwei Ebenen; höchstens eine Gruppe ist offen, und der Klappzustand ist ein Wert, keine Booleanmenge.

`min-height: 100dvh` statt `100vh` bei Vollbildlayouts.

---

## Lokale technische Fallen

- **Vite inlined SVG unter ~4 KB** als Data-URI ins JS-Bundle. Beim Debugging im Network-Tab nicht wundern.
- **Statische Asset-Importe** sind Pflicht (`import logo from "../assets/…"`); kein dynamischer Pfadaufbau.
- **CSP ↔ Build-Variablen:** `nginx.conf` nennt in `connect-src`/`img-src` Hosts, die als Buildvariablen im Bundle landen (`VITE_API_URL`, Kachelhost). Wer einen davon ändert, **muss** `nginx.conf` nachziehen — sonst blockiert der Browser jeden API-Aufruf beziehungsweise die Karte. `add_header` wird zudem nicht vererbt: eine neue `location` mit eigenem `add_header` muss den Sicherheitsheaderblock mitkopieren.
- **Browser-Icons sind versioniert** (`favicon-v2.svg`, `apple-touch-icon-v1.png`). Statische Assets gehen mit `immutable` hinaus; ein Wechsel unter festem Namen bliebe für wiederkehrende Besucher lange unsichtbar. Bei sichtbarer Änderung die Zahl hochzählen.
- **Fehlergrenzen:** es gibt genau **eine** Fehlergrenzen-Komponente (`ContentErrorBoundary`), eingesetzt an Wurzel, Auth, öffentlichem Layout, Admin und Dashboard. Kein zweites Muster daneben; niemals automatisch neu laden.
- **Abhängigkeiten pinnen** (`^x.y.z`), kein `latest`. `Dockerfile` nutzt `npm ci`.

---

## Offer- und Booking-Verträge des Frontends

Diese Regeln sind Frontend-spezifisch. Die **projektweiten** Provider-, Preis- und Buchbarkeitsregeln stehen im Canonical Context (§5, §6) und werden hier nicht wiederholt.

### Angebotsidentität

- `offerKey(tariff)` (`utils/offerIdentity.mjs`) ist die **einzige** Antwort auf „welches Angebot ist das?": `offerId` zuerst, Tarif-ID nur als Rückfall, sonst `null`.
- `sameOffer()` vergleicht zwei `null` ausdrücklich als **verschieden**. Ohne diese Regel gälte `undefined === undefined` — jede kennungslose Karte wäre „ausgewählt", teilte sich ein Badge und eine DOM-Kennung.
- `offerBlocked(t)` ist wahr **nur** bei einer ausdrücklichen Serveraussage (`bookable === false` oder `availableForDate === false`). Ein **fehlendes** Feld sperrt nichts — `!t.bookable` würde jedes Angebot aus einer älteren Antwort sperren.
- `offerBookable()` sagt, ob ein Angebot beauftragt werden kann (Auszeichnungen). Die **Aktionen** (CTA, Kartenklick, Weg zur Buchungsseite) hängen an `offerSelectable()`: buchbar **oder** nur noch auf die Art der Lieferadresse wartend (`unavailableReason: "price_inputs_required"`). Keines von beiden steuert die optische Wertigkeit — ein nicht bestellbares Angebot bleibt eine vollwertige Preisauskunft und wird nicht blass gezeichnet; sein Preis bleibt sichtbar.
- Der Grund wird **übersetzt**, nie durchgereicht; ein unbekannter Grund ergibt den neutralen Satz. Kein Einkaufsprovider im sichtbaren Text.

### Sendungshandle

Kundenseitige Sendungsoperationen adressieren über **`ceShipmentId`** (`shipments.id`) — nach der Buchung (Label, Tracking, Stornoanfrage) **und** davor (Buchung, Neubepreisung, Warenkorbvorschau, Abholzeitfenster, Handelsrechnung, Entwurf speichern). Eine Providerreferenz kennt der Client nicht: sie steht in keiner Kundenantwort, wird nie gesendet und nie im Vorgang geführt. Das Backend nimmt die Altform nur noch als Eingabe älterer Bundles an.

### Dreiwertige Angaben

`true` / `false` / unbeantwortet sind drei Zustände. `false` ist eine vollwertige Antwort. Deshalb `?? null` statt `|| null`, `tristate()` statt `bool()` und `checked={wert === true}` statt `checked={wert}`. Kein `<Switch>` für eine dreiwertige Angabe — er stünde beim Öffnen auf „aus" und behauptete eine Antwort, die niemand gegeben hat.

### Angaben zur Art der Adresse — aktueller Vertrag

Die Art der Lieferadresse ist **keine Formularangabe** mehr. „Neue Sendung" erhebt vor dem Vergleich nur Inhalt und Warenwert; eine Abholadressfrage gibt es nicht. Eine Adressart aus einem älteren Entwurf oder Vorgang wird beim Zurücklesen ignoriert — nie gesendet, nie zur Sperre.

- **Welches Angebot fragt, sagt der Server:** nur ein Angebot, dessen `requiredPriceInputs` `deliveryIsResidential` nennt (`utils/residentialPriceInputs.mjs`). Im Vergleich ist es `bookable: false` mit `unavailableReason: "price_inputs_required"` — auswählbar, nicht buchbar; die Karte zeigt „Vorläufiger Preis" und „Bei einer privaten Lieferadresse kann ein Zuschlag anfallen." (kein „ab"-Betrag). Jedes andere Angebot bekommt weder Frage noch Anfrage.
- **Schritt 1 der Buchungsseite lädt die Optionen selbst** (`POST /api/offers/price-input-options` über `src/api/client.js`) und zeigt zwei Karten mit den Serverbeträgen („+ X,XX € brutto", darunter „Y,YY € netto"). Kein lokaler Ersatzpreis: bei einem Fehler nur der Hinweis und „Erneut versuchen".
- **Die Wahl bindet der Server** (`POST /api/offers/price-inputs`; `expectedShippingGross` ist nur ein Wächter). Während einer Bindung sind beide Karten gesperrt, ein Doppelklick bindet einmal. Die Antwort geht ins ausgewählte Angebot **und** in die Angebotsliste des Vorgangs (`offerRevision`, `priceInputs`, `priceComponents`); `requiredPriceInputs` bleibt die Liste des Vergleichs.
- **Bis zur Bindung** ist der Preis vorläufig (`PRICE_STATUS.PRICE_INPUTS_REQUIRED`), die Absicherung weder sichtbar noch bepreisbar und die Buchung gesperrt (Weiter-Gate und `doBook`).
- **Wiederherstellung** nach Reload oder Rückkehr ausschließlich über `boundValue` der Optionsantwort — nie aus einem Clientspeicher. Trägt das Angebot die Serverbindung nicht, wird dieselbe Wahl still und idempotent gebunden.
- **Veralteter Stand** (`OFFER_PRICE_CONFLICT`, `PRICE_INPUT_OPTIONS_EXPIRED`, `PRICE_CONFIRMATION_REQUIRED`) lädt die Optionen neu, der Kunde wählt erneut. `PRICE_CHANGED` mit `priceInputsRebindRequired` (Neubepreisung oder `/book`) hat **keinen Übernahmeweg**: zurück an die Auswahl, neu bestätigen.
- `/book` sendet für ein solches Angebot `offerRevision` und die gebundene Wahl als `priceInputs` (Konsistenzwächter) — nie einen Formularwert. `false` bleibt „Geschäftsadresse" und wird nie als „fehlt" behandelt.
- **Bestandteile** (`shipping_base` „Versand", `residential_delivery_surcharge` „Zuschlag Privatadresse", `transport_insurance` „Zusätzliche Transportabsicherung") liest `utils/priceComponentsView.mjs` — nur zum bestätigten Preis, nie addiert. Ein unbekannter Typ ergibt keine Zeilen; die Server-Totals bleiben. Für eine Abholung am selben Tag steht `same_day_collection_surcharge` („Zuschlag für Abholung am selben Tag") zwischen Versand und Privatadresse.

### Abholung am selben Tag (TG22/TG23 Same-Day) — aktueller Vertrag

Ob ein Angebot **heute** abgeholt werden kann, bis wann und mit welchem Zuschlag, sagt ausschließlich der Server. Die Oberfläche vergleicht kein Datum, liest keine Uhr und rechnet nichts (`utils/sameDayCollectionView.mjs`).

- **Karte:** nur mit `pickupToday: true`, `pickupTodayUntil` („HH:MM") **und** beiden Beträgen `sameDaySurchargeNet`/`sameDaySurchargeGross` erscheinen „Zuschlag für Abholung am selben Tag: +X,XX €" (netto oder brutto wie der Kartenpreis, im Detailbereich beide) und „Abholung heute möglich bis HH:MM Uhr". Der Kartenpreis **enthält** den Zuschlag — nichts wird addiert. Ein Tarif mit `pickupToday`, aber ohne diese Angaben, bekommt keine Zeile.
- **Gesperrte Abholung heute** — drei Gründe, sichtbar mit Preis, nicht auswählbar; der Knopf sagt den Satz, darunter immer „Bitte wählen Sie einen späteren Abholtag.":
  - `same_day_unavailable` (Abholschluss vorbei): „Abholung heute nicht mehr möglich."
  - `same_day_unconfirmed` (kein bestätigter Abholschluss): „Abholung heute für dieses Angebot nicht verfügbar."
  - `same_day_unverifiable` (Angaben nicht prüfbar): „Abholung heute kann derzeit nicht bestätigt werden."
  - Ein unbekannter Grund ergibt den neutralen Satz. Der Server nennt den Tag, aber `collectionReadyFrom: null` — die Karte zeigt keine „bereit ab"-Zeile. Ein späterer Abholtag behält seine Zeit (09:00), eine verfügbare Abholung heute die dynamische.
- **Buchungsseite:** Options- und Bindungsantwort tragen für eine Abholung heute den Block `sameDayCollection` (`pickupTodayUntil`, `collectionDate`, `collectionReadyFrom`, `surcharge`); ein Block in anderer Form verwirft die Antwort. Die Bindung übernimmt `collectionReadyFrom` ins Angebot — die „bereit ab"-Zeit, die jetzt gälte. Live-Leiste und ausgewähltes Angebot nennen „inkl. Zuschlag für Abholung am selben Tag X,XX €" (vorläufig aus dem Angebot, bestätigt aus dem Bestandteil) und den Abholschluss.
- **`/book` sendet keine Same-Day-Angabe.** Der Erfolg nennt die tatsächlich gesendete Abholzeit ausschließlich aus `booking.sameDayCollection` — nie aus dem Angebot.
- **`SAME_DAY_COLLECTION_UNAVAILABLE`** (Optionen, Bindung, Neubepreisung, `/book`): der Satz zu `sameDayUnavailableKind` (`expired` / `unconfirmed` / `unverifiable`, über `sameDayUnavailableBookingText`) mit dem Hinweis und „Angebote neu berechnen" — nie „erneut versuchen". Fehlt die Art oder ist sie unbekannt, gilt „kann derzeit nicht bestätigt werden". Eine Änderung des Zuschlags kommt als `PRICE_CHANGED` mit `priceInputsRebindRequired` und läuft über den bestehenden Neubestätigungsweg.
- Ein Datumswechsel verwirft die Angebote (`resetResults`); Entwürfe und Vorgang speichern keine Same-Day-Angabe.

### Produktprofil (TG22 Package A) — aktueller Vertrag

Welche Produktangaben ein Angebot trägt, sagt ausschließlich der Server: `serviceDetails` (`summaryKey`, `volumetricDivisor`, `notAccepted`, `basicCoverMaxGoodsValue`, `maxCoverValue` — Codes und Zahlen) neben `tariffLimits`, `trackingAvailable`, `printerRequired`, `chargeableWeight`, Labelangaben und Laufzeit. `utils/serviceDetailsView.mjs` bildet daraus die Sätze, `components/offers/ServiceProfileDetails.jsx` zeigt sie.

- **Nur mit gültigem Profil:** ein unbekannter Code, ein Divisor, der weder `null` noch eine positive ganze Zahl ist, oder unvollständige Absicherungsgrenzen ergeben `null` — dann bleibt der bisherige Detailbereich (Merkmalsraster, Einschränkungen, Versicherung) unverändert. Keine ServiceID-, Carrier- oder Providerprüfung im JSX.
- **Nicht belegter Divisor** (`volumetricDivisor: null`): das Profil entsteht, aber „Größe & Gewicht" zeigt weder die Formel noch den Abrechnungshinweis; ohne Zeilen entfällt der Abschnitt (`size: null`).
- **Fünf Abschnitte statt Hauptmerkmale/Einschränkungen/Versicherung:** „Hauptmerkmale", „Laufzeit" (genau einmal), „Größe & Gewicht", „Transportabsicherung", „Einschränkungen". „Termin & Abholung", „Preisaufschlüsselung", Links und Zusatzhinweise bleiben für jedes Angebot.
- **Nichts wird gerechnet:** der Divisor steht nur in „Volumengewicht: L × B × H ÷ 5.000" (nur mit belegtem Divisor); das Abrechnungsgewicht ist der Serverwert; aus der Laufzeit rechnet die Oberfläche kein Datum (die voraussichtliche Lieferung kommt fertig vom Server, siehe unten).
- **Nie im Profil:** Access Point, Samstagszustellung, Länge oder Gurtmaß, Zustelluhrzeit, ein Zustelldatum außer der Prognose des Servers, „garantiert", statische Zuschläge, Anbietername, externe Links.
- **Selbstbeteiligung** nur aus `insuranceDetails` und nur, wenn die zusätzliche Absicherung wählbar ist; eine Absicherung in Stufen beschreibt das Profil nicht (dann bisheriger Bereich).
- **Responsive:** `.offer-profile-*` mit Umbruchschutz; bis 767 px Merkmale einspaltig, bis 480 px Beschriftung über dem Wert.

### Voraussichtliche Lieferung (TG22 Package B) — aktueller Vertrag

Ob ein Angebot eine voraussichtliche Lieferung trägt und welche Tage, sagt ausschließlich der Server: `deliveryProjection { kind: "estimated", dateMin, dateMax }` — eine Prognose von ConfidaraExpress aus Abholtag und Laufzeit (Montag bis Freitag, ohne Feiertage), keine Anbieterzusage. `utils/deliveryProjectionView.mjs` prüft und formatiert nur.

- **Nichts wird gerechnet:** keine Versandtage, kein `Date.now`, keine Browseruhr, kein `toLocale…`; die Wochentage kommen aus einer festen Tabelle („Di., 15.09."). Ein ungültiges Datum, `dateMax` vor `dateMin` oder ein anderer `kind` ergibt keine Prognose — nie einen Fehler und nie einen Ersatz.
- **Rangfolge** (`utils/deliveryContractView.mjs`): Zeitraum des Anbieters → Datum des Anbieters → Prognose → Laufzeit → „Auf Anfrage". Zustelldaten eines Anbieters haben immer Vorrang; JUMiNGO bleibt „Zustellung" mit „bis HH:MM Uhr".
- **Karte:** Endknoten „Voraussichtliche Lieferung" mit „Di., 15.09. – Mi., 16.09.", „Di., 15.09." oder „ab Di., 15.09." (`dateMax: null`) — ohne Uhrzeit. Die Laufzeit („1–2 Tage") bleibt stehen.
- **Detailbereich:** im Abschnitt „Laufzeit" unter „Voraussichtliche Laufzeit" genau eine Zeile „Voraussichtliche Lieferung" und der Hinweis „Aus Abholtag und Laufzeit berechnet; Wochenenden sind nicht mitgezählt. Feiertage können die Zustellung verschieben."
- **Buchungsflächen** (`deliveryInfo`): „Voraussichtliche Lieferung" mit TT.MM.JJJJ („15.09.2026 – 16.09.2026", „ab 15.09.2026"), kein `until`.
- **Keine Autorität:** der Lieferdatumsfilter liest nur `deliveryDateMax`/`deliveryDate`, Auszeichnungen und Sortierung lesen Preis und Laufzeittage. Nie sichtbar: „garantiert", eine Uhrzeit, Anbietername, Quelle oder `kind`.

### Expressversand (TG23) — aktueller Vertrag

Das zweite öffentlich freigegebene Transglobal-Produkt erscheint als „UPS · Expressversand" im **gemeinsamen** Angebots- und Buchungsfluss — ohne eigene Karte, eigene Seite oder ServiceID-Prüfung. Was es kann, sagt der Server über dieselben Felder wie oben:

- **Profil:** `serviceDetails.summaryKey: "express_urgent"` → „Schneller Expressversand für eilige Sendungen." (`SERVICE_SUMMARY_TEXT` in `utils/serviceDetailsView.mjs` — die einzige TG23-Ergänzung im Produktionscode). Dazu aus den bestehenden Feldern: „1 je Sendung", „70 kg", „L × B × H ÷ 5.000", Paletten und Koffer, Sendungsverfolgung, „PDF · DIN A4 / Thermodruck".
- **Laufzeit „1 Tag"** und „Voraussichtliche Lieferung" aus `deliveryProjection` (ein Tag, ohne Uhrzeit, keine Zusage) — nie „bis 12 Uhr", „Tagesende" oder „garantiert".
- **Art der Lieferadresse, Abholung am selben Tag, Transportabsicherung, Preisbestandteile und Preisänderung** laufen unverändert über die Verträge oben; der Expressaufschlag steckt im Serverpreis, die Absicherung bleibt 1:1 und steuerfrei.
- **JUMiNGO unverändert:** das JUMiNGO-Pendant heißt ebenfalls „Expressversand" und bleibt mit Anbieterdatum und „bis HH:MM Uhr" daneben sichtbar.
- **Nie sichtbar:** Einkaufsquelle, ServiceID, QuoteID, Anbietercodes. Browserprüfung: `tests/e2e/tg23ExpressSaver.test.mjs`.

### UPS-Familie (TG29 UPS · Express, TG26 UPS · Standardversand Mehrpaket) — aktueller Vertrag

Beide Produkte laufen durch denselben Angebots-, Buchungs- und Sendungsfluss wie 22 und 23. Der Name kommt vom Server; kein Produktionsmodul buchstabiert „Express", „Mehrpaket" oder eine ServiceID nach (`utils/upsFamilyFrontend.test.mjs`).

- **UPS · Express bis zur Freigabe:** `quote_only` — Preis sichtbar, Knopf „Derzeit nicht direkt buchbar", keine Adressfrage, keine Abholung heute, keine Absicherung, keine Auszeichnung. Das Profil (`express_urgent`) steht mit nicht belegtem Divisor und ohne Gewichtsgrenze da; „Voraussichtliche Lieferung" als ein Tag, nie eine Uhrzeit oder Zusage. Nach der Freigabe trägt der Server dieselben Felder wie bei 23 — die Oberfläche ändert sich nicht.
- **UPS · Standardversand Mehrpaket:** Preisauskunft ohne Profil und ohne Prognose — der bisherige Detailbereich, keine erfundene Grenze.
- **Preisauskunft bleibt lesbar:** gesperrt ist allein der CTA (`disabled`, Grund im `aria-label`). Die Karte trägt **kein** `aria-disabled` — es vererbt sich auf „Details anzeigen", Screenreader und Playwright hielten den Knopf für gesperrt.
- **Mehrere Packstücke:** eine Gewichts-/Maßangabe je Paket × Anzahl („Identische Pakete"). `packageSummaryLine` ergibt „2 Pakete · je 4 kg · 40 × 30 × 20 cm" (Buchungsseite Schritt 1 und 2).
- **Mehrere Belege:** die Knöpfe tragen die Servernamen („Versandlabel 1 von 2 (A4)" …) in Serverreihenfolge, das Abholetikett zuletzt; der Dateiname kommt aus `Content-Disposition` (eindeutig je Position und Format), der Rückfallname nur als Netz.
- **Mehrere Trackingnummern:** Liste „2 Trackingnummern", Detail und Live-Ansicht vollständig, je Etappe „UPS · <Nummer>"; eine einzelne Nummer bleibt die bisherige Anzeige. Das Admin-Detail listet alle Referenzen und Anbieterbelege.
- Browserprüfung: `tests/e2e/upsFamilyOffers.test.mjs` (Vergleich, Details, Preisrechner, Mehrpaketbuchung als reiner Serverwert, Meine Sendungen, 834/390 px).

### Preisänderung

Beträge und ein Bestätigungsknopf erscheinen nur, wenn die Antwort **beide** Beträge trägt. Fehlt einer, wird kein Betrag angezeigt und nur die Neuberechnung angeboten — ein Einzelbetrag wird nicht zu „neuer Preis" umgedeutet. Entschieden wird an der **Form der Antwort**, nie an einem Requestfeld.

Mit Zusatzabsicherung übernimmt „Neuen Preis übernehmen" den Preis **ausschließlich** über die Neubepreisung mit `acceptPriceChange: { expectedTotalGross }` — nie über eine Buchung. Erst nach der Serverbindung (neue `priceRevision`) bucht der Kunde bewusst erneut; `/book` sendet diese Revision mit. Eine erneute Abweichung öffnet wieder den Dialog, ein Fehler lässt ihn mit neutralem Hinweis offen.

- `recalculationRequired: true` ergibt **nie** einen Bestätigungsweg — auch nicht mit Beträgen und nicht aus dem zuletzt bestätigten Betrag ergänzt.
- `priceInputsRebindRequired: true` ebenso wenig (`PRICE_CHANGE_KIND.REBIND`): die Art der Lieferadresse wird neu geladen und neu bestätigt.
- Der Dialog ist nur die Anzeige: Escape und Hintergrund schließen ihn, die Preisänderung bleibt offen (`priceChangePending` im Price-View-Model → Status `PRICE_CHANGED`, kein Betrag, Buchung gesperrt). Der Bestellknopf bleibt durch den Hinweis ersetzt, bis übernommen oder neu berechnet wurde.
- „Angebote neu berechnen" verwirft die gespeicherten Angebote des Vorgangs; Formular und Angaben bleiben.
- Nach einer übernommenen Preisänderung trägt das Angebot die Versandbeträge der Serverantwort (`utils/acceptedOfferPrice.mjs`) — auf der Buchungsseite und in der Angebotsliste.

### Eine Preisprojektion

Alle Preisflächen der Buchung (ausgewähltes Angebot, Live- und Sticky-Leiste, Preiszusammenfassung, Absicherungskarten, Buchungsgate) lesen **ein** `priceView` (`utils/bookingPriceView.mjs`); welcher Betrag gilt und wie er heißt („Gesamt"/„Versand"), entscheidet `priceInfo` (`utils/bookingSummaryView.mjs`). Der Nettogesamtbetrag ist `customerTotalNet` der Serverantwort — keine Addition im Client; fehlt er, bleibt er leer. Zustellung („Zustellung"/„Voraussichtliche Lieferung"/„Voraussichtliche Laufzeit") steht in `utils/deliveryContractView.mjs`, Abholung in `utils/pickupContractView.mjs`, Labelnamen („DIN A4", „Thermodruck") in `utils/labelFormatOptions.mjs` — Karte und Buchung nutzen dieselben Helfer.

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

### Fehlerdarstellung

Kein roher Backendwert im sichtbaren Text: unbekannte Status laufen über `statusFallback`, API-Fehler über `utils/apiError.mjs`, Buchungsfehler über `utils/bookingErrors.mjs`. Ein Fehlerzustand kann Zeichenkette **oder** Objekt sein — beide Formen müssen gerendert werden können (ein Objekt als React-Kind ist ein Renderfehler).

---

## Verbotene Muster

- zweite API-Schicht neben `src/api/`
- externe Icon-Bibliothek
- `dangerouslySetInnerHTML`
- Tokenfamilien vermischen (`--auth-*` außerhalb Auth, `--adm-*` außerhalb Admin)
- `.ce-num` auf frei stehenden Werten (es ist ein **Tabellenspalten**-Marker und richtet sonst am falschen Rand aus)
- Truthiness auf dreiwertigen Angaben
- Provider-/Einkaufsnamen in kundensichtbarem Text
- Testanzahlen, Branchnamen oder Paketstände in dieser Datei
- `console.log` mit Tokens oder Nutzerdaten
- neue Abhängigkeiten mit `latest`

---

## Git / PR

Der allgemeine Workflow steht im Canonical Context §18. Zusätzlich für dieses Repository:

- Vor Commits mit Stylesheet- oder Import-Änderungen `npm run build` ausführen — fehlende statische Importe und falsche CSS-Pfade meldet erst Vite, kein Test.
- Kein Branchname wird in dieser Datei festgeschrieben. Den aktuellen Stand über `git branch --show-current` und `git fetch origin` ermitteln.

---

## Drift Handling

Widerspricht diese Datei dem Canonical Context, **gewinnt der Canonical Context**.

Widerspricht der Canonical Context dem aktuellen `origin/main`, wird die Abweichung gemeldet und der tatsächliche Vertrag im Code verifiziert — nicht geraten und nicht still umgedeutet.

Historischer Kontext (Stand 2026-09-09, vor dieser Kürzung) liegt in `docs/history/CLAUDE_CONTEXT_ARCHIVE_2026-09-09.md`. Er ist **nicht** kanonisch und enthält bekannt veraltete Zustandsaussagen; er wird nicht automatisch geladen.
