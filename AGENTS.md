# Canonical Project Context — zuerst lesen

**Vor jeder Arbeit an ConfidaraExpress: `CONFIDARAEXPRESS_CANONICAL_CONTEXT.md` (Repository-Wurzel) lesen — verbindlich, aber gezielt:** die Kapitel 0, 5, 17, 18, 24 und 26 sowie jedes vom Auftrag berührte Fachkapitel vollständig; im Zweifel das betroffene Kapitel ganz (Sitzungsbeginn und Übergabe: Canonical Context §18.1).

Sie ist die projektweite Quelle für Produktidentität, Systemstatus, Produktentscheidungen, kritische Invarianten, Providerarchitektur, Pricing, Billing, Legal, Launch-Scope und Sicherheitsgrenzen.

Diese `AGENTS.md` enthält **ausschließlich Frontend-spezifische Zusatzregeln**. Sie wiederholt keine projektweiten Fakten.

**Autorität** (absteigend):

1. aktuelle menschliche Produktentscheidung
2. aktueller `origin/main`
3. Tests / CI / technische Verträge
4. `CONFIDARAEXPRESS_CANONICAL_CONTEXT.md`
5. diese `AGENTS.md` (von `CLAUDE.md` per `@AGENTS.md` eingebunden)
6. ältere Dokumentation (u. a. `docs/history/`)

Widersprechen sich Canonical Context und aktueller `origin/main`: **nicht still einer Seite folgen.** Drift melden, tatsächlichen Vertrag verifizieren, erst danach implementieren.

**Vorhandener Code ist kein Beweis für ein aktives Feature.**

Änderungen an `CONFIDARAEXPRESS_CANONICAL_CONTEXT.md` müssen in derselben Änderungssitzung in Frontend **und** Backend synchronisiert werden. Ist nur eine Kopie änderbar, darf nicht behauptet werden, beide seien synchron — die offene Synchronisation gehört ausdrücklich in den Abschlussbericht.

---

## Vertiefende Frontend-Dokumentation

Nicht automatisch geladen; bei fachlichem Bezug **vor** der Änderung lesen:

- `docs/frontend-vertraege.md` – Offer- und Booking-Verträge (Angebotsidentität, Sendungshandle, dreiwertige Angaben, Adressart, Same-Day, Frühzeiten, Produktprofil, voraussichtliche Lieferung, Express, UPS-Familie, Preisänderung, Preisprojektion, Labelformat, Absicherung, Buchungsfehler, Sendungsverfolgung, Fehlerdarstellung). Pflicht bei Arbeit an Angebot, Buchung, Sendung, Adresse.
- `docs/design-css-architektur.md` – Tokenfamilien, Importreihenfolge, Primitives, Typografie, App-Shell. Pflicht bei Stylesheet-Arbeit.
- `docs/pwa.md` – Manifest, Service Worker, Offline-Seite, Installationszugang, Updates, nginx. Pflicht bei PWA-Bezug.

---

## Repository Purpose

Frontend von ConfidaraExpress: React-SPA (Vite, JavaScript, kein TypeScript), ausgeliefert als statisches Bundle über nginx.

Die Backend-API ist **extern** und liegt nicht in diesem Repository.

Framework-/Runtimeversionen stehen in `package.json` und den CI-Workflows — **nicht** in dieser Datei. Sie altern dort nicht.

---

## Commands

