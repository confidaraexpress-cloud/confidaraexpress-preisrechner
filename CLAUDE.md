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
- `offerBookable()` steuert **Aktionen** (CTA, Kartenklick, Auszeichnungen), nicht die optische Wertigkeit. Ein nicht bestellbares Angebot bleibt eine vollwertige Preisauskunft und wird nicht blass gezeichnet; sein Preis bleibt sichtbar.
- Der Grund wird **übersetzt**, nie durchgereicht; ein unbekannter Grund ergibt den neutralen Satz. Kein Einkaufsprovider im sichtbaren Text.

### Sendungshandle

Kundenseitige Sendungsoperationen adressieren über **`ceShipmentId`** (`shipments.id`) — nach der Buchung (Label, Tracking, Stornoanfrage) **und** davor (Buchung, Neubepreisung, Warenkorbvorschau, Abholzeitfenster, Handelsrechnung, Entwurf speichern). Eine Providerreferenz kennt der Client nicht: sie steht in keiner Kundenantwort, wird nie gesendet und nie im Vorgang geführt. Das Backend nimmt die Altform nur noch als Eingabe älterer Bundles an.

### Dreiwertige Angaben

`true` / `false` / unbeantwortet sind drei Zustände. `false` ist eine vollwertige Antwort. Deshalb `?? null` statt `|| null`, `tristate()` statt `bool()` und `checked={wert === true}` statt `checked={wert}`. Kein `<Switch>` für eine dreiwertige Angabe — er stünde beim Öffnen auf „aus" und behauptete eine Antwort, die niemand gegeben hat.

### Angaben zur Art der Adresse — aktueller Vertrag

Die Angaben werden im **Sendungsformular** erhoben, bestimmen dort den Vergleichspreis mit und werden serverseitig an der Sendung eingefroren.

Auf der Buchungsseite gilt seitdem:

- **Bereits beantwortete Angaben sind read-only.** Sie werden als Wert angezeigt, nicht als Auswahl. Ein Bedienelement daneben würde behaupten, die Antwort bewirke dort noch etwas — der Preis ist aber bereits gerechnet.
- **Eine editierbare Auswahl erscheint nur dort, wo die Angabe noch fehlt** (fortgesetzter Vorgang aus der Zeit vor der Vorab-Erhebung). Ohne diesen Zweig gäbe es keinen Weg mehr, sie nachzutragen.
- **Kein `disabled` Radio** als Read-only-Darstellung: es ist nicht fokussierbar und wird von Vorlesesoftware in der Regel übersprungen — der Wert ginge genau dort verloren, wo er zur Kontrolle steht.
- Geändert wird über den vorhandenen Rückweg zum Sendungsformular. **Keine Neuberechnung auf der Buchungsseite.** Eine Änderung dort verwirft über die bestehende Recalc-Logik die Angebote und erzwingt eine neue Berechnung.
- `false` bleibt „Geschäftsadresse" und wird nie als „fehlt" behandelt.

### Preisänderung

Beträge und ein Bestätigungsknopf erscheinen nur, wenn die Antwort **beide** Beträge trägt. Fehlt einer, wird kein Betrag angezeigt und nur die Neuberechnung angeboten — ein Einzelbetrag wird nicht zu „neuer Preis" umgedeutet. Entschieden wird an der **Form der Antwort**, nie an einem Requestfeld.

Mit Zusatzabsicherung übernimmt „Neuen Preis übernehmen" den Preis **ausschließlich** über die Neubepreisung mit `acceptPriceChange: { expectedTotalGross }` — nie über eine Buchung. Erst nach der Serverbindung (neue `priceRevision`) bucht der Kunde bewusst erneut; `/book` sendet diese Revision mit. Eine erneute Abweichung öffnet wieder den Dialog, ein Fehler lässt ihn mit neutralem Hinweis offen.

### Labelformat ist eine Fähigkeit des Angebots

- Die A4/A6-Auswahl erscheint **nur**, wenn `labelFormatOptions` ein nicht leeres Array ist (`utils/labelFormatOptions.mjs`). Fehlt das Feld, ist es `null` oder leer: keine Auswahl, **kein** `labelFormat` im `/book` (fail-closed).
- Gesendet wird nur ein Wert aus den Optionen; ein gespeichertes Format (Vorgang/Entwurf) wird nur übernommen, wenn das Angebot es anbietet.
- `labelSizes` bleibt reine Auskunft über gelieferte Formate (neutraler Hinweis, z. B. „DIN A4 und Thermodruck").

### Absicherung gehört zu genau einem Angebot

- Der Buchungsteil des Vorgangs trägt `insuranceOfferKey` (`offerKey`). Schritt, Absicherung, Versicherungswert und die beiden Warenantworten werden **nur** bei gleichem Schlüssel wiederhergestellt (`utils/insuranceRestore.mjs`); `null` passt nie, Entwürfe stellen nie eine Absicherung wieder her. Preisstand und `ceShipmentId` gehören nicht zum Schlüssel.
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