```bash
npm run dev       # Vite Dev-Server (0.0.0.0)
npm run build     # Hauptbuild nach dist/ (unverändert ohne Konfiguration), danach der Preisrechner nach dist-preisrechner/
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
- **Dev-Server-Teardown:** `spawn` mit `{ ...DEV_SERVER_SPAWN, … }`, Beendigung über `stopDevServer(server, …)` im `after`-Haken (`tests/e2e/helpers/devServer.mjs`). POSIX: eigene Prozessgruppe und Gruppenkill — ein Signal an den npx-Prozess allein lässt Kind und Enkel samt Port stehen. Windows: kein `detached` (sonst öffnet jede Suite ein sichtbares Konsolenfenster), Prozessbaum per `taskkill /T`. Kein `detached: true` und kein `process.kill(-pid)` direkt in einer Suite.
- **Aufräumen in Runner-Skripten:** Niemals `node`-/Vite-Prozesse pauschal nach Name oder Befehlsmuster beenden (`Stop-Process`, `taskkill /IM`, `pkill`) — das trifft Dev-Server anderer Worktrees, Projekte und Claude-Sitzungen. Normalfall: `stopDevServer` räumt den eigenen Prozessbaum ab; für Gesamtläufe `node scripts/run-e2e.mjs` verwenden. Liegengebliebene E2E-Server höchstens gefiltert auf den eigenen Worktree-Pfad UND die Testparameter (`--host 127.0.0.1 … --strictPort`) per `taskkill /PID <pid> /T /F` beenden.
- **Portregel:** jede Suite hat ihren eigenen Port (`--strictPort`). Zwei Suiten auf demselben Port machen den Lauf nicht wiederholbar.
- Bedienelemente über stabile `id`s ansprechen, **nicht** über Platzhaltertexte oder Positionen. Ein Platzhalter ist Beschriftung, kein Selektor.
- Nichts erzwingen: kein `force`-Klick, kein Entfernen von `disabled`. Genau das umginge die Produktprüfung, um die es geht.

### Lokale Verifikation vs. CI

Lokal nach Canonical Context §17.1: die für die Änderung **relevanten** Tests (neue und geänderte Unit-/Vertragstests, gezielte Browser-Suiten der geänderten Ansichten) plus `npm run build`, höchstens ein Browserlauf gleichzeitig. Eine einzelne Suite: `node --test tests/e2e/<suite>.test.mjs`. Die vollständige Browser-E2E-Suite läuft lokal nur, wenn Umfang/Risiko es rechtfertigen — CI führt sie ohnehin als PR-Gate aus.

**CI** (`.github/workflows/ci.yml`): Unit-Tests und Build, die Browser-E2E in parallelen Teilen, die dreifache PWA-C11-Stabilitätsprüfung und die Abhängigkeitsprüfung laufen gleichzeitig; der Sammelstatus **„CI-Ergebnis"** ist nur grün, wenn jeder Job grün ist (Canonical Context §17.2). `scripts/run-e2e.mjs` verteilt die aufgefundenen Suiten nach gemessener Laufzeit (`scripts/e2eVerteilung.mjs`, Messwerte in `scripts/e2e-laufzeiten.json`; eine Suite ohne Messwert zählt mit dem Median und läuft trotzdem mit), führt jede Suite einzeln aus und lässt sie nur mit Exit 0, mindestens einem bestandenen und keinem roten Test gelten. Die Teilanzahl steht allein im Workflow; `tests/e2e/helpers/e2eVerteilung.test.mjs` prüft, dass Matrix und Aufruf zusammenpassen und jede Suite genau einem Teil zugeordnet ist. Messwerte nach größeren Änderungen der Suiten aus CI-Protokollen erneuern: `gh run view <lauf> --log > lauf.log`, dann `node scripts/e2e-laufzeiten-aktualisieren.mjs lauf.log`.

**Keine Testanzahlen** in dieser Datei oder im Canonical Context festschreiben; sie altern sofort.

Bekannte sporadische E2E-Prüfungen und ihre Einordnung stehen im Canonical Context §17.4. Ein grüner Wiederholungslauf gilt nie als Behebung.

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

### Rollen und Routenschutz (Vertriebspartner, Canonical Context 12A)

- Drei Rollen, gelesen aus `GET /kundenbereich` (nie aus dem JWT): `customer`, `admin`, `sales_partner`. Die Weiche entscheidet ausschließlich `utils/roleLanding.mjs` (strikter Vergleich).
- `ProtectedRoute` leitet einen Vertriebspartner auf `/partner` um, **bevor** ein Kundenbaustein montiert wird; `PartnerRoute` lässt nur `sales_partner` ins Portal. Beides ist UX — die Grenze zieht der Server.
- Ein Partner ruft außer den Kontofunktionen (`/kundenbereich`, `PATCH /kunde/password`, E-Mail-Wechsel) **keinen** Kundenendpunkt auf: der Server antwortet 403, und `apiFetch` meldet bei jedem 401/403 eines angemeldeten Requests ab. Neue Aufrufe in gemeinsamen Hüllen (Layout, Kontext, Mitteilungen) deshalb rollenabhängig halten.
- Empfehlungscodes (`?ref=` auf `/register`, `/registrieren`, `/partner-registrieren`) liest `main.jsx` vor dem ersten Rendern (`utils/referralCapture.mjs`). In `localStorage` landet ein Code nur nach ausdrücklicher Serverfreigabe (`GET /api/sales-partner/public-config`, `referralsEnabled`) — Datenschutzgate. Ob ein Code gilt, weiß nur der Server; die Oberfläche prüft nur die Form und verrät es nie.
- **Vertriebspartnervereinbarung** (Canonical Context 11.4): Quelle ist ausschließlich die registrierte PDF des Servers (`agreement.documentPath` aus `GET /api/sales-partner/agreement` bzw. `public-config.agreement`, nur Pfade auf diese API) — kein Vertragstext im Frontend-Code. `/partnervereinbarung` zeigt Titel, Fassung, Gültigkeit und den Link; die Registrierung öffnet nur, wenn der Server eine Fassung nennt, und sendet genau `agreement.version`.
- **Abrechnungsdaten und Gutschriften** (12A): Die vollständige IBAN gelangt nie in Zustand oder Anzeige des Partnerportals (nur `ibanMasked`); Steuer- und Bankdaten nur in „Konto → Abrechnungsdaten" und in der Adminkarte „Abrechnungsdaten" — nie in Team-, Listen- oder Vorschauansichten. PDFs nur per authentifiziertem Blob-Abruf, nie als Link mit Token. Sperrgründe und Fehlercodes nur über feste deutsche Bezeichnungen, nie roh. Der Abrechnungslauf (Seite „Gutschriften", `/admin/partners/credit-notes`) stellt je Partner mit dessen Fingerabdruck aus — einzeln wie gesammelt erst nach Bestätigung im einen Dialog der Seite (Partner, Monat, Betrag aus der Vorschau) — und lädt bei `CREDIT_NOTE_PREVIEW_STALE` neu; ein offener Ausgang (5xx/Netz) wird nie als „nicht ausgestellt" behauptet.
- **Startwerte und Obergrenze** (12A, 2026-10-07): Vorbelegungen (Freigabe 10,00 / 5,00 / 2,50, globale Level-Regel) kommen ausschließlich aus `startDefaults` des Servers — keine Kopie der Werte im Frontend. Eine Obergrenze ist optional (leer = keine Grenze), global oder je Partner (`?partnerUserId=`); Feld und Bestätigung nennen ihre Wirkung (`CAP_TEXTS.ownEffect`/`totalEffect`: eine überschrittene Grenze „aller Ebenen zusammen" verhindert die automatische Provision der Sendung).
- **Klarheit im Partnerbereich** (UX-Paket 1, 2026-10-08): Kopieren meldet „Kopiert" nur nach echtem Kopieren (`utils/clipboard.mjs`), sonst Hinweis und markierter Text. Dialoge nennen die echten Folgen (Deaktivieren ≠ Login sperren). Login-Aktionen und neue Provisionssätze nur für freigegebene Partner (aktiv/inaktiv). „Mein Team" ist im Partnerportal immer da (Lade-, Fehler-, Leerzustand im Bereich). Kein Rohwert, kein Schaltername und kein „Server" im sichtbaren Text.
- **Adminnavigation und „Zu erledigen"** (UX-Paket 2, 2026-10-08): Die Admin-Sidebar gruppiert dieselben Routen (Kunden und Partner · Versand und Rechnungen · Support und Bearbeitung · Verwaltung und Protokoll) — keine Route kommt hinzu oder fällt weg. „Zu erledigen" auf `/admin` setzt sich ausschließlich aus vorhandenen Serverzählern zusammen (`utils/adminTodo.mjs`: Listen-`total` mit pageSize 1, darunter `GET /admin/sales-partners?status=pending` und `GET /admin/dispatch-evidence/queue`, sowie die Betriebs-Queues); ein unbekannter Zähler steht als „nicht verfügbar" da, nie als 0, und jede Queue erscheint genau einmal. Das Partnerprogramm hat eine Teilnavigation (`components/admin/SalesPartnerAdminNav.jsx`, Pre-Live nur bei `enabled: true`) statt Kopfbuttons. Zurück-Links folgen der Herkunft über Router-State (`AdminBackLink`, `utils/adminBackLink.mjs` — nur Pfade unter `/admin`, sonst der feste Rückweg der Seite). Die Partnerliste trägt Status und Suche in der Adresse (`?status=…&q=…`).
- **Partner-Startseite** (UX-Paket 3, 2026-10-08): Genau vier Kennzahlen, jede mit ihrem Zeitraum aus der Serverantwort — „Meine Kunden" (heute zugeordnet, dazu aktiv im Messmonat), „Pakete im <Messmonat>", „Meine Provision" (Satz des laufenden Monats, `ownRatePercent`), „Im <Monat> verdient" mit auszahlbarem Anteil; Monatsnamen nie aus der Browseruhr, Unbekanntes als „—". „So setzt sich Ihre Provision zusammen" zeigt Grundprovision, Kunden- und Paketbonus und den Satz des Servers — keine Addition im Browser, eine Obergrenze steht als eigener Satz. Die Empfehlungslinks (`components/partner/PartnerLinkCopy.jsx`, Logik `utils/salesPartnerLinks.mjs`) gelten nur als einsatzbereit, wenn sie wirken: aktives echtes Konto und `referralsEnabled` (Kundenlink), geöffnete Registrierung im passenden Bereich (Partnerlink; Testkonten nur im Pre-Live-Testweg) — bei unbekannter Konfiguration nutzbar, aber ohne Zusage. Der Empfehlungscode steht nicht auf der Startseite. Die Geldbegriffe verdient → auszahlbar → abgerechnet → ausgezahlt bleiben getrennt (`MONEY_TERMS`). Mobil brechen die sechs Tabs um, statt seitlich zu scrollen.
- **Admin-Partnerdetail** (UX-Paket 4, 2026-10-08): `/admin/partners/:id` ist nach Aufgaben geordnet. Ein offener Antrag steht oben als „Antrag prüfen" (Angaben samt Vertragsstand — ein Testkonto nur aus `preliveTest` —, Freigeben, Ablehnen); ein freigegebener Partner beginnt mit dem Überblick (nächster Schritt nur aus gemeldeten Zuständen: eingereichte Abrechnungsdaten, fehlgeschlagenes Gutschriftdokument; dazu Status, Konditionen, Kunden und Team, Abrechnung) und „Status und Zugang". Darunter vier Gruppen — Abrechnung, Konditionen, Kunden und Team, Partnerdaten — aus einklappbaren Bereichen (`components/admin/AdminDisclosureCard.jsx`, natives `<details>` mit Kurzfassung im Kopf; Logik `utils/adminPartnerDetailView.mjs`). Formulare und Versionsverläufe sind darin noch einmal eingeklappt; ein Formular übernimmt beim Öffnen die aktuell gültige Version („Gültig ab" bleibt leer, gespeichert wird nur über die Bestätigung). Keine Funktion entfällt: Level-Regeln, Obergrenze und Korrekturbuchung erlaubt der Server in jedem Status, neue Sätze erst nach der Freigabe. „Aktualisieren" lädt Detail und jeden selbst ladenden Bereich neu (`refreshKey`); Obergrenze, Abrechnungsdaten und Gutschriften melden ihren Zustand an den Überblick (`onState`, kein zweiter Abruf — die IBAN bleibt in ihrer Karte). Mobil (≤ 640 px) werden die Tabellen zu Karten (`.adm-sp-cardtable`, `data-label` je Zelle).
- **Gutschriften, Versandnachweise, Pre-Live-Testablauf** (UX-Paket 5, 2026-10-08): Der Abrechnungslauf (`/admin/partners/credit-notes`) zählt die Vorschau je Serverstatus (ausstellbar, bereits ausgestellt, blockiert, wird vorgetragen) und nennt den nächsten Schritt; je Zeile steht, was fehlt und wer es beheben kann (`runCounts`, `runNextStep`, `blockerNextStep` in `utils/adminSalesPartnerSettlementView.mjs`) — kein Betrag wird im Browser gerechnet, ein Begriff: „ausstellbar". Sprunglinks ins Partnerdetail öffnen dort den genannten Bereich nur über Router-State aus einer festen Liste (`utils/adminJumpState.mjs`, `openAdminSection` in `AdminDisclosureCard.jsx`); der Pre-Live-Testlauf der Gutschriften wird so vorbelegt, nie über die Adresse. Der Versandnachweis-Dialog folgt dem Ablauf Sendung → vorhandene Nachweise → Versandstatus → Entscheidung mit Wirkung → Begründung (höchstens 500 Zeichen wie der Vertrag) → Zusammenfassung; Fehler des Servers stehen am Feld (`dispatchEvidenceErrorOutcome`). Der Pre-Live-Bereich zeigt den Ende-zu-Ende-Test als neun Schritte (`components/admin/PreliveFlowCard.jsx`); Hauptweg ist die öffentliche Registrierung — ob sie Testanträge anlegt, sagt allein `public-config.registrationMode` (produktiv oder unbekannt: kein Link, sondern Warnung bzw. keine Aussage). Der öffentliche Kundenlink ordnet Testpartnern bewusst keinen Kunden zu; im Test entsteht die Zuordnung über einen Testkunden mit dem Code des Testpartners. „Testpartner anlegen", Schnellszenarien und E-Mail-Vorschau sind eingeklappte Zusatzwerkzeuge.
- **Partnerbereiche, Registrierung, Admintexte** (UX-Paket 6, 2026-10-08): Der Bereich des Partnerportals steht als `?page=<Kennung>` in der Adresse (keine neue Route; gelesen nur über `partnerTabFromSearch` aus `PARTNER_TABS`, sonst Übersicht, Adresse wird ersetzend bereinigt, ein Wechsel legt keinen Verlaufseintrag an). Nach dem Login kehrt ein Partner über `partnerReturnTarget` (`utils/loginReturnTarget.mjs`, feste Bereichsliste mit Paritätstest) in diesen Bereich zurück — nie auf ein Kunden- oder Adminziel. „Meine Kunden" trennt „Kundenkonto" (freigeschaltet) von „Zählt für Ihr Kunden-Level" (nur `previousMonth.active` des Servers), Monatsnamen aus der Übersicht. „Mein Team" heißt „Direkt geworben (Ebene 1)" / „Weitere Partner (Ebene 2)"; ob ein Partner zählt, sagt allein `relevant` des Servers („Ja“ / „Nein“), die Belegung zählt nur dessen Kennzeichen. Seit 2026-10-13 gibt es keine Platzgrenze je Ebene (kein Platz, kein `rank`, kein `limits`); die Erklärung nennt „alle berechtigten aktiven Partner auf Ebene 1 und Ebene 2“ nur, solange der Server keine Grenze meldet (`serverReportsLimit`). Provisionen zeigen zuerst Monat, verdient, auszahlbar (`commissionSummary`); eine Teambuchung nennt nie einen Kundennamen. Der Bereich der Gutschriften heißt „Gutschriften" (Monat, Gutschrift, Betrag mit Netto und Steuer samt Satz, Status, Auszahlung, PDF — keine steuerliche Angabe entfällt) und spricht von „auszahlbar"/„abgerechnet" statt „abrechnungsreif"; im Konto stehen die Abrechnungsdaten zuerst. Die Partnerregistrierung sperrt „Antrag stellen" nie ohne Grund: ein unvollständiger Antrag zeigt jeden Fehler am Feld (`aria-describedby`) mit Sammelhinweis und Fokus im ersten Feld; der Erfolg bietet keine Anmeldung an. Admintexte: „Protokoll" statt „Admin-Audit"/Englisch, Sie-Form und „Konto" im Kundendetail, Rückwege in Fehlerzuständen mit dem Namen ihrer Liste (`utils/adminTextConsistency.test.mjs`).
- **Manuell erstellte Rechnungen** (Auftrag 2 / P1, `/admin/invoices/manual/:draftId`): Netto, USt und Brutto zeigt die Seite ausschließlich aus der Serverantwort — keine Summenrechnung im Browser (`utils/manualInvoiceView.mjs` wandelt nur Eingabeformen um: „1.234,56“ → Cent, „1,5“ → "1.5"). Vorschau und Ausstellen gelten der GESPEICHERTEN Fassung (mit ungespeicherten Änderungen gesperrt); Ausstellen nur über den Bestätigungsdialog mit Doppelklicksperre, nie mit E-Mail. Die Sperrgründe kommen vom Server und stehen am Knopf. Versand nur über den bestehenden Bestätigungsdialog der Rechnungsseite.
- **Pre-Live-Testmodus** (12A, Serverschalter `SALES_PARTNER_PRELIVE_TEST_MODE`): Der Bereich `/admin/partners/prelive` und der Testlauf-Schalter der Gutschriften erscheinen nur, wenn `GET /admin/sales-partner-prelive/status` `enabled: true` meldet — die Sperre zieht der Server (404/409 `PRELIVE_TEST_MODE_DISABLED`). Testdaten (`preliveTest`, `isTest`, im Admin-Kundendetail `user.prelive_test`) sind überall sichtbar als TEST / PRE-LIVE gekennzeichnet — nur aus der Serverkennzeichnung, nie aus Name oder E-Mail; vergangene Daten nur, wenn der Server `datesBeforeTodayAllowed` bzw. `backdatingAllowed` liefert. Mailvorschauen nur in einem `sandbox`-iframe per `srcdoc` (nie `dangerouslySetInnerHTML`); Passwortlinks nie speichern. Die Bereinigung ist zweistufig (Trockenlauf → ausdrückliche Bestätigung), nie ein Ein-Klick-Löschen.
- **Partnerregistrierung im Pre-Live-Modus** (12A, 2026-10-07): `/partner-registrieren` folgt ausschließlich `public-config.registrationMode` (über `partnerRegistrationMode()`): `production` nur mit der strengen Vertragsprüfung (`partnerRegistrationOpen`), `prelive_test` nur auf ausdrückliche Nennung des Servers, sonst geschlossen. Im Testweg dasselbe Formular mit denselben Regeln; statt der Vertragsannahme der Hinweis `PARTNER_REG_TEXTS.preliveNotice`, kein Vereinbarungslink, keine Fassung im Body. Ob ein Antrag ein Testantrag ist, entscheidet nur der Server — kein Client-Feld dafür. Primärer Ende-zu-Ende-Test: `tests/e2e/salesPartnerPreliveRegistrationFlow.test.mjs`.

---

## Lokale technische Fallen

- **Vite inlined SVG unter ~4 KB** als Data-URI ins JS-Bundle. Beim Debugging im Network-Tab nicht wundern.
- **Statische Asset-Importe** sind Pflicht (`import logo from "../assets/…"`); kein dynamischer Pfadaufbau.
- **CSP ↔ Build-Variablen:** `nginx.conf` nennt in `connect-src`/`img-src` Hosts, die als Buildvariablen im Bundle landen (`VITE_API_URL`, Kachelhost). Wer einen davon ändert, **muss** `nginx.conf` nachziehen — sonst blockiert der Browser jeden API-Aufruf beziehungsweise die Karte. `add_header` wird zudem nicht vererbt: eine neue `location` mit eigenem `add_header` muss den Sicherheitsheaderblock mitkopieren.
- **Browser-Icons sind versioniert** (`favicon-v2.svg`, `apple-touch-icon-v1.png`). Statische Assets gehen mit `immutable` hinaus; ein Wechsel unter festem Namen bliebe für wiederkehrende Besucher lange unsichtbar. Bei sichtbarer Änderung die Zahl hochzählen.
- **Fehlergrenzen:** es gibt genau **eine** Fehlergrenzen-Komponente (`ContentErrorBoundary`), eingesetzt an Wurzel, Auth, öffentlichem Layout, Admin und Dashboard. Kein zweites Muster daneben; niemals automatisch neu laden.
- **Abhängigkeiten pinnen** (`^x.y.z`), kein `latest`. `Dockerfile` nutzt `npm ci`.

---

## Öffentlicher Preisrechner (preisrechner.confidaraexpress.de)

Projektweiter Stand: Canonical Context 1A „Öffentlicher Preisrechner“ und §15/§16. Frontendregeln:

- **Eigene Seite, eigener Build:** statisches Seitengerüst `preisrechner/index.html` (vier Bereiche: Hero mit Rechner · Ergebnisse · Ablauf, Plattform und Service in einem Abschnitt · Fragen und Fuß), der Rechner als React-Insel aus `src/public-calculator/`, zweiter Build `vite.preisrechner.config.js` → `dist-preisrechner/` mit zwei Seiten (`index.html`, `404.html` ohne Skript), eigener nginx-`server`-Block mit eigener CSP (der Anwendungsblock bleibt `default_server`), `preisrechner/public/sw.js` meldet sich nur ab. Governance: `src/styles/preisrechnerGovernance.test.mjs`, `src/public-calculator/publicCalculatorIsland.test.mjs`.
- **Adressen der Domain:** die Seite gibt es nur unter `/`. Die ersten Pfadstufen der Routen aus `src/App.jsx` (`/login`, `/register`, `/dashboard` …) leiten per 302 auf die Hauptdomain, samt Pfad und Abfrage; jede andere Adresse antwortet 404 mit `404.html`. Eine neue Route der Anwendung gehört in die Weiterleitungsliste des Preisrechner-Blocks (`preisrechnerGovernance.test.mjs` Test 9 gleicht beide ab).
- **Kein Sprung beim Start:** das Seitengerüst trägt das Formular als statisches Skelett mit derselben Struktur (`aria-hidden`, `inert`); React ersetzt es beim ersten Rendern. Es gibt keine reservierte Mindesthöhe. Wer in `PublicCalculatorApp.jsx` eine Zeile oder ein Feld ändert, ändert das Skelett mit — `publicCalculatorIsland.test.mjs` (Test 7) vergleicht Zeilen, Felder und Einheiten, `publicCalculatorBuild.test.mjs` (B5) die Höhen in sechs Breiten. Der Ergebnisbereich entsteht erst mit der ersten Berechnung.
- **Die Insel bleibt klein:** kein `index.css`, kein Router, kein Versandvorgang, keine Anmeldung, keine Dashboard-, Adress- oder Kartenmodule, kein Storage. Stylesheet `src/styles/public-calculator.css` aus den Foundation-Tokens; die Diagnose-Tokens des Vergleichsmodus filtert der Build heraus (keine Einkaufsquelle im Bündel). Logik in `utils/publicCalculatorView.mjs`, Felder über `components/ui/Field.jsx`.
- **Anfragen nur auf `/api/public/*`** (CORS): die erste Anweisung des Einstiegs ist `prepare` (Simple-Request, `credentials: "omit"`, keepalive, nie abgewartet); die Länder kommen aus `/api/public/launch-scope` (derselbe Serverhandler wie im Portal, ohne Antwort die volle Liste); die Preisabfrage hat 75 s. Carrierauswahl und Ordnung laufen im Browser, eine unveränderte Eingabe fragt nicht erneut.
- **Schmale Maske, Nettopreis (Go-Live-Entscheidung 2026-10-16):** nur Land, PLZ und Stadt je Seite sowie Anzahl (vorbelegt 1), Gewicht und Maße — kein Versanddatum, keine Abholung/Abgabe, keine Versandart. Der Anfragekörper bleibt bei 15 Feldern: `shippingDate` = Berliner Geschäftstag (`businessTodayISO`, nicht der lokale Tag des Geräts; ohne Datum verlöre Transglobal den Abholvertrag), Filter `all`. Karten zeigen nur den Nettopreis mit „zzgl. MwSt.“, die Aktion heißt „Angebot auswählen“.
- **Übergabe:** feste Adresse `https://confidaraexpress.de/preisrechner-uebernahme#t=…`, kein Redirect-Parameter; ohne Anmeldung führt die Übernahmeseite direkt in die Registrierung (`/register`, Rücksprung bleibt — ein bestehendes Konto wechselt dort zur Anmeldung). `main.jsx` liest das Fragment vor dem ersten Rendern und entfernt es; das Token liegt nur in `utils/publicQuoteHandoffStore.mjs` (Modulspeicher, nie Storage). Die Prüfung (`handoff/verify`) läuft ohne `auth: true` — ein fachliches 403 meldet nicht ab, 401 über `triggerAuthError`. In „Neue Sendung“ trägt die Absicht den `productKey`; bei genau einem Treffer steht der neue Kundenpreis sichtbar neben dem öffentlichen (`publicPriceComparison`).
- **Messkonzept:** `tests/e2e/publicCalculatorBuild.test.mjs` — Bündelscan, Bericht gzip/brotli je Asset gegen `tests/e2e/fixtures/public-calculator-build-baseline.json` (mehr als 10 % Wachstum schlägt an; Baseline nur bewusst und im selben Commit wie die Ursache aktualisieren), Erstaufruf gegen `/login`, FCP/LCP/CLS und Zeit bis zum bedienbaren Formular unter Slow 4G und CPU 4×.

---

## Verbotene Muster

- Oberflächensperren oder Schalter für fertige, sicher nutzbare Funktionen ohne benannten Schutzzweck (Canonical Context 1A „Sichtbarkeit fertiger Funktionen“) — Schutzmechanismen für Buchungen, Rechnungen, Zahlungen und Rechte bleiben
- Unternehmensangaben (Firmierung, Rechtsform, Anschrift, Kontakt) außerhalb von `src/config/companyProfile.js` — veröffentlichte Rechtsfassungen ausgenommen, sie bleiben wortgleich
- zweite API-Schicht neben `src/api/`
- App-Code, API-Antworten, Dokumente oder Kundendaten im Service-Worker-Cache
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

## Effizienzstandard

Gilt zusätzlich zu allen Sicherheits-, Provider-, Datenbank- und Go-Live-Regeln dieser Datei und des Canonical Context. Bei kritischen Änderungen bleiben sämtliche dort verlangten Prüfungen Pflicht.

1. **Keine Doppelanalysen:** Bereits verifizierte Erkenntnisse wiederverwenden; nur das konkret betroffene Problem untersuchen.
2. **Kleinste wirksame Änderung:** Keine zusätzlichen Features, Refactorings oder Änderungen außerhalb des Auftrags.
3. **Risikobasierte Tests:** nach Canonical Context §17.1 (Vorrangliste, Ausnahme bei größerer Systemwirkung, Rechnerschonung); frontendseitig die betroffenen Unit-/Vertragstests, gezielte Browser-Suiten der geänderten Ansichten und `npm run build`. Die vollständigen Läufe übernimmt CI.
4. **Keine pauschalen E2E-Gesamtläufe:** Nicht alle Browser-Suiten manuell starten, wenn nur einzelne Formulare geändert wurden. Breitere lokale Läufe nur bei konkret begründetem Risiko oder fehlender CI-Abdeckung.
5. **Bekannte Fehler nicht endlos wiederholen:** Belegte Windows-Baseline-Probleme dokumentieren statt sie in jeder Sitzung neu zu untersuchen.
6. **Parallele Sitzungen schützen:** Eigene Worktrees, Ports und Prozesse sauber verwalten. Niemals pauschal fremde Node-, Vite- oder Terminalprozesse beenden.
7. **Direkter Entwicklungsabschluss:** Ursache prüfen → minimal implementieren → gezielt testen → Build → Diff-Review → Commit → Push → PR → CI prüfen. Eigenständiger Merge nur mit ausdrücklichem Auftrag (Git / PR, Betreiberentscheidung 2026-10-23), nie ein manuelles Deployment. Zusammengehörige Backend-/Frontend-Änderungen: beide PRs früh öffnen, CI parallel im Hintergrund abwarten, nach fachlicher Abhängigkeit nacheinander mergen (Canonical Context §18.2).
8. **Probleme gezielt eskalieren:** Hängt ein Test oder entsteht eine unerwartete Blockade, Ursache isolieren und das Vorgehen ändern — nicht minutenlang dieselben Befehle wiederholen.
9. **Kurzer Abschlussbericht:** Nur Änderungen, tatsächlich ausgeführte Tests, CI, PR und offene Risiken nennen (Pflichtangaben des Abschlussberichts bleiben).
10. **Sitzungsgrenze:** Größere Aufträge in einer frischen Sitzung beginnen; vorher Übergabe im Projektgedächtnis (Canonical Context §18.1).

---

## Git / PR

Der allgemeine Workflow steht im Canonical Context §18. Zusätzlich für dieses Repository:

- Vor Commits mit Stylesheet- oder Import-Änderungen `npm run build` ausführen — fehlende statische Importe und falsche CSS-Pfade meldet erst Vite, kein Test.
- Kein Branchname wird in dieser Datei festgeschrieben. Den aktuellen Stand über `git branch --show-current` und `git fetch origin` ermitteln.
- E2E- und Dev-Server-Skripte folgen zusätzlich dem globalen Skill `playwright-windows` (Fenster, Ports, Prozessbäume).
- Vor einem PR mit Buchungs-, Zahlungs-, Login- oder Datenbezug: Skill `security-review` ausführen und das Ergebnis im Abschlussbericht nennen.
- **Betreiberentscheidung 2026-10-23 (Master-Implementierungsauftrag):** Bei einer vom Betreiber ausdrücklich beauftragten, klar abgegrenzten Implementierung darf nach grüner CI und vollständiger Qualitätsprüfung (relevante Tests, Build, Sichtprüfung Desktop und Mobil, Security-Review, Diff-Review, Canonical synchron) **selbstständig gemergt** und das bestehende automatische Deployment genutzt werden; danach den tatsächlich laufenden Stand in Produktion prüfen. Ohne solchen Auftrag gilt weiterhin: nur Merge empfehlen. Die Entscheidung ist **keine** Freigabe für Serveränderungen, kostenpflichtige Anbieterbuchungen, Live-Providerrequests, Änderungen an Secrets oder produktiven ENV-Werten oder das Umgehen von Sicherheitsprüfungen.

---

## Drift Handling

Widerspricht diese Datei dem Canonical Context, **gewinnt der Canonical Context**.

Widerspricht der Canonical Context dem aktuellen `origin/main`, wird die Abweichung gemeldet und der tatsächliche Vertrag im Code verifiziert — nicht geraten und nicht still umgedeutet.

Historischer Kontext (Stand 2026-09-09, vor dieser Kürzung) liegt in `docs/history/CLAUDE_CONTEXT_ARCHIVE_2026-09-09.md`. Er ist **nicht** kanonisch und enthält bekannt veraltete Zustandsaussagen; er wird nicht automatisch geladen.
