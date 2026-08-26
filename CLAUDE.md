# ConfidaraExpress — Preisrechner Frontend

B2B-Versandplattform. React 18 + Vite SPA. Kein TypeScript. Backend-API ist extern (nicht in diesem Repo).

## Mission & oberste Priorität

Oberste Priorität: **zuverlässige, korrekte Buchungen über ConfidaraExpress** — für **Abholung/Pickup** *und* **Paketshop/Dropoff**. **Jumingo-Parität** ist dabei kritisch: Felder, Werte und Abläufe müssen exakt dem entsprechen, was Backend/Jumingo erwartet. Funktionierende Buchungen haben Vorrang vor Eleganz und Refactors. Die konkreten Buchungsregeln stehen unter „ConfidaraExpress — Buchung, Preise & Jumingo".

## Tech Stack

- **Framework:** React 18, Vite
- **Routing:** React Router v7 (alle Pages lazy-loaded via `React.lazy`)
- **Styling:** Reines CSS, modular (`src/styles/index.css` importiert alle Stylesheets in fester Reihenfolge)
- **Auth:** JWT in `localStorage` unter dem Key `ce_token`
- **API:** Extern unter `VITE_API_URL` (`.env` → `https://api.confidaraexpress.de`)
- **Deploy:** Docker Multi-Stage → nginx static hosting (`Dockerfile`, `nginx.conf`)

## Projektstruktur

```
src/
├── App.jsx                   # Root-Routing (10 Routen)
├── api/client.js             # API-Helper: token(), authH(), jsonH
├── context/AuthContext.jsx   # Globaler Auth-State
├── routes/ProtectedRoute.jsx
├── pages/                    # Eine Datei pro Route
├── components/
│   ├── auth/                 # AuthAurora, LoginForm, RegisterForm, ...
│   ├── common/               # LoadingScreen, ScrollToTop
│   ├── dashboard/            # Overview, ShipmentsList, InvoicesList, Profile
│   ├── layout/               # NavbarLayout, DashboardLayout, DashboardSidebar, Footer
│   └── ui/                   # Icon, PasswordField, StatusBadge
├── styles/                   # Stylesheets (variables → globals → primitives → ... → notifications)
├── utils/                    # formatters.js, countries.js
└── assets/carriers/          # SVG-Carrier-Logos (statisch importiert)
```

## CSS-Architektur — kritisch

Drei voneinander isolierte Theme-Schichten:

| Schicht | Präfix | Datei | Gilt für |
|---------|--------|-------|----------|
| App-Chrome „Executive Ivory + Deep Navy" | `--ce-app-*`, `--ce-sidebar-*` | `variables.css` → `dashboard-premium.css` | Hintergrund + Sidebar des eingeloggten Bereichs |
| App-Inhaltsflächen | `--surface*`, `--border-*`, `--text-*`, `--accent-blue*`, `--shadow-card*` | `variables.css` | Karten, Tabellen, Seitenköpfe im eingeloggten Bereich |
| KPI-Karten „Executive Metric Cards" | `--ce-kpi-*` | `variables.css` → `overview.css` | **Nur** die vier Kennzahlkarten der Kundenübersicht |
| Legacy-Light | `--navy`, `--gray*`, `--blue*` | `variables.css` | Booking, Legal, Offer-/Preisrechnerkarten |
| Auth-Theme | `--auth-*` | `auth.css` | AuthPage, Login, Register |
| Admin | `--adm-*` / `.adm-*` | `admin.css` | Adminbereich (eigene Shell) |

**Token-Systeme niemals vermischen.** `.auth-*`-Klassen gehören ausschließlich in Auth-Komponenten, `.adm-*` ausschließlich in den Adminbereich.

Neue Flächen im eingeloggten Bereich immer über die App-Layout-Tokens bauen
(`--surface`, `--border-subtle`, `--shadow-card`) — keine eigenen Hex-Werte,
keine neuen Verläufe, kein Blau als Fläche.

**Einzige Ausnahme: die vier KPI-Karten der Übersicht.** Sie tragen ein eigenes,
abgeschlossenes Material (`--ce-kpi-*`) auf Basis der Markenfarben Navy `#111A33`,
Indigo `#5367E8`, Violett `#7A5CE6` und Off-White `#F5F7FB`. Diese Familie gilt
ausschließlich für `.pp-kpi*` und darf nicht auf andere Flächen ausgeweitet
werden; umgekehrt bringen die Karten `.tile` nicht mehr mit. Alle Farbwerte
stehen in `variables.css` — im KPI-Block von `overview.css` steht bewusst kein
Farbliteral. `overviewKpiCards.test.mjs` prüft das zusammen mit Typografie,
Icon-Satz, Kartenoberfläche und den WCAG-Kontrasten.

Die KPI-Zahlen nutzen `--fs` (DM Sans), **nicht** `--fh`: DM Sans liegt als
Variable Font vor und rendert das geforderte Gewicht 600 tatsächlich. Libre
Franklin (`--fh`) ist nur als 700 und 800 geladen und fällt bei 600 still auf
700 zurück — gemessen, nicht vermutet. Wer die `@font-face`-Deklaration für
DM Sans 600 entfernt, lässt die Zahlen unbemerkt auf 500 zurückfallen; ein Test
hält das fest.

**Chrome-Farben stehen ausschließlich in `variables.css`.** In den Shell- und
Sidebar-Regeln von `dashboard-premium.css` dürfen keine Farbliterale auftauchen
— `appShellChrome.test.mjs` prüft das (samt WCAG-AA-Kontrasten) automatisch.

## Globale Interface-Primitives — vor jedem neuen Bauteil lesen

Es gibt **genau ein** globales Button-, Formular-, Badge- und Karten-Grundsystem
(Paket A, Phase 2). Wer ein neues Bauteil baut, nutzt diese Primitives und legt
kein zweites allgemeines Muster daneben:

| Primitive | Datei | Klassen |
|-----------|-------|---------|
| Buttons | `buttons.css` | `.btn` + `.btn-primary` / `-outline` / `-ghost` / `-danger` / `-icon` / `-link`; Höhen `.btn-sm` (32) · Standard (40) · `.btn-lg` (48) |
| Eingaben | `forms.css` | `.field-input` / `.field-select` / `.field-textarea`, Checkbox/Radio; Kunde 40 px, Admin 36 px |
| Schalter | `components/ui/Switch.jsx` + `forms.css` | `<Switch checked onChange label hint id />` — echtes `input[type=checkbox]` mit `role="switch"`, `.ce-switch*` |
| Fokus | `primitives.css` | `outline: var(--ce-focus-ring); outline-offset: var(--ce-focus-ring-offset)` |
| Badges | `primitives.css` | `.badge` + `.badge--neutral/-info/-progress/-success/-warning/-overdue/-error/-blocked/-cancelled/-archived` |
| Karten | `primitives.css` | `.ce-card`, `.ce-card-raised`, `.ce-card-interactive`, `.ce-card-muted`, `.ce-card-inverse`, `.ce-table-container` |
| Icons | `components/ui/Icon.jsx` | `<Icon n="…" s={16\|18\|24\|40} />`, stroke 1.75, `currentColor` |

Verbindlich: Radius nur aus `--ce-radius-*`, Tiefe nur aus `--ce-elevation-*`,
kein Glow, kein farbiger Schatten, keine Bewegung beim Buttondruck, kein
`outline: none` ohne gleichwertigen Ersatz, Statusbadges immer mit Punkt UND
Text. Höchstes UI-Gewicht bleibt 600. `interfacePrimitives.test.mjs` prüft das.

Die historischen Klassennamen (`.btn-outline`, `.badge-green`, `.tile`,
`.table-card`, `.adm-card`, `.adm-btn-danger` …) bleiben gültig und zeigen auf
dieselben Primitives — Markup musste nicht angefasst werden.

Bewusst noch nicht migriert (folgt im jeweiligen Seitenpaket): `.auth-cta`,
`.pp-net-cta`, `.pp-kpi`, Profilhero, `.inv-summary`. Der frühere Glow-CTA
`.offers-calc-cta .btn-primary`, `.calc-panel` sowie die Angebots- und
Buchungsmodule sind mit Paket B (Premium-Versandprozess) auf die Foundation-
Primitives umgestellt.

## Gemeinsame Interface-Muster — vor jeder neuen Seite lesen

Über den Primitives liegt eine Musterebene (Paket A, Phase 3) in
`src/styles/patterns.css` — die **einzige** Datei, die NACH den
Bereichs-Stylesheets importiert wird. Anders als `primitives.css`, das deren
Sonderfälle bewusst stehen ließ, führt diese Ebene sie zusammen.

| Muster | Datei | Verwendung |
|--------|-------|------------|
| Seitenkopf | `components/ui/PageHeader.jsx` | `<PageHeader title subtitle eyebrow meta actions utility variant="customer\|admin" />` |
| Utility-Cluster | `components/ui/PageHeader.jsx` | `<UtilityCluster>` — Glocke (40×40) + `<UserChip>` (40 hoch) |
| Benutzerchip | `components/ui/UserChip.jsx` | genau EINE Identitätsanzeige im eingeloggten Bereich |
| Zustände | `components/ui/StateView.jsx` | `EmptyState` · `NoResultsState` · `LoadingState` · `ErrorState` · `NoAccessState` · `SuccessState` · `ListSkeleton` |
| Dialogverhalten | `hooks/useDialog.js` | Fokusfalle, Fokusrückgabe, Escape — `useDialog({ open, onClose, closeOnEscape })` |
| Statusfallback | `utils/statusFallback.mjs` | `statusFallback(wert)` → `[klasse, "Unbekannter Status", rohwert]` |
| Toolbar / Liste / Dialog / Drawer | `styles/patterns.css` | `.ce-toolbar`, `.ce-list-table`/`.ce-list-cards`, `.ce-dialog*`, `.ce-drawer*`, `.ce-state*` |

Verbindlich:
- **Ein Seitenkopf.** Kein zweiter Titel auf derselben Seite, keine eigene
  Kopfstruktur je Bereich. Kundenportal Display L (Cormorant), Adminportal
  Page Title (DM Sans) — im Admin nie Cormorant.
- **Glocke und Benutzerchip nur im Seitenkopf** (Desktop) bzw. in der mobilen
  Topbar. Kein freischwebender Mount, kein zweiter Avatar auf Mobil: der
  Cluster blendet unter 860 px aus, dort trägt die Topbar die Glocke. Die
  Übersicht bringt ihre Glocke in der eigenen Kopfzeile mit — deshalb ist die
  Topbar-Glocke dort ausgeblendet.
- **Ein Overlayton** (`--ce-color-overlay`), **kein `backdrop-filter`**, vier
  Dialogbreiten (`--ce-size-dialog-sm/-md/-lg/-xl` = 420/560/720/920), unter
  480 px Vollbild. Jeder Dialog hat Fokusfalle, Fokusrückgabe und Escape.
- **Keine Emojis als UI-Zustand** — Zustandsflächen tragen ein Icon aus
  `Icon.jsx`, genau eine Hauptaktion und keine technischen Rohwerte.
- **Kein roher Backendwert im sichtbaren Text.** Unbekannte Status zeigen
  „Unbekannter Status"; der Rohwert steht höchstens im `title`-Attribut.
- **Zahlen rechtsbündig** (`.ce-num` / `.adm-num` auf `<th>` UND `<td>`),
  Texte links, Aktionen rechts (`.ce-col-actions`), unter 768 px Kartenansicht
  statt gequetschter Tabelle.

`interfacePatterns.test.mjs` prüft das.

Bewusst noch nicht migriert: die Glasflächen des Auth-Bereichs. Die Buchung in
der App-Shell, der Versandprozess und `.calc-page-title` als Abschnittskopf
der Preisrechner-Formularsektion sind mit Paket B umgesetzt (siehe unten).

## Typografie — vor jedem Text lesen

Die gesamte Oberfläche kommt aus EINER Skala (Paket A, Phase 2.5). Alle Werte
stehen als `--ce-text-*`-Tokens in `variables.css`:

| Stufe | Desktop / Mobil | Familie | Gewicht | Zeilenhöhe | Verwendung |
|-------|-----------------|---------|---------|------------|------------|
| Display XL | 52 / 38 | Cormorant | 500 | 1.05 | Begrüßung der Übersicht |
| Display L | 36 / 28 | Cormorant | 500 | 1.15 | Kundenseitentitel |
| Page Title | 24 / 20 | DM Sans | 600 | 1.25 | Adminseitentitel, funktionale Detailtitel |
| Section Title | 20 / 18 | DM Sans | 600 | 1.3 | Abschnitts- und Dialogtitel |
| Card Title | 16 | DM Sans | 600 | 1.35 | Kartenüberschriften |
| Body Large | 15 | DM Sans | 400 | 1.6 | Seitenuntertitel, erklärende Texte |
| Body | 14 | DM Sans | 400 | 1.55 | Standardtext, Eingaben, Buttons |
| Body Small | 13 | DM Sans | 400 | 1.5 | Tabellen, Hilfstexte, Metadaten |
| Label | 12 | DM Sans | 600 | 1.4 | Formularlabels, Chips, Badges |
| Micro | 11 | DM Sans | 600 | 1.35 | Tabellenköpfe, Eyebrows, Gruppenlabels |
| Numeric Display | 48 / 40 | DM Sans | 600 | 1 | KPI-Werte, große Summen |

Verbindlich: **keine Halbpixel, nichts unter 11 px, keine freien
Zwischengrößen, höchstes Gewicht 600.** `typography.test.mjs` prüft das über
alle Stylesheets und Inline-Styles.

**Schriftrollen.** Cormorant (`--ce-font-display`) nur für Kundenseitentitel und
die Begrüßung — nie in Karten, Tabellen, Formularen, Dialogen oder im
Adminportal. DM Sans (`--ce-font-sans`) trägt alles Funktionale und alle Zahlen.
Libre Franklin ist ausgelaufen: keine Verwendung mehr, die Fontdateien bleiben
bis zu einer späteren Phase liegen. Im eingeloggten Bereich stehen genau zwei
Kurzaliase zur Verfügung — `--fs` (Sans) und `--fd` (Display); das frühere
`--fh` ist entfallen.

**Textfarben** kommen ausschließlich aus den Foundation-Rollen:
`--ce-color-text-primary` (Titel, Werte, Eingaben) ·
`--ce-color-text-secondary` (Untertitel, Beschreibungen) ·
`--ce-color-text-muted` (Hilfstexte, Metadaten, Datumsangaben, Einheiten) ·
`--ce-color-text-placeholder` · `--ce-color-text-disabled` ·
`--ce-color-brand-ink` (Links und Textaktionen). Die Legacy-Graustufen
`--gray400/500/600/700` tragen **keine** Textrolle mehr — `--gray400` maß
2,4:1 auf Weiß und war die Hauptquelle unlesbarer Metatexte.

**Zahlen** laufen in DM Sans mit `font-variant-numeric: tabular-nums` UND
`font-feature-settings: "tnum"`. Zahlenspalten in Tabellen sind rechtsbündig —
über die Marker `.ce-num` / `.adm-num` auf `<th>` UND `<td>`, in der
Rechnungstabelle über `nth-child`. Textspalten bleiben linksbündig.

### CSS-Import-Reihenfolge — kritisch

`src/styles/index.css` importiert alle Stylesheets in fester Reihenfolge.
Entscheidend ist: `primitives.css` steht **nach** `buttons.css`/`forms.css`
(der Fokusstandard soll dort greifen) und **vor** allen Bereichs-Stylesheets —
deren höher spezifische Sonderfälle bleiben damit wirksam.
`dashboard-premium.css` steht **nach** `dashboard.css`
(es überschreibt dessen Basisregeln gezielt), und die isolierten Bereichs-
Stylesheets (`admin.css`, `addressbook.css`, `drafts.css`, `cancellation.css`,
`email-change.css`, `overview.css`) stehen danach — sie sind reine
Zusatz-Scopes ohne Kollision.

Neue Bereichs-Stylesheets ans Ende anhängen; Änderungen an gemeinsamen
Oberflächen gehören nach `variables.css` / `dashboard-premium.css`.

## App-Layout „Executive Ivory + Deep Navy" — wichtigste Regel

Der gesamte eingeloggte Kundenbereich teilt sich **einen** Rahmen: `.app-shell`
(Sidebar + `.main-content`), gerendert von `DashboardPage.jsx` und
`DashboardLayout.jsx`. Es gibt **keine seitenabhängigen Theme-Klassen** mehr:

```jsx
// DashboardPage.jsx / DashboardLayout.jsx — überall identisch
<div className="app-shell">
```

**Konsequenzen:**
- Keine neue Hintergrund-Ebene und keine Seiten-Scope-Klasse auf `.app-shell`
  einführen. Wer eine Seite anders einfärben will, hat eine falsche Abzweigung
  genommen — die Grundfläche ist bewusst überall dieselbe Ivory-Rampe
  (`--ce-app-bg-top/-mid/-bottom`), gesetzt als EINE Hintergrundebene auf
  `.app-shell`. `.main-content` trägt bewusst keine eigene Flächenfarbe.
- **Keine Dekoration im Hintergrund**: keine Glow-Nodes, Routenlinien,
  schwebenden Icons, Punktraster, Aurora-/Blur-Flächen, Vignetten, kein
  `backdrop-filter` und keine dauerhaft laufenden Hintergrundanimationen.
  Genau diese Elemente wurden bewusst entfernt (Komponenten `VaporBackground`
  und `PremiumBackground` sind gelöscht).
- Bewegung nur als kurze Zustandsreaktion (Hover/Fokus, ≤ 200 ms) oder als
  funktionaler Ladeindikator — nie als Ambiente.
- Blau (`--accent-blue`, in der Sidebar `--ce-sidebar-active-accent`) ist
  Akzent: aktive Navigation, Links, Fokus, primäre Aktion. Keine blauen Flächen.
- Die Sidebar ist **Deep Navy** (`--ce-sidebar-bg-*`), niemals schwarz und
  niemals glasig. Der Blaukanal liegt **mindestens 30 Punkte** über dem
  Rotkanal (aktuell 44/36/32) — der Vorzustand lag bei 24/22/20 und las als
  mattes Anthrazit. `sidebarNavigation.test.mjs` (19) misst das.
- Die frühere Firmenkarte (Avatar + Firmenname + E-Mail direkt unter dem Logo)
  ist ersatzlos entfernt — kein Platzhalter, kein Ersatzblock, keine neue
  Hintergrundebene. Die Supportkarte bleibt die einzige Karte der Sidebar
  (vertiefte Fläche, `--ce-sidebar-well`, ohne Schatten). Die Kontoidentität
  bleibt über `UserChip` (Seitenkopf) und Profilhero erreichbar.
- Der Kontrast Sidebar↔Hauptfläche ist die tragende Idee des Layouts und darf
  nicht unter ~12:1 fallen — `appShellChrome.test.mjs` misst das.
- Der aktive Navigationseintrag ist mehrfach codiert (Fläche + Border +
  Akzentkante als `inset`-Schatten + Schriftschnitt), nicht allein farbig.
- **Die Marke steht fest, alles darunter scrollt in EINEM Bereich.**
  `.pp-side-in` ist der unbewegliche Rahmen, `.pp-side-scroll` der Scrollbereich —
  er umfasst Navigation, Supportkarte **und** Fußzeile. `.pp-logo` bleibt als
  Kopf darüber (`flex: 0 0 auto`).

  Zwei Fassungen davor, beide aus einem echten Fehler heraus verworfen: Lag
  `overflow-y` allein auf `.pp-nav`, standen Supportkarte und Fußzeile
  **außerhalb** des Scrollbereichs, belegten dauerhaft Höhe und schnitten den
  letzten Navigationseintrag mittendrin ab. Danach scrollte die gesamte Spalte
  inklusive Marke — funktionsfähig, aber `scrollbar-width: none` blendete jede
  Anzeige aus: die Spalte scrollte, ohne dass man es sehen konnte. Gemessen auf
  1366×768 lag „Unternehmen & Konto" 115 px, „Abmelden" 209 px unter dem
  Viewport; selbst auf 1920×1080 war „Abmelden" abgeschnitten.

  **Wer den Scrollbereich wieder auf `.pp-nav` verengt, holt den ersten Fehler
  zurück; wer die Leiste wieder ausblendet, den zweiten.** Die Leiste ist schmal
  und dezent (`scrollbar-width: thin` + `--ce-sidebar-scroll-thumb`), nicht
  unsichtbar. Sobald `scrollbar-width` gesetzt ist, ignoriert Chromium
  `::-webkit-scrollbar` vollständig — der Hover-Zustand läuft dort deshalb
  ebenfalls über `scrollbar-color`.
- **Die Navigation hat genau zwei Ebenen** — siehe „Sidebar-Informations­architektur"
  weiter unten. Zwei direkte Einträge (Übersicht, Adressbuch), drei aufklappbare
  Gruppen (Versand, Lager & Aufträge, Konto), eine Sitzungsaktion (Abmelden).
- Legal Pages (Impressum, Datenschutz, AGB, Widerruf) und der Auth-Bereich
  liegen außerhalb dieses Rahmens und bleiben unverändert.

## Sidebar-Informationsarchitektur — vor jeder Änderung an der Navigation lesen

Die Sidebar ist **ein** Navigationssystem, nicht eine Sammlung nachträglich
angebauter Module. Sie hat genau zwei Ebenen:

Standardzustand (auch nach jedem Reload) — alle Gruppen zu:

```
Übersicht
Versand            ›
Adressbuch
Rechnungen
Lager & Aufträge   ›
Konto              ›
──────────────────
Abmelden
```

Geöffnet ist immer höchstens EINE Gruppe:

```
Versand            ˅
    Neue Sendung · Versandkostenrechner · Entwürfe · Sendungen ·
    Sendungsverfolgung
Lager & Aufträge   ˅  Lagerübersicht · Artikel · Bestand · Aufträge · Bewegungen
Konto              ˅  Kontoeinstellungen · Supportanfragen
```

**Verbindlich:**

- **Eine Konfiguration, zwei Bauteile.** `NAV_GROUPS` + `OVERVIEW_ITEM` +
  `ADDRESSBOOK_ITEM` + `INVOICES_ITEM` in `DashboardSidebar.jsx` sind die einzige Quelle;
  gerendert wird über `NavItem` (jeder Eintrag) und `SidebarGroup` (jede
  Gruppe). Kein zweites Klapp- oder Eintragsmuster daneben.
- **Keine Gruppe mit nur einem Eintrag.** Die früheren Abschnitte
  „Verwaltung" (nur Adressbuch) und „Abrechnung" (nur Rechnungen) waren
  Überschriften über einer einzigen Zeile und sind ersatzlos entfallen — samt
  der Klasse `.nsec`.
- **Keine Box um eine Gruppe.** Der frühere Modulblock `.pp-nav-module` trug
  Rahmen, Radius und eine vertiefte Eigenfläche und erzeugte damit eine zweite
  optische Sidebar innerhalb der Sidebar. Er ist **ersatzlos entfernt**, nicht
  entrahmt. Die Hierarchie kommt aus **Abstand** (`margin-top` auf
  `.pp-nav-group`) und **Einrückung** (`padding-inline-start` auf
  `.pp-nav-group-items .nitem`) — nicht aus Flächen, Kanten oder Linien. Die
  einzige verbliebene Linie steht vor „Abmelden".
- **Adressbuch und Rechnungen bleiben eigenständig.** Das Adressbuch ist eine
  gemeinsam genutzte Ressource (Versand, Empfänger, Aufträge). „Rechnungen"
  stand zwischenzeitlich als „Versandrechnungen" IM Versandblock — das war zu
  eng: der Bereich soll später auch Abo- und andere Confidara-Abrechnungen
  aufnehmen, und unter „Versand" wäre er dann falsch einsortiert. Beide sind
  jetzt direkte Einträge der ersten Ebene; Rechnungen steht zwischen Adressbuch
  und „Lager & Aufträge". Der Aktivzustand kommt dort — wie bei Übersicht und
  Adressbuch — aus dem `page`-Wert; das Leuchtsystem der Gruppenköpfe gilt
  weiterhin ausschließlich für Versand, Lager & Aufträge und Konto.
- **„Lager & Aufträge" steht NICHT ganz oben.** Das kehrt eine frühere
  Festlegung um: ConfidaraExpress ist primär eine Versandplattform, das
  Lagermodul ein optionales Zusatzmodul. Es führt die Kernnavigation nicht an.
- **Drei Beschriftungen sind NUR Beschriftungen.** „Rechnungen" (page `invoices`),
  „Versandkostenrechner" (page/Route `calculator` bzw. `/calculator`) und
  „Kontoeinstellungen" (page `profile`) haben ihren sichtbaren Namen gewechselt —
  Route, page-Wert, Seite, Preis- und Rechnungslogik sind unverändert. Wer den
  sichtbaren Namen ändert, benennt keine Route um. Der Seitenkopf zieht mit
  (`ROUTE_HEADERS.calculator` in `DashboardLayout.jsx`, `Profile.jsx`), damit
  nicht zwei Namen für dieselbe Seite im Umlauf sind.
- **Geschlossen ist der Normalzustand — nichts öffnet sich von selbst.** Nach
  jedem Reload sind alle drei Gruppen zu, auch die des aktuellen Bereichs. Es
  gibt dafür **keinen Effekt**.
- **Accordion by construction.** Der Klappzustand ist EIN Wert (`null` oder
  eine Gruppen-id), kein Booleantripel: „höchstens eine Gruppe offen" ist damit
  eine Eigenschaft des Datentyps und keine Regel, die irgendwo durchgesetzt
  werden müsste. Ein Klick auf die offene Gruppe schließt sie.
- **Der Startwert kommt aus einem Modulwert** (`sitzungsOffeneGruppe`), nicht
  aus State, Context oder Storage. Grund: „Neue Sendung" läuft als `page`-State
  in `DashboardPage`, der Preisrechner und die Lagerdetailseiten als Routen in
  `DashboardLayout` — ein Wechsel dazwischen **montiert die Sidebar neu**. Ohne
  den Modulwert klappte die Gruppe genau in dem Moment zu, in dem der Nutzer
  einen ihrer Einträge benutzt. Ein Reload wertet das Modul neu aus und setzt
  ihn zwangsläufig auf `null` — die Reload-Regel bleibt damit erfüllt, ohne
  dass irgendetwas persistiert wird.
- **Die Hervorhebung folgt AUSSCHLIESSLICH dem Klappzustand, nie der Route.**
  Hervorgehoben ist die Gruppe, die der Nutzer geöffnet hat — und da höchstens
  eine offen sein kann, leuchtet höchstens eine. Aus dem `page`-Wert entsteht
  **kein** Gruppenzustand mehr, weder Klappzustand noch Markierung; er markiert
  nur noch den einzelnen aktiven Eintrag.

  Das kehrt eine frühere Fassung um, in der der Kopf leuchtete, sobald die
  Route in seinem Bereich lag: auf `/stock` leuchtete „Lager & Aufträge",
  während die Gruppe nach einem Reload zugeklappt war — die Sidebar behauptete
  einen geöffneten Bereich, den es nicht gab. Es gibt jetzt genau EINE Aussage
  je Zeichen: der Kopf sagt „diese Gruppe ist offen", der Eintrag sagt „hier
  bist du". Ein Test prüft, dass die Hervorhebung aus genau EINER CSS-Regel
  kommt.

  Der geöffnete Kopf trägt dafür eine flache, sehr leichte Fläche
  (`--ce-sidebar-active-bg-soft`, 13 %) plus 2-px-Akzentkante — gemessen
  deutlich schwächer als ein aktiver Eintrag (0,32-Verlauf, 3-px-Kante,
  zusätzlich Border). Zwei gleich starke Flächen übereinander wären keine
  Hierarchie.
- **Eingeklappt bleiben die Einträge im DOM** — ohne Inhalt gäbe es nichts zu
  animieren. Bedienbar sind sie deshalb trotzdem nicht: `visibility: hidden`
  nimmt sie aus Fokusreihenfolge **und** Accessibility-Baum; der Wechsel ist
  nur beim Schließen verzögert, damit sie während der Animation sichtbar
  bleiben. Bei `prefers-reduced-motion` entfällt die Verzögerung, sonst bliebe
  der zugeklappte Bereich kurz fokussierbar. Ein Browser-Smoke misst das.
  Jeder Gruppenkopf ist ein echtes `<button>` mit `aria-expanded`/
  `aria-controls`; der aktive Eintrag trägt zusätzlich `aria-current="page"`.
- **Weiches Öffnen über `grid-template-rows: 0fr → 1fr`**, nicht über
  `height: auto` (animiert in keinem Browser verlässlich) und nicht über eine
  gemessene Pixelhöhe. Rasterspur, Einblendung und Chevrondrehung laufen in
  EINEM Takt (`--ce-sidebar-expand-duration`, 200 ms) — sonst zerfällt das
  Öffnen in drei Bewegungen. Keine Bibliothek, kein JavaScript.
- **Zwei Ebenen, klar getrennt.** Erste Ebene (Übersicht · Versand ·
  Adressbuch · Rechnungen · Lager & Aufträge · Konto): 15 px / 600 / mindestens
  44 px hoch / Icon 18 px — **alle sechs identisch**, nur der Chevron
  unterscheidet eine Gruppe. Zweite Ebene: 14 px / 500 / 40 px / Icon 17 px, eingerückt.
  „Abmelden" trägt das Gewicht der zweiten Ebene ohne Einrückung (Aktion, kein
  Produktbereich). Unter 860 px erreicht **jedes** dieser Elemente 44 px —
  inklusive der zweiten Ebene, die dafür eine eigene, höher spezifische Regel
  braucht (siehe unten).
- **Keine Versalien im Gruppenkopf — gemessen, nicht gewählt.** Für das Label
  bleiben in der 252-px-Spalte 137 px. „LAGER & AUFTRÄGE" braucht in Versalien
  bei 15 px zwischen 143 px (ohne Laufweite) und 153 px (0,04 em) und bricht
  damit in **jeder** Variante zweizeilig um — der Kopf maß dann 62 px neben
  44 px hohen Nachbarn. Gemischt misst dasselbe Label 122 px. Wer Versalien
  zurückholen will, braucht dafür eine breitere Spalte oder eine kleinere
  Schrift; beides war ausdrücklich nicht gewollt.
- **Die Trefferflächen-Falle hat eine zweite Ebene.** `.pp-side .nitem`
  (responsive.css) und `.pp-nav-group-items .nitem` (dashboard-premium.css)
  haben dieselbe Spezifität, und dashboard-premium.css wird **später**
  importiert — die 40 px der zweiten Ebene gewannen. Gemessen: 38 px im
  Drawer. `.pp-side .pp-nav-group-items .nitem` und `.pp-side .nitem--utility`
  stellen das gezielt richtig.
- **Gemessen zur Höhe:** geschlossen passt die Navigation auf jeder getesteten
  Höhe vollständig — bei 1366×700 ohne jeden Überhang. Mit einer geöffneten
  Gruppe trägt der Scrollbereich den Rest; mehr als eine Gruppe kann gar nicht
  offen sein.
- Governance: `src/components/layout/sidebarNavigation.test.mjs` (22 Tests) und
  `src/components/layout/appShellChrome.test.mjs` (Chrome, Kontraste,
  Typografie).

## „Neue Sendung" startet leer — vor jeder Änderung am Formularstart lesen

**Produktregel: „Neue Sendung" ist ein NEUER Vorgang.** Das Formular beginnt
vollständig leer — kein Absender aus dem Profil, kein Empfänger, keine
Paketdaten, **kein vorausgewähltes Land**. Gespeicherte Angaben bleiben
komfortabel erreichbar, aber ausschließlich durch eine **bewusste Aktion**.

| Fall | Ergebnis |
|---|---|
| Sidebar → „Neue Sendung" | leer (auch wenn die Seite schon offen war) |
| Browser-Reload (F5) | leer |
| Wechsel innerhalb der Sitzung (Sidebar, „Zurück" aus der Buchung) | Vorgang bleibt |
| Entwürfe → Entwurf ausdrücklich öffnen | Entwurfsdaten werden geladen |

**Verbindlich:**

- **Eine Quelle für den Ausgangszustand.** `createEmptyShipmentForm()`
  (`utils/newShipmentForm.mjs`) — kein zweites Objektliteral daneben. Alle Werte
  sind `""`, nie `null`/`undefined`: die Felder sind kontrollierte React-
  Eingaben, und `undefined` kippt sie in unkontrollierte um.

  Nicht verwechseln mit `blankNewShipmentForm()` in `utils/formDraftsView.mjs`.
  Das ist **nicht** der Ausgangszustand von „Neue Sendung", sondern
  ausschließlich die Grundlage, auf die `buildResumeInitialState()` einen
  GESPEICHERTEN Entwurf legt — und es trägt dort weiterhin `s_country: "DE"`,
  `r_country: "CH"` und `packageCount: "1"` als Rückfallwerte für Entwürfe,
  denen ein Feld fehlt. Das ist Absicht: ein ausdrücklich geöffneter Entwurf
  ist ein anderer Fall als ein neuer Vorgang. Wer die beiden zusammenlegt,
  bringt die Vorbelegung durch die Hintertür zurück.
- **Das Profil ist Datenquelle, kein Autor.** Der frühere `profilSeed()` schrieb
  Firma, Name, Straße, PLZ, Ort, Land, Telefon und E-Mail beim Mount ins
  Formular. Er ist **ersatzlos entfallen**; dieselben Daten liefert
  `senderPatchFromProfile()` an die sichtbare Aktion „Eigene Adresse" in der
  Absender-Kopfzeile. Ohne hinterlegte Anschrift erscheint sie gar nicht
  (`hasProfileSenderData`). Die Länder-Normalisierung
  (`normalizeCountryCode`) gilt dort unverändert weiter — sie ist der Grund,
  warum ein Konto mit „DEU" überhaupt eine anzeigbare Auswahl bekommt.
- **Der Vorgang lebt nur im Arbeitsspeicher.** `ShippingFlowContext` spiegelt
  **nichts** mehr in den `sessionStorage` und liest von dort nicht mehr. Der
  Provider hängt weiterhin außerhalb `<Routes>` — nur dadurch übersteht der
  Vorgang den Wechsel `/dashboard` ↔ `/booking` **innerhalb** der Sitzung. Ein
  Reload baut den React-Baum neu auf, und der Vorgang ist weg. Genau diese
  Trennung ist der Kern: transienter Vorgang ja, persistente Wiederherstellung
  nein. `shippingFlowStorage.js` kann seitdem nur noch **löschen** (Restwerte
  aus einem älteren, offenen Tab; beide Abmeldewege nutzen es weiter).
- **Sidebar „Neue Sendung" braucht ZWEI Dinge**, einzeln reicht keines:
  `clearFlow()` leert den Context, und ein **Remount-Schlüssel**
  (`neueSendungKey` in `DashboardPage`) erzwingt eine neue Instanz. Steht `page`
  bereits auf `"new"`, ist `setPage("new")` ein No-Op — die Seite bliebe gemountet
  und ihr LOKALER Formularzustand überlebte das Leeren des Contexts. Dieselbe
  Falle ist beim Entwurfsspeichern dokumentiert.
- **Der Weg aus der Buchung zurück läuft NICHT über `navigateTo`** (BookingPage
  navigiert direkt mit `state.page`) und ist deshalb von der Zurücksetzung nicht
  betroffen.
- Governance: `utils/newShipmentEmptyState.test.mjs` (24 Tests) und
  `tests/e2e/newShipmentEmptyState.test.mjs` (11 Browser-Smokes; der
  Breitentest läuft bewusst über den direkten Einstieg — den Weg über die
  Sidebar prüft S3, und der Drawer unter 860 px wäre dort nur ein zweiter,
  für das Layoutziel bedeutungsloser Fehlerpfad).

## Paketmaße sind Pflicht — kein Ersatzwert, nirgends

**ConfidaraExpress berechnet niemals einen Tarif auf Maßen, die der Kunde nicht
eingegeben hat.** Anzahl, Gewicht, Länge, Breite und Höhe sind vollständig
Pflicht — im Formular, im Preisrechner und serverseitig.

Bis zu diesem Paket galten Länge, Breite und Höhe als optional und wurden an
**fünf** Stellen still durch `30 / 20 / 15` ersetzt: `Number("")` ist `0` und
damit falsy, also griff `Number(form.length) || 30`. Ein leeres Eingabefeld
erzeugte damit ein vollwertiges Paket, bekam einen Tarif und war buchbar — der
Kunde sah einen Preis für Maße, die er nie beschrieben hat, während der Carrier
nach dem echten Paket abrechnet.

- **Eine Regel je Seite, beide identisch.** Frontend:
  `packageFieldError`/`packageComplete`/`packagePayload`
  (`utils/newShipmentForm.mjs`). Backend: `lib/packageDimensions.js`. Grenzen
  unverändert: Gewicht 0,1–1000 kg, Maße 0,1–300 cm, Anzahl 1–99 ganzzahlig.
- **Erst Anwesenheit, dann parsen, dann Bereich** — nie in einem Schritt und nie
  über eine Falsy-Abfrage. Boolean, Array und Objekt gelten nicht als Zahl
  (`Number(true) === 1` wäre sonst ein gültiges Maß von 1 cm).
- **`packagePayload()` liefert `null`, sobald etwas fehlt.** Es gibt keinen Pfad,
  auf dem ein unvollständiges Paket zu einem Request wird.
- **Beispiele sind Placeholder, niemals Werte**: „z. B. 5 / 30 / 20 / 15", bei
  der Anzahl „1". Eine nackte „5" in einem Zahlenfeld ist von einer echten
  Eingabe nicht zu unterscheiden — deshalb steht „z. B." davor. Kein
  `defaultValue`, kein vorbelegter State.
- **Keine Fehlerwand auf leerem Formular.** Rote Markierungen entstehen
  unverändert erst beim Weiterklicken; der deaktivierte CTA trägt stattdessen
  eine ruhige Hinweiszeile (`packageHint`), die sagt, was fehlt.
- **Die Buchungsübersicht zeigt Gewicht UND Maße** (`packageSummaryLine`):
  „5 kg · 30 × 20 × 15 cm", bei mehreren Paketen „2 Pakete · je 5 kg · …". Nur
  tatsächlich gespeicherte Werte — nichts wird ergänzt oder gerundet.
- **Der frühere Rechnerhinweis „… oder lassen Sie alle drei Felder leer, um mit
  Standardmaßen zu rechnen" ist entfallen.** Diese Möglichkeit gibt es nicht mehr.

## Laufender Versandvorgang — vor jeder Änderung an Preisrechner, Neue Sendung oder Buchung lesen

Der Kunde kann während eines Versandvorgangs zwischen „Neue Sendung",
Angebotsvergleich und Buchung hin und her navigieren, ohne Daten zu verlieren —
über den sichtbaren Button „Zurück", Browser-Zurück, Browser-Vorwärts, die
Sidebar und ein versehentliches Neuladen.

**Warum es einen eigenen Provider braucht.** „Neue Sendung"/Angebotsvergleich
laufen als `page`-State in `DashboardPage` (`/dashboard`), die Buchung als
eigene Route in `DashboardLayout` (`/booking`) — **zwei getrennte
Routen-Teilbäume**. Jeder Wechsel hängt den anderen vollständig ab, inklusive
`NotificationsProvider`. Deshalb steht `ShippingFlowProvider` in `App.jsx`
**außerhalb `<Routes>`** und **innerhalb** des `AuthProvider` (main.jsx).
Nicht in ein Layout oder eine Seite verschieben — dort überlebt er den
Routenwechsel nicht. `shippingFlowState.test.mjs` prüft die Montage.

| Baustein | Datei | Aufgabe |
|----------|-------|---------|
| Zustandsmodell | `utils/shippingFlowState.mjs` | rein, versioniert, Ablaufregel, Normalisierung |
| Speicherzugriff | `utils/shippingFlowStorage.js` | gekapselter `sessionStorage` (eigenes Modul: sonst Importzyklus AuthContext ↔ ShippingFlowContext) |
| Provider + Hook | `context/ShippingFlowContext.jsx` | `useShippingFlow()`, Spiegel, Abmelde-Wächter |

**Verbindliche Regeln:**

- **Wiederherstellen nur über den Mount-once-Initialisierer** (Muster
  `resumeInitRef`). NIEMALS feldweise über `upd()`: das ruft
  `invalidateResults()` und löscht die soeben zurückgeholten Angebote sofort
  wieder. Das ist die gefährlichste Falle im ganzen Bereich.
- **Der sichtbare „Zurück"-Button navigiert gezielt, nie über die History.**
  `navigate("/dashboard", { replace: true, state: { page: "new", returnTarget: "offers" } })`
  — kein `navigate(-1)`, kein `history.back()`. Grund: die Sidebar-Navigation
  setzt nur den lokalen `page`-State und fasst die History gar nicht an. Wer
  über „Übersicht", „Rechnungen" oder „Profil" zu „Neue Sendung" gewechselt
  war, landete mit einem History-Rücksprung wieder dort statt bei seinen
  Angeboten. Der Button darf niemals aus dem vorherigen Eintrag ableiten,
  welcher Bereich sich öffnet.
- **Der aktuelle Dashboard-Eintrag trägt seinen Bereich.** Ein Effekt in
  `DashboardPage` hält `history.state.usr.page` per `replace` am `page`-State
  nach — damit landet auch Browser-Zurück von `/booking` verlässlich auf „Neue
  Sendung". Gelesen wird `window.history.state.usr` (Live-Wert), nicht das
  `location`-Objekt des Renders: die beiden Effekte darüber ersetzen den
  Eintrag im selben Commit.
- **Kein History-Kreislauf.** Der erste Weg in die Buchung pusht; kommt der
  Kunde von dort zurück (`returnTarget: "offers"` im Eintrag), ersetzt der
  nächste Weg. Sonst wüchse die History bei jedem Wechsel Angebote ↔ Buchung.
- **Vorrang beim Start:** Entwurf fortsetzen > Adressbuch-Prefill >
  Sitzungsvorgang > Profil-Seed > leer. Ein geöffneter Entwurf **überschreibt**
  den Sitzungsvorgang vollständig — es wird nichts gemischt.
- **Nur `sessionStorage`**, Schlüssel `ce_shipping_flow_v1`, tab-lokal, keine
  tabübergreifende Synchronisierung. Eine fremde Schemaversion wird
  **verworfen, nicht migriert**.
- **Nichts duplizieren, was serverseitig autoritativ ist:** Abholzeitfenster,
  Zoll-/Handelsrechnungsdokumente, Preisbestätigung, Access-Point-Suche. Keine
  Tokens, Passwörter, Dateien. AGB- und Gefahrgutbestätigung werden bewusst
  **nicht** wiederhergestellt — eine Einwilligung wird nicht unterstellt.
- **Gelöscht wird bei:** erfolgreicher Buchung · Abmeldung (auch über den
  zentralen 401/403-Handler) · „Neue Sendung" vom Erfolgsbildschirm ·
  „Eingaben zurücksetzen" · erfolgreichem „Als Entwurf speichern" (beide
  Entwurfspfade, siehe unten). **Nicht** gelöscht bei Sidebar-Wechsel, Zurück,
  Vorwärts, Reload oder beim Öffnen des Benachrichtigungspanels.
- **60 Minuten Inaktivität** (oder ein Versanddatum in der Vergangenheit):
  Formular, Filter und Sortierung bleiben, Angebote/`shipmentId`/Auswahl werden
  verworfen, der Kunde bekommt einen Satz im bestehenden Hinweisstil. Die
  Tarife tragen selbst kein `validUntil` — diese Frist ist reine
  Darstellungssicherheit, **keine** Buchungsregel. `PRICE_CHANGED` und
  `PICKUP_WINDOW_CHANGED` bleiben das autoritative serverseitige Netz.
- **Schritt 3 der Buchung (Erfolg) wird nie wiederhergestellt** — er gehört zu
  einer abgeschlossenen Buchung.

### Entwurf speichern beendet den aktiven Vorgang

Zwei unabhängige Speicherpfade legen einen Entwurf serverseitig an — der
**aktive temporäre Vorgang** (Context + `sessionStorage`) ist danach fachlich
etwas anderes als der gespeicherte Entwurf und muss enden, sonst zeigt die
nächste „Neue Sendung" die gerade gespeicherte Sendung erneut:

| Pfad | Auslöser | Beendet den Vorgang über |
|------|----------|---------------------------|
| Formularentwurf | `.dft-savedraft-cta` in `NewShipmentPage.jsx` | `resetToFreshShipment()` |
| Sendungsentwurf | `SaveDraftAction` auf `BookingPage.jsx` | `onSaved={clearFlow}` |

**Nur nach bestätigtem Erfolg, nie beim Requeststart.** Bei 409/404/429/
401/403 oder einem Netzwerkfehler (catch-Zweig) bleiben Formular, Angebote,
Filter, Sortierung und Auswahl vollständig erhalten — der Kunde kann erneut
speichern. Der Sendungsentwurf ist inzwischen ebenfalls fortsetzbar (siehe
„Zusatzoptionen im Entwurf") — das Löschen des Flows nach dem Speichern bleibt
trotzdem richtig: fortgesetzt wird über den GESPEICHERTEN Entwurf, nicht über
den beendeten temporären Vorgang.

**Die Persistenz-Falle:** `NewShipmentPage` bleibt nach dem Speichern
gemountet, und der Spiegel-Effekt aus „Laufender Versandvorgang" ist an
lokale Werte gebunden, nicht an den Context. Ein bloßes `clearFlowScope()`
im Erfolgspfad hätte deshalb NICHT gereicht — der nächste Tastenanschlag
hätte den noch alten lokalen State sofort wieder in den `sessionStorage`
geschrieben. `resetToFreshShipment()` setzt deshalb Formular, Filter,
Sortierung, Ergebnisse UND Baseline in einem einzigen Render zurück (React-
Batching) und ruft `clearFlowScope("shipment")` im selben Zug auf — der
Spiegel-Effekt beobachtet beim nächsten Feuern bereits den frischen Zustand.
Dieselbe Funktion trägt auch den bewussten „Eingaben zurücksetzen"-Button
(`applyReset`); nur der zusätzliche `saveStatus` unterscheidet beide Aufrufer.

Governance: `utils/shippingFlowState.test.mjs` (38 Tests) und
`tests/e2e/shippingFlowRestore.test.mjs` (37 Tests, echter Dev-Server) —
darunter vier Läufe, die den Zurück-Button über je einen anderen Startreiter
der Sidebar prüfen, sowie zehn Läufe, die alle drei Auslöser des Erfolgspfads
(sichtbarer Button, Buchungsseite, „Speichern und verlassen" aus dem
Verlassen-Dialog) sowie Fehlerfall, Persistenz-Falle, Entwurfsliste und
Fortsetzen ohne Vermischung end-to-end gegen einen echten Dev-Server
absichern.

## Profildaten im Versandformular — warum ein Konto sonst dauerhaft scheitert

Der Absender von „Neue Sendung" und des Versandkostenrechners wird aus dem
**Profil** vorbelegt (`profilSeed()` → `users.*`). Damit gilt eine Regel, die
zweimal übersehen wurde und beide Male denselben Fehler erzeugt hat:

> **Was das Profil speichern kann, muss der Entwurf annehmen können — und was ein
> Auswahlfeld anzeigen soll, muss in seiner Optionsliste stehen.**

Wird eine der beiden Seiten enger als die andere, entsteht ein **accountabhängiger
Totalausfall**: nicht ein Fehler beim Tippen, sondern ein Konto, das die Funktion
nie benutzen kann, ohne dass der Kunde die Ursache irgendwo sieht.

Zwei belegte Fälle:

| Feld | Profilspalte | Was der Entwurf verlangte | Folge |
|---|---|---|---|
| `zip` | `users.zip VARCHAR(20)` | max. 10 | 400 auf `sender.postalCode` bei JEDEM Entwurf |
| `country` | `users.country VARCHAR(10)`, **ohne CHECK**, bei der Registrierung ungeprüft | ISO-2 | 400 auf `sender.country` — und dieselbe Ablehnung in der Buchung |

**Verbindlich:**

- **Das Land läuft über `normalizeCountryCode()`** (`utils/countries.js`), nie roh
  aus dem Profil. Ein `<select>` mit einem `value`, das in keiner `<option>`
  vorkommt, zeigt gar keine Auswahl — die Oberfläche behauptet dann etwas anderes
  als der State. Genau drei Seed-Punkte: `NewShipmentPage.profilSeed`,
  `CalculatorPage`-Formularinit und `profileView.companyBaseline`. Der letzte ist
  keine Kür: ohne ihn ließ sich die Unternehmenskarte des Profils **nicht mehr
  speichern**, der Kunde konnte seinen eigenen Datensatz also nicht reparieren.
- **Es wird nicht geraten.** „DEU" wird NICHT zu „DE" gemacht — eine
  Alpha-3-Tabelle wäre eine erfundene Länderzuordnung. Unbekanntes bekommt
  denselben Ausgangswert wie ein Konto ganz ohne Land.
- **Die ANZEIGE der Profilseite bleibt ungefiltert** („Nicht angegeben"). Sie soll
  nicht behaupten, es sei ein gültiges Land hinterlegt. Normalisiert werden
  Eingabefelder und Payloads, nicht die Wahrheit über den gespeicherten Wert.
- **Ein abgelehntes Feld wird markiert, nicht verschluckt.** Der Entwurfs-Save
  wertet bei 400 `field` über `SHIPMENT_FIELD_MAP` aus (derselbe Weg wie der
  Preisrechner) und setzt `saveMode="fieldError"` — einen EIGENEN Zustand neben
  `error`, weil die Handlungsanweisung eine andere ist: bei einem Feldfehler hilft
  kein erneuter Versuch. Das generische „Bitte versuche es erneut" war die falsche
  Auskunft und hat genau diesen Fehler jahrelang unauffindbar gemacht.
- **Die Entwurfsfunktion hängt an KEINER Rolle.** Die Routen sind rollenfrei und
  ausschließlich kundenskopiert; der Speicherknopf hängt allein an `isDirty`. Wer
  hier ein Rollen- oder Kontotyp-Gate einführt, baut den Fehler nach, den dieser
  Fix beseitigt hat.
- Governance: `src/utils/accountProfileSeed.test.mjs` (21 Tests) und backendseitig
  `tests/form-drafts-accounts.test.js` (32 Tests, echte Routen gegen eine echte
  Datenbank — acht Profilzustände, volle Ownership-Matrix, Schemaabgleich gegen
  `information_schema`).

## Adressbuchauswahl im Versandformular — vor jeder Änderung daran lesen

„Neue Sendung" kann Absender und Empfänger aus dem Adressbuch übernehmen. Die
Auswahl steht **in der Abschnittsüberschrift** (`.calc-section-head`), rechts
neben „ABSENDER" beziehungsweise „EMPFÄNGER" — nicht als zweiter großer Knopf
darunter: sie ist eine Abkürzung neben einem vollständig bedienbaren Formular
und soll es optisch nicht überstimmen. Auf schmalen Viewports bricht die ZEILE
um (`flex-wrap`), es wird nichts gestaucht und nichts abgeschnitten.

| Baustein | Datei | Aufgabe |
|----------|-------|---------|
| Auswahl | `components/addressbook/AddressPicker.jsx` | sucht, zeigt an, meldet die gewählte Adresse |
| Auslöser + schwebende Fläche | `components/addressbook/AddressPickerButton.jsx` | Auf-/Zuklappen, Platzierung, Fokusrückgabe |
| Feldauslegung | `utils/addressBookView.mjs` | `mapAddressToShipmentFormPatch` (unverändert) |
| Darstellung | `utils/addressBookView.mjs` | `addressPickerLabel` · `addressPickerPerson` · `addressPickerMeta` |

**Verbindlich:**

- **EIN Bauteil, kein Duplikat.** `AddressPicker` ist die verallgemeinerte
  Fassung des früheren `components/inventory/RecipientAddressPicker` (der auf
  `TAB_RECIPIENT` festverdrahtet war und deshalb für den Absender hätte kopiert
  werden müssen). Der Reiter ist jetzt eine Prop; Auftragsdialog und „Neue
  Sendung" teilen sich dasselbe Bauteil. Der Picker kennt **weder** Sendung
  noch Auftrag, Entwurf oder Buchung — er gibt die Adresse zurück, die
  Feldauslegung bleibt außerhalb.
- **Ein fehlender Reiter führt nie zu einer ungefilterten Liste.** Der Picker
  normalisiert deterministisch auf `TAB_RECIPIENT`; sonst stünden im
  Absenderfeld fremde Empfängeradressen. Serverseitig heißt der Filter weiterhin
  „sender ODER both" bzw. „recipient ODER both".
- **Kopie, keine Bindung.** Ein Klick setzt Werte — es entsteht keine
  `addressId`, nichts wird nachsynchronisiert und **nichts** ins Adressbuch
  zurückgeschrieben. Der Entwurfs-Snapshot bleibt reine Werte.
- **EIN gebündelter Formularpatch, GENAU EINE `invalidateResults()`.** Neun
  einzelne `upd()`-Aufrufe liefen neun Mal durch die Invalidierung und erzeugten
  neun Renders für einen einzigen Vorgang.
- **Die Baseline wird NICHT nachgezogen.** Das ist der Unterschied zum
  automatischen Prefill beim Mount (dort ist `setBaseline` richtig, weil es der
  Ausgangszustand ist): eine Auswahl im Picker ist eine **Nutzeränderung**. Die
  Seite gilt danach als geändert — der Verlassen-Hinweis erscheint, „Als Entwurf
  speichern" ist bedienbar. `addressPickerUx.test.mjs` (E3) hält beides fest.
- **Der Standardabsender bleibt der Profil-Seed.** `is_default_sender` wird in
  dieser Ausbaustufe bewusst NICHT zur automatischen Vorbelegung benutzt;
  Profil-Seed, Mount-Prioritäten und Default-Initialisierung sind unverändert.
- **Drei Zeilen je Treffer** (Bezeichnung/Firma · Person · Anschrift). Mit nur
  Name + Anschrift sahen zwei Einträge DERSELBEN Firma an DERSELBEN Adresse mit
  unterschiedlichen Ansprechpartnern identisch aus — genau der Fall, für den ein
  Adressbuch zwei Zeilen führt. Die zweite Zeile wiederholt nie, was schon in
  der ersten steht. **Nichts wird gekürzt**: lange Namen brechen um (CSS), sie
  verlieren keine Zeichen — kein `slice()`, keine Ellipsis.
- **Die Fläche schwebt `position: fixed` und wird gemessen platziert.**
  `.calc-panel` trägt `overflow: hidden` (runde Ecken) — eine absolut
  positionierte Fläche würde an der Panelkante abgeschnitten. Dieselbe Falle ist
  im Zeilenmenü der Bestandsseite dokumentiert (`RowActionsMenu`). Zusätzlich
  misst ein `ResizeObserver` neu, **sobald die Fläche wächst**: sie startet mit
  einer Ladezeile und wird mit der Trefferliste deutlich höher — die einmalige
  Messung beim Öffnen entschied an der falschen Höhe, ob unten Platz ist
  (gemessen auf 390 × 780: 78 px unter dem Bildrand).
- **Tastatur als NATIVER Listener am eigenen Knoten, nicht als
  `onKeyDown`.** `useDialog` hängt sein Escape an den DOM-Knoten des Dialogs;
  React 18 stellt Synthetic Events dagegen am Wurzelcontainer zu und damit
  **nach** jedem nativen Listener eines Vorfahren. Ein `stopPropagation()` im
  React-Handler kam zu spät: Escape schloss im Auftragsdialog erst die Auswahl
  und dann den ganzen Dialog samt eingetragener Positionen. Im Browser gemessen.
- **Kein `role="dialog"` auf der schwebenden Fläche.** Sie ist nicht modal und
  fängt den Fokus absichtlich nicht ein — wer weitertabbt, verlässt sie, und sie
  schließt sich dabei. Die Dialogrolle verspräche eine Fokusfalle, die das
  Designsystem für echte Dialoge zu Recht einfordert. Es ist eine beschriftete
  Gruppe (`role="group"`), und der Fokus kehrt beim Schließen **und** beim
  Wählen an den Auslöser zurück.
- **Ein überholtes Ergebnis kann ein neueres nie überschreiben** — zwei
  Schichten, beide nötig: `AbortController` bricht den laufenden Request ab, der
  Sequenzzähler verwirft eine Antwort, die bereits unterwegs war. Ein Abbruch
  ist kein Fehler des Nutzers und erzeugt keine Meldung.
- Bewusst **nicht** enthalten: automatischer Standardabsender, „zuletzt
  verwendet", Favoritensortierung, automatisches Speichern manuell eingegebener
  Empfänger, echte Dublettenerkennung, Adressverwaltung im Picker,
  Carrier-Längenhinweise, neue Filter, neue Tabellen, neue Endpunkte. **Das
  Backend wurde für dieses Paket nicht geändert.**
- Governance: `src/utils/addressPickerUx.test.mjs` (39 Tests — Feldauslegung
  ohne Referenz, keine Kürzung, Unterscheidbarkeit, Reiternormalisierung,
  ein Endpunkt, Entprellung + Abbruch + Sequenz, Escape ohne Dialogschaden,
  Position der Auslöser, gemessene Platzierung, EIN Patch / EINE Invalidierung,
  Baseline unangetastet, Snapshot ohne Adressbuchbezug, kein zweiter Picker) und
  `src/utils/orderCreateUx.test.mjs` (Regression des Auftragsdialogs).

## Adressvalidierung im Formular — vor jeder Änderung daran lesen

Jedes Adressformular (Neue Sendung, Adressbuch, Auftragsdialog) prüft Land, PLZ, Ort und
Straße gegen ein offenes Verzeichnis und schlägt Orte und Straßen vor. Das **ergänzt** die
bestehende Formatprüfung (`postalCode.mjs`, generierte libaddressinput-Regeln) und ersetzt
sie nicht — beide laufen nebeneinander.

| Baustein | Datei | Aufgabe |
|---|---|---|
| Auswertung (rein) | `utils/addressValidationView.mjs` | Zustände, Fingerabdruck, Texte |
| Ablauf | `hooks/useAddressValidation.js` | Entprellung, Abbruch, Sequenz, Invalidierung |
| Eingabe | `components/address/AddressSuggestInput.jsx` | EIN Vorschlagsfeld für alle Formulare |
| Anzeige | `components/address/AddressStatusLine.jsx` | Statuszeile, „trotzdem verwenden" |
| Zugriff | `api/addressValidationApi.js` | einziger Weg zur CE-Adress-API |

**Verbindlich:**

- **Nur ein eindeutiger Widerspruch blockiert.** `addressBlocksSubmit()` gibt ausschließlich
  bei `invalid` true zurück. `unverified` und `unavailable` blockieren **nie** — eine
  Datenlücke, ein Neubaugebiet oder ein Ausfall des Prüfdienstes darf einen realen Kunden
  nicht am Versand hindern. Beide Zustände bieten stattdessen „Adresse trotzdem verwenden".
- **Nicht unterstützte Länder verhalten sich exakt wie vorher.** Außerhalb DE/AT/CH/LI wird
  nicht gefragt, nichts angezeigt und nichts blockiert.
- **Das Frontend entscheidet nichts.** Keine Ortsliste, keine Straßenliste, keine
  Landesdatenbank im Client. Jeder Status kommt aus der serverbestätigten Antwort; eine
  unbekannte oder kaputte Antwort wird zu `unverified`, nie zu `invalid`.
- **Die Hausnummer gilt nie als bestätigt.** Der Text lautet bewusst „PLZ, Ort und Straße
  bestätigt". `houseNumberVerified` wird auch bei einer manipulierten Antwort auf `false`
  gezwungen. Ein Vorschlag korrigiert die Schreibweise der Straße und **behält die
  Hausnummer des Kunden** — sie wird weder verworfen noch erfunden.
- **Genau ein Ort wird ergänzt, mehrere nie.** Auto-Fill greift nur in ein LEERES Feld und
  nur bei genau einem Treffer; bei mehreren gültigen Orten bleiben es Vorschläge. Ein
  bereits eingetragener Ort wird nie überschrieben.
- **Jede Änderung an Land, PLZ, Ort oder Straßenname verwirft die Bestätigung**
  (`addressFingerprint`). Die Hausnummer steht bewusst NICHT im Fingerabdruck — sie wird
  ohnehin nie geprüft, ein Verfall bei jedem Tippen wäre Schikane.
- **Entwürfe bleiben unvollständig speicherbar.** Der Entwurfsknopf hängt unverändert allein
  an `canExplicitSave`; die Adressprüfung fasst `form_drafts` nicht an. Auch das Adressbuch
  blockiert das Speichern nicht — dort ist die Prüfung reine Hilfestellung.
- **Ein Feld, ein Muster.** `AddressSuggestInput` ist ein normales Eingabefeld mit
  Vorschlagsliste (Combobox: `aria-expanded`/`-controls`/`-activedescendant`, Pfeiltasten,
  Enter, Escape, Klick außerhalb). **Kein Auswahlzwang** — freies Tippen bleibt jederzeit
  möglich, sonst wären lückenhafte Datenbestände ein Versandhindernis. Höchstens acht
  Vorschläge, Liste so breit wie das Feld, `max-height` — sie kann auf keinem Viewport
  aus dem Bild laufen.
- **Anfragehygiene:** 300 ms Entprellung, `AbortController` **und** Sequenzzähler (eine
  bereits unterwegs befindliche Antwort darf ein neueres Ergebnis nie überschreiben), ein
  Abbruch erzeugt keine Fehlermeldung, Straßensuche erst ab zwei Zeichen und nur innerhalb
  einer bekannten PLZ/Ort-Kombination.
- Governance: `src/utils/addressValidationUx.test.mjs` (36 Tests) und
  `tests/e2e/addressValidation.test.mjs` (10 Browser-Smokes gegen gemocktes Backend).

## Dashboard-Navigationsmodell

Die Navigation zwischen Dashboard-Unterseiten läuft **nicht über React Router URLs**, sondern über einen lokalen `page`-State in `DashboardPage.jsx`:

```jsx
// DashboardPage.jsx
const [page, setPage] = useState("overview");

// Navigation: State setzen, NICHT navigieren
const navigateTo = (id) => {
  if (id === "calculator") { navigate("/calculator"); return; } // Ausnahme
  setPage(id);
};

// Verfügbare Werte: "overview" | "new" | "shipments" | "invoices" | "profile"
```

**Konsequenzen:**
- URLs wie `/dashboard/shipments` existieren **nicht** — kein Umbau auf URL-Routing ohne Abstimmung
- Browser-Zurück-Button funktioniert innerhalb des Dashboards nicht seitenweise — bewusste Entscheidung
- Links zu Dashboard-Unterseiten immer über `onClick={() => navigateTo("shipments")}`, nie über `<Link to="...">`

### Calculator-Rücknavigation

Der Calculator läuft auf `/calculator`. Nach einer Buchung navigiert `BookingPage` zurück zum Dashboard per `?page=`-Query-Param:

```jsx
// DashboardPage.jsx liest beim Mount den ?page= Parameter
const p = new URLSearchParams(location.search).get("page");
if (p && ["overview","new","shipments","invoices","profile"].includes(p)) {
  setPage(p);
  // Query-Param entfernen — der Bereich wandert dabei in den History-State
  // des ERSETZTEN Eintrags. Vorhandene State-Werte bleiben erhalten.
  navigate("/dashboard", { replace: true, state: { ...(location.state || {}), page: p } });
}
```

Dieser Mechanismus ermöglicht Direktlinks in Dashboard-Unterseiten aus externen Kontexten.

**Der `page`-Marker im History-State ist Pflicht.** Ohne ihn lautete der
zurückbleibende Eintrag schlicht `/dashboard`, und ein Browser-Zurück von
`/booking` landete auf der Übersicht statt auf „Neue Sendung" — während der
sichtbare Zurück-Button korrekt dorthin führte. `DashboardPage` liest den
Startwert deshalb aus Query **oder** History-State; die URL bleibt sauber. Die
gültigen Werte stehen an genau einer Stelle (`DASHBOARD_PAGES`).

## Carrier-SVG-Integration

Vite erfordert **statische Imports** für SVG-Assets. Kein dynamisches `import('../assets/' + name + '.svg')`:

```js
// Overview.jsx — so und nur so
import dhlLogo from "../../assets/carriers/dhl.svg";

const CARRIERS = [
  { name: "DHL", logo: dhlLogo },
  // ...
];
```

SVG-Dateien liegen in `src/assets/carriers/`. `der-kurier.svg` ist vorhanden aber nicht eingebunden (enthält Raster-Bitmap, 181 KB).

## API & Auth

```js
// api/client.js
export const API = import.meta.env.VITE_API_URL;
export const token = () => localStorage.getItem("ce_token");
export const authH = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });
export const jsonH = { "Content-Type": "application/json" };
```

- Login speichert JWT unter `ce_token`
- Registrierung benötigt Admin-Freischaltung (kein Self-Signup)
- `ProtectedRoute` leitet bei fehlendem Token auf `/login` um
- **API-Aufrufe über `src/api/client.js`** (Helper `token()`/`authH()`/`jsonH`) — Abweichungen nur mit klarer Begründung und expliziter Freigabe
- **Auth-State nur über `AuthContext`** — keine parallele Auth-Logik; bestehende Fehlerbehandlung für `sessionExpired` nicht beschädigen

## Icon-Komponente

Alle Icons über `<Icon n="name" s={size} c="color" />` in `src/components/ui/Icon.jsx`. Neue Icons: SVG-Pfad als String im `paths`-Objekt eintragen. `truck` ist ein Sonderfall mit eigenem SVG-Markup.

## Responsive Breakpoints

| Breakpoint | Wichtige Änderungen |
|------------|---------------------|
| ≤ 860 px | Sidebar wird zum Drawer-Overlay; mobile-topbar sichtbar |
| ≤ 600 px | KPI-Grid 2-spaltig; Carrier-Grid 2-spaltig |
| ≤ 420 px | KPI-Grid 1-spaltig; Footer-Grid 1-spaltig |

### Responsive- und Text-Wrapping-Regeln (systemweit gehärtet)

- **Reflow vor Mid-Word-Break.** Wird es eng, ändert das LAYOUT die Struktur
  (Spalten umbauen, Karten statt Tabelle, Zeile zweizeilig) — Text wird nicht
  zeichenweise zerlegt. `.badge` bricht nur an Wortgrenzen, nie per
  `anywhere`/`break-all`/Silbentrennung; `.btn` bleibt nowrap (Bedieneinheit).
- **Reale Contentbreite, nicht Viewport.** In der App-Shell gilt
  Content ≈ Viewport − 252 px Sidebar − 56 px Rahmen. Tabellen↔Karten-Umschalter
  deshalb bei 1100 px Viewport (Rechnungs-Vorbild) oder als Container-Query an
  der echten Breite (Adressbuch, `.abk-list-wrap`; @container erhöht die
  Spezifität nicht — Basisregeln VOR die Container-Stufen stellen).
- **Schrumpfglieder gezielt setzen**: `minmax(0, Xfr)` für nachgiebige
  Grid-Textspalten, `fit-content(…)` als Boden für Badge-/Metaspalten,
  `min-width: 0` nur am konkreten Glied der Ellipsis-/Wrap-Kette. NIEMALS
  global (`*`), niemals globales `overflow-wrap: anywhere`/`break-all`.
- **Technische Strings brechen LOKAL**: E-Mail/IDs/Nummern tragen ihr
  `overflow-wrap: anywhere` auf einem eigenen Element (z. B.
  `.abk-contact-email`, `.inv-cell-number-value`); Telefonnummern bleiben
  nowrap in einer wrap-fähigen Zeile („Meta hält, Text weicht").
- **flex-basis-Falle**: In `flex-direction: column` wird die Zeilen-basis zur
  HÖHE — beim Stapeln `flex: 1 1 auto` setzen (`.abk-search`,
  `.ce-page-header-text`).

`responsiveHardening.test.mjs` (Quelltext, 10 Tests) und
`tests/e2e/responsiveHardening.test.mjs` (echter Dev-Server, 12 Tests,
Worst-Case-Daten über 14 Breiten) sichern das ab.

### Gemeinsamer Inhaltsrahmen

Alle Unterseiten laufen durch `.page-body`, der Seitenkopf durch
`.dash-section-header` — beide teilen sich dieselbe Rahmenbreite:

```css
.page-body,
.dash-section-header,
.alert-wrapper { max-width: 1240px; margin: 0 auto; }
```

Denselben Rahmen nutzt der Footer der App-Shell (`.app-footer`, gerendert von
`LegalLinks.jsx`): links das Copyright, rechts die vier Rechtlinks. Es gibt
genau **einen** Footer im eingeloggten Bereich — `Footer.jsx` gehört zum
öffentlichen `NavbarLayout` und ist etwas anderes. `.main-content` ist eine
Flex-Spalte, damit `.app-footer { margin-top: auto }` auf kurzen Seiten am
unteren Rand sitzt; die Flex-Kinder brauchen deshalb `min-width: 0; width: 100%`
(sonst sprengt die Mindestbreite der Tabellen schmale Viewports).

Neue Layout-Elemente **immer innerhalb** dieses Rahmens platzieren und keine
zweite `max-width` darunter einziehen — sonst laufen Seitenkopf und Inhalt auf
breiten Screens (1440 px+) um wenige Pixel auseinander. Die Übersicht nutzt
denselben Gedanken über `.pp-main` (`max-width: 1420px`), weil ihr KPI-Raster
fünf Spalten breit ist.

### 100dvh statt 100vh

Auth-Komponenten und `.app-shell` verwenden `min-height: 100dvh` (dynamic viewport height). Das ist absichtlich: Mobile-Browser verändern die Adressleistenhöhe beim Scrollen, `100vh` würde dort zu unerwünschten Überlappungen führen. Bei neuen Vollbild-Layouts ebenfalls `100dvh` verwenden.

## Performance-Regeln

**React.lazy beibehalten:** Alle Pages sind lazy-loaded. Neue Pages ebenfalls mit `React.lazy(() => import("./pages/NewPage"))` einbinden — kein direkter Import in `App.jsx`.

**SVG-Dateigröße:** Carrier-Logos sollten unter 20 KB bleiben. `der-kurier.svg` (181 KB, Raster-Bitmap eingebettet) ist das Negativbeispiel — solche Dateien nicht einbinden. Echte Vektor-SVGs liegen bei 2–14 KB.

**Vite SVG-Inlining:** Vite bettet SVG-Dateien unter ~4 KB automatisch als Data-URI ins JS-Bundle ein (kein separater HTTP-Request). Aktuell betroffen: `ups.svg` (3,2 KB) und `dpd.svg` (2,0 KB). Beim Debugging im Network-Tab nicht wundern.

**Build vor Push:** Vor jedem Commit mit Stylesheet- oder Import-Änderungen `npm run build` ausführen. Fehlende statische Imports und falsche CSS-Pfade werden vom Vite-Build sofort als Fehler gemeldet.

## Build & Preview

```bash
npm run dev      # Vite Dev-Server (0.0.0.0)
npm run build    # Produktions-Build nach dist/
npm run preview  # Build-Preview
```

Docker: `docker build -t confidaraexpress .` → port 80.

## Aktiver Feature-Branch

Entwicklung läuft auf `claude/fix-booking-back-to-offers`. Nicht auf `main` pushen ohne explizite Freigabe.

## Premium-Versandprozess (Paket B)

Preisrechner, Angebotsvergleich, Neue Sendung und Buchung sind eine
Designwelt auf den Paket-A-Primitives/-Mustern:

- **Buchung läuft in der App-Shell.** `/booking` liegt in derselben
  `DashboardLayout`-Routengruppe wie `/calculator` (nicht mehr unter dem
  öffentlichen `NavbarLayout`) — Route, Buchungslogik und JUMiNGO-Payloads
  sind dabei unverändert geblieben. Seitenkopf kommt aus `ROUTE_HEADERS` in
  `DashboardLayout.jsx` (Eyebrow „Versand").
- **Schrittleiste** (`.steps-bar`/`.step-circle`) ist flach: aktiv = Marken-
  Indigo, erledigt = Success, zukünftig = neutral — kein Verlauf, kein Glow.
- **Zwei Zusammenfassungen, eine Quelle.** Die große Live-Zusammenfassung
  (`BookingLiveSummary`/`.booking-livesum`) **scrollt normal mit**; sobald sie
  oben aus dem Sichtfeld läuft, übernimmt die schmale
  `BookingStickySummary`/`.booking-sticky-layer`. Beide leiten Übergabe,
  Zustellung und den geltenden Preis aus **einem** Modul ab
  (`utils/bookingSummaryView.mjs`) — dort wird nichts gerechnet, sondern nur
  ausgewählt, welcher bereits vorhandene Betrag des Price-View-Models gilt.

  Bis dahin war `.booking-livesum` ab 861 px **selbst** `position: sticky`.
  Weil damit die KARTE klebte und kein deckender Träger, entstanden vier
  sichtbare Fehler: durch die vier abgerundeten Ecken und durch den
  transparenten 20-px-Außenabstand darunter lief der Inhalt offen hindurch
  (dort stand der Kartenkopf von „Ausgewähltes Angebot"), die 87 px hohe Karte
  belegte den Platz dauerhaft, und `z-index: 1` hob sie über den Inhalt, ohne
  ihn abzudecken. **Diese Konstruktion nicht wiederherstellen.**

  Die neue Leiste hat drei Ebenen mit je einer Aufgabe: `.booking-sticky-layer`
  klebt und trägt die Ebene — **ohne eigene Höhe** (`height: 0`), damit kein
  vertikaler Platz verloren geht und das Ein-/Ausblenden keinen Layoutsprung
  erzeugen kann; `.booking-sticky-fill` deckt ab (Seitenfarbe, umschließt die
  Karte vollständig); `.booking-sticky-summary` trägt das Kartenmaterial.
  `pointer-events` schaltet mit: verborgen `none`, sichtbar `auto` — sonst
  ließe sich ein verdecktes Bedienelement blind anklicken.

  Die Sichtbarkeit erkennt ein `IntersectionObserver` auf der großen Leiste —
  **keine Scrollposition, kein Scroll-Handler**. Der Klebeabstand wird am
  echten Layout gemessen (unterhalb 860 px liegt die Leiste unter der sticky
  Topbar der App-Shell) und als `--booking-sticky-top` ans CSS zurückgegeben;
  es steht keine Pixelgrenze im Code. Die Schrittleiste ist bewusst **nicht**
  sticky — es gibt genau einen Klebemechanismus auf der Seite.
- **`.calc-panel`** (Preisrechner, Neue Sendung, alle Buchungsmodule) ist
  jetzt Base Card aus der Foundation — kein Gradient-Kartenkopf mehr.
- **Auswahlkarten** (`.ins-card`, `.labelfmt-card`, Angebotskarten
  `.offer-card`) tragen im ausgewählten Zustand Brand Border + Brand Soft,
  keinen Schatten-Ring mehr.
- **`offerBadges.js`** vergibt „Günstigste"/„Schnellste" nur noch unter
  bereits verfügbaren (`availableForDate !== false`) Angeboten.
- **„Zusätzliche Optionen" sind Progressive Disclosure.** Referenznummer und
  Labelformat zeigen im Grundzustand nur eine Schalterzeile (`<Switch>`); die
  Detailfelder erscheinen erst nach dem Einschalten. Beide Schalter werden beim
  Mount aus der gespeicherten Stellung **oder** aus den vorhandenen Werten
  abgeleitet (Referenz vorhanden → an; Format ≠ A4 → an). Die Wertableitung ist
  dabei die Sicherheitseigenschaft und bleibt bestehen; die Stellung liegt
  zusätzlich **additiv** im Vorgangsschema (`BOOKING_KEYS`), weil der Wert
  „an, aber noch leer" nicht ausdrücken kann — siehe „Zusatzoptionen im
  Entwurf". Die beiden Optionen
  verhalten sich beim Ausschalten **bewusst unterschiedlich**: die
  Referenznummer bleibt im Formular stehen (versehentliches Ausschalten
  vernichtet nichts) und wird nur nicht gebucht — das Labelformat fällt
  wirklich auf `A4` zurück, weil A4 ein aktiv gesendeter Wert ist und sonst
  unsichtbar A6 mitgebucht würde. Gespiegelt wird die Referenz nur bei aktiver
  Option, sonst liefe die Ableitung beim nächsten Mount falsch.
- **Zwei Zusatzempfänger für Versandinformationen.** Dieselbe Schalterzeile
  trägt „Tracking-Link an weitere E-Mail-Adresse senden" und „Versandlabel &
  Tracking-Link an weitere E-Mail-Adresse senden" (Reihenfolge: Referenznummer →
  Tracking → Label+Tracking → Labelformat). Validiert wird **nur die aktive
  Option** — ein ausgeschalteter, evtl. ungültiger Restwert darf die Buchung
  nicht blockieren, weil er auch nicht gesendet wird; Fehler erscheinen erst
  beim Weiterklicken (`emailShowErrors`). Der Payload trägt die **Adresse, nie
  den Schalterzustand**: eine vorhandene Adresse IST die Aktivierung (so der
  Backendvertrag). `BOOKING_KEYS` wurde additiv um `trackingEmail` /
  `labelTrackingEmail` erweitert — **ohne** Versionssprung, damit laufende
  Vorgänge nicht grundlos verworfen werden (ein alter Vorgang liefert
  `undefined` → `""`) — ebenso additiv folgten später die vier
  Schalterstellungen (siehe „Zusatzoptionen im Entwurf"). Das Versenden, die
  Deduplizierung gleicher Adressen und der Label-Anhang passieren serverseitig.

  **Der serverseitige Vertrag im Detail** (Go-Live Paket 3): `/book` prüft beide
  Adressen **vor jedem Providerkontakt** und lehnt mit `400 { error, field }` ab —
  `field` ist `trackingEmail` oder `labelTrackingEmail`. Diesen Fall führt
  `BookingPage` zurück auf Schritt 1 an das betroffene Feld; er darf **nicht** in
  den Adressen-Zweig laufen, der „Preise neu berechnen" verlangt (falsche Ursache,
  wirkungslose Handlung). Die Serverregel ist bewusst **strenger** als
  `shipmentEmailError()` — sie weist zusätzlich Adresslisten (`,;<>`) und
  Steuerzeichen ab —, deshalb ist der Zweig trotz Clientprüfung erreichbar.

  **Die Zustellung ist asynchron und dauerhaft, nicht Teil der Buchungsantwort.**
  Der Server legt beim Buchen einen Zustellauftrag je Adresse an und sendet, sobald
  Trackingnummer beziehungsweise Label vorliegen — was bei Abholsendungen später
  sein kann als die Buchung selbst. Deshalb behauptet die Oberfläche **nirgends**,
  die Zusatzmail sei bereits versendet: die Schalter sagen „senden", der
  Erfolgsbildschirm nennt nur die Buchungsbestätigung an die Kontoadresse. Wer dort
  eine Bestätigung ergänzen will, bräuchte einen kundenseitigen Statusendpunkt —
  den gibt es bewusst nicht (kein Kunden-Resend, siehe Backendvertrag).

  **Gleiche Adresse in beiden Feldern ergibt GENAU EINE Mail** (die stärkere Option
  gewinnt, serverseitig, ohne Rücksicht auf Groß-/Kleinschreibung). Das Frontend
  dedupliziert nicht und darf es nicht: es kennt weder Zustellzustand noch Retry.
- **`/tracking` versteht `?nummer=…`.** Der Trackinglink der Versand-E-Mails
  zeigt auf die eigene öffentliche Seite; ohne diese Auswertung liefe er auf
  eine leere Suchmaske. Genau einmal beim Mount (`ranOnce`), damit ein späteres
  Rendern die Suche des Nutzers nicht überschreibt; ohne Parameter ist die Seite
  unverändert.
- Governance: `src/styles/shippingProcess.test.mjs` (Quelltext, 23 Tests) und
  `tests/e2e/shippingProcessPaketB.test.mjs` (echter Dev-Server) sichern App-
  Shell-Einbindung, Badge-Logik, JUMiNGO-Payload-Felder, Konfliktdialoge,
  Tastaturbedienung sowie das Sticky-Verhalten beider Zusammenfassungen
  (Tests 19–23: große Leiste klebt nicht, Layer ohne Eigenhöhe, deckender
  Träger, umschaltende `pointer-events`, IntersectionObserver statt
  Scrollposition, eine gemeinsame Ableitungsquelle) gegen Regression ab; `progressiveBookingOptions.test.mjs`
  (16 Quelltext- + 15 E2E-Tests) deckt die Zusatzoptionen ab, inklusive der im
  echten `/book`-Request geprüften Payload-Fälle;
  `shipmentEmailOptions.test.mjs` / `sharedShipmentEmailOptions.test.mjs`
  (10 + 14 Quelltext- + 17 E2E-Tests) decken die beiden Zusatzempfänger ab.

## Zusatzoptionen im Entwurf — vor jeder Änderung an den vier Schaltern lesen

Die vier „Zusätzlichen Optionen" (Referenznummer · Tracking-Adresse ·
Label+Tracking-Adresse · Labelformat) überleben jetzt einen gespeicherten
Sendungsentwurf und die Rückkehr aus der Buchung — **1:1, Schalterstellung
inklusive**. Drei belegte Lücken sind damit geschlossen:

| | Vorher | Jetzt |
|---|---|---|
| P2-A | das gebuchte `labelFormat` wurde nirgends festgehalten | `shipments.label_format` (Backend) |
| P2-B | die Schalterstellung war nur abgeleitet — „an, aber leer" ging verloren | additiv in `BOOKING_KEYS` |
| P2-C | „Als Entwurf speichern" speicherte die Optionen nicht; ein Sendungsentwurf war nicht fortsetzbar | `draft_booking_options` + `GET /api/kunde/drafts/:id` |

| Baustein | Datei | Aufgabe |
|---|---|---|
| Übersetzung (rein) | `utils/draftBookingOptions.mjs` | Buchungsseite ↔ Entwurfsform, defensiv |
| Herkunftsnachweis | `utils/formDraftsView.mjs` | `isValidShipmentResumeDraft` · `buildShipmentResumePayload` · `isAnyResumeDraft` |
| Zugriff | `api/client.js` | `getShipmentDraft(id)` · `saveDraft(id, bookingOptions)` |

**Verbindlich:**

- **AUS heißt LEER — und zwar im Erbauer, nicht an der Aufrufstelle.**
  `buildDraftBookingOptions()` erzwingt die Invariante zentral: ein
  ausgeschalteter Schalter speichert **nie** einen Wert (Labelformat: den
  Standard A4). Damit kann ein Entwurfswert nicht unsichtbar wieder wirksam
  werden, und die Adresse eines Dritten liegt nicht auf dem Server, wenn die
  Option aus ist. `draftBookingOptionsToFlow()` verwirft denselben Fall beim
  LESEN ein zweites Mal — ein von Hand veränderter Entwurf bringt einen Wert
  nicht zurück. Wer die Regel an einer Aufrufstelle nachbaut, muss sie an
  jeder künftigen erneut bedenken.
- **Die Schalterstellung liegt ADDITIV im Vorgang, ohne Versionssprung.** Das
  kehrt eine frühere Festlegung um („die Schalter sind reiner UI-Zustand und
  werden ausschließlich abgeleitet"). Gemessen hat die Ableitung einen Fall
  nicht getragen: „Option an, Feld noch leer" und „Option aus" sind am WERT
  nicht unterscheidbar, ebenso „Format ändern an, A4 gewählt". Beim Fortsetzen
  stand der Bereich dann wieder zu, obwohl der Kunde ihn geöffnet hatte.
- **Die Wertableitung bleibt trotzdem stehen — sie ist die Sicherheits­eigenschaft.**
  Der Schalter kommt aus `Stellung === true || vorhandener Wert`, in genau
  dieser Reihenfolge. Eine Und-Verknüpfung oder ein Weglassen des zweiten
  Zweigs würde einen gespeicherten Wert verbergen; ein Vorgang aus einem
  älteren Bundle liefert `undefined` → `false` und verhält sich exakt wie vorher.
- **Die Stellung hat KEINE Buchungswirkung.** Sie steht im Vorgang und im
  Entwurf, aber in keinem `/book`-Payload: gebucht wird eine Adresse
  beziehungsweise ein Wert, nie ein Schalter (unveränderter Backendvertrag —
  eine vorhandene Adresse IST die Aktivierung).
- **Entwurf und Buchung sind zwei Zustände in zwei Spalten.** Der
  Formularschnappschuss liegt serverseitig in `shipments.draft_booking_options`
  (JSONB); was gebucht wurde, steht unverändert in `reference_number`,
  `tracking_email`, `label_tracking_email` und `label_format`. **`/book` liest
  den Entwurfszustand nie** — die Regel „ein deaktivierter Schalter darf
  niemals einen versteckten Wert wirksam werden lassen" ist dadurch strukturell
  und nicht angewiesen.
- **Fortsetzen führt nach „Neue Sendung", nicht in die Buchung.** Ein
  fortgesetzter Entwurf wird **neu berechnet**; der Resume-Payload trägt
  deshalb weder Preis noch Tarif, Carrier, Trackingnummer oder
  Providerreferenz. Ein mitgeführter alter Preis wäre eine Zusage, die niemand
  halten kann.
- **Zwei Herkünfte, EIN Weg ins Formular.** Formularentwurf und
  Sendungsentwurf liefern beide `formData` und laufen durch dasselbe
  `buildResumeInitialState()` — es gibt keinen zweiten Rehydrationsweg und
  keinen zweiten Feldmapper. Unterschiedlich ist nur, was SONST am Entwurf
  hängt: der Formularentwurf trägt Revision und serverseitigen Verbrauch
  (`resumeSourceFromDraft` → calculate-price), der Sendungsentwurf den
  Entwurfszustand der Optionen. `resumeSourceFromDraft` liefert für einen
  Sendungsentwurf deshalb weiterhin `null`; die beiden Validatoren nie
  vertauschen.
- **Die Reihenfolge der beiden Mount-Effekte ist tragend.**
  `clearScope("shipment")` setzt den Buchungsbereich **mit** zurück (ein
  Entwurf ersetzt den Vorgang vollständig). Der Effekt, der
  `setFlowBooking(draftBookingOptionsToFlow(…))` aufruft, steht deshalb
  DANACH — umgekehrt wäre die Wiederherstellung im selben Commit sofort wieder
  weg. Dieselbe Falle wie beim Spiegel-Effekt, eine Ebene weiter.
- **Der Vorgang wird nur bei echtem Inhalt beschrieben**
  (`hasAnyDraftBookingOption`) — ein Entwurf ohne Zusatzoptionen soll den
  laufenden Vorgang nicht mit lauter Standardwerten füllen. „An, aber leer"
  zählt dabei als Inhalt: der Kunde hat den Bereich bewusst geöffnet.
- **Kein neuer Speicherweg im Browser.** Kein `localStorage`, kein
  `sessionStorage`, keine zweite Entwurfsablage — gespeichert wird über den
  vorhandenen Entwurfsendpunkt, gehalten wird im vorhandenen
  `ShippingFlowContext`.
- **Die Fortsetzen-Aktion sieht bei beiden Entwurfsarten gleich aus**
  (`DraftDesktopRow`/`DraftCard` wie `FormDraft*`): sichtbarer Button,
  Löschen bleibt sekundär im Kebab. Der Zweig in `DraftsPage.onResume` hängt
  am `kind`, **nie** an der id — die Namensräume sind getrennt (`form:7` ≠
  `shipment:7`).
- Governance: `src/utils/draftBookingOptionsUx.test.mjs` (28 Tests) und
  `tests/e2e/draftBookingOptions.test.mjs` (7 Browser-Smokes gegen einen echten
  Dev-Server mit gemocktem Backend — **niemals eine echte Bestellung**; zwei
  davon sind gegen eine Mutation des jeweiligen Effekts gegengeprüft).
  Backendseitig `tests/draft-booking-options.test.js` (30 Tests, davon 6 gegen
  echtes PostgreSQL).

## Gutscheincode im Buchungsschritt 2 — vor jeder Änderung daran lesen

Version 1 unterstützt **ausschließlich den offiziellen JUMiNGO-Testgutschein**. Es ist bewusst
KEINE Rabattengine: keine Kampagnen, keine Laufzeiten, keine Stapelung, keine Mehrfachgutscheine
und keine kommerzielle Behandlung anderer Codes.

| Baustein | Datei | Aufgabe |
|---|---|---|
| Auswertung (rein) | `utils/voucherView.mjs` | Zustände, Antwortauswertung, Preiszeilen, Invalidierung |
| Darstellung | `components/booking/VoucherModule.jsx` | Eingabe, Anwenden, Angewendet, Entfernen |
| Preiszeilen | `components/booking/PriceSummaryModule.jsx` | Zwischensumme · Rabatt · Zu zahlen |
| Zugriff | `api/client.js` → `checkVoucher()` | einziger Aufrufpfad zum Preview-Endpunkt |

**Verbindlich:**

- **Das Frontend entscheidet NIE über Gültigkeit oder Höhe.** Es gibt keine Codeliste, keine
  Prozentrechnung und keinen Pfad zu einem 0-Euro-Zustand ohne serverbestätigte Antwort. Der
  Sandboxcode steht in **keiner** Frontenddatei; ein Test prüft das über alle vier beteiligten
  Dateien.
- **Gesendet wird NUR der Code.** Weder `/api/jumingo/cart-total` noch `/book` bekommen Beträge,
  Prozentwerte oder Rabatthöhen — das Backend ignorierte sie ohnehin und prüft unmittelbar vor der
  Bestellung erneut. `price_final` bleibt unverändert das bestehende Drift-Gate (der reguläre
  Anzeigepreis), **nicht** der Rabattwert.
- **0 ist ein gültiger Betrag.** Nirgends darf eine Falsy-Prüfung daraus „fehlt" machen; die
  Auswertung nutzt ausschließlich `Number.isFinite`. Ein bestätigter Gutschein ohne belegten
  `finalGross`/`subtotalGross` gilt als **ungültig** (fail-safe, nicht fail-open).
- **Position:** unter der Preisaufstellung, VOR Bestätigungen und Bestellknopf, innerhalb der
  bestehenden Übersichtskarte — **keine zweite große Karte**. Es werden nur die vorhandenen
  Primitives benutzt (`.field-input`, `.btn`).
- **Ohne Gutschein bleibt die Preisdarstellung exakt wie bisher** (ein Gesamtbetrag). Erst ein
  bestätigter Gutschein ersetzt ihn durch Zwischensumme · Rabatt · „Zu zahlen".
- **Invalidierung folgt einem Fingerabdruck**, nicht einem Effekt je Feld:
  `voucherInvalidationKey()` listet die preisbildenden Größen **vollständig auf**, damit ein neues
  Feld eine bewusste Entscheidung erzwingt. Referenznummer, Labelformat und die informativen
  E-Mail-Optionen stehen bewusst NICHT darin — ein überschießender Verfall wäre genauso störend
  wie ein fehlender.
- **Während der Prüfung ist die Bestellung gesperrt** (`doBook`-Guard UND deaktivierter Knopf) —
  in diesem Moment steht der anzuzeigende Betrag nicht fest.
- **Ein bestätigter Gutschein zeigt den Testlabel-Hinweis.** Eine Sandbox-Testbuchung erzeugt laut
  Guide ein TESTLABEL, das nicht für reale Pakete taugt; das darf die Oberfläche nicht verschweigen.
- **Zwei getrennte Fehlertexte:** „nicht anwendbar" (erneuter Versuch hilft nicht) und
  „gerade nicht prüfbar" (technisch, erneut versuchen). Beide nennen keine Interna — kein
  Providername, kein Status, kein Tarif, keine Rolle. Alle Ablehnungsgründe sind für den Kunden
  ununterscheidbar.
- **Es gibt keine kontoindividuelle Testfreigabe mehr.** Die Adminsektion
  „Testbuchungen freischalten" (`TestBookingSection`, `utils/adminTestBooking.mjs`,
  `setAdminUserTestBooking`) ist ersatzlos entfernt. Serverseitig entscheidet der globale
  Pre-Live-Schalter `JUMINGO_SANDBOX_ENABLED` zusammen mit der Authentifizierung; Rolle und
  `users.test_booking_enabled` haben keine Autorität mehr. Eine Adminsteuerung, die einen
  wirkungslosen Wert schreibt, wäre eine tote Steuerung — deshalb keine Restanzeige. Der
  Schalter ist eine SERVERkonfiguration und steht in keiner Frontenddatei;
  `prelivesandboxUi.test.mjs` prüft beides.
- **Der Gutschein gehört NICHT in `form_drafts` oder den Vorgang.** Ein Formularentwurf existiert
  vor Tarif und Checkout; `shippingFlowState.mjs` und der Entwurfs-Snapshot kennen ihn nicht.
- Governance: `src/utils/voucherUx.test.mjs` (30 Tests) und
  `tests/e2e/voucherCheckout.test.mjs` (8 Browser-Smokes gegen einen echten Dev-Server mit
  gemocktem Backend — **niemals eine echte Bestellung**).

## Verwaltung und Abrechnung (Paket C)

Sendungen, Sendungsdetails, Entwürfe, Tracking (intern + öffentlich),
Adressbuch, Rechnungen und die PDF-Vorschau laufen auf denselben Primitives
und Mustern. Business-, API-, Status- und Routinglogik blieben unangetastet.

- **Ein Seitenrahmen für alle.** Entwürfe und Adressbuch laufen jetzt durch
  `.page-body` statt durch einen eigenen `.container`-Wrapper; Seitenkopf und
  Inhalt sind dadurch pixelgleich breit. Die beiden Seiten bringen ihren
  `<PageHeader>` selbst mit — `DashboardPage` wickelt sie deshalb NICHT
  zusätzlich in `.page-body` (sonst doppelter Rahmen). Eyebrow überall
  „Verwaltung"; `TrackingPage` bleibt bewusst ohne PageHeader (sie rendert
  ihre Überschrift selbst, sonst doppelter Kopf).
- **Destruktive Aktionen sind sekundär.** Löschen ist in Entwürfen kein
  dauerhaft sichtbarer roter Button mehr, sondern läuft über ein Kebab-Menü
  (`DraftActionsMenu`, gleiches Muster wie `AddressActionsMenu`). „Fortsetzen"
  bleibt als häufigere, wertschöpfende Aktion direkt sichtbar.
- **Tracking-Timeline ist flach.** `.track-dot` trägt keinen Verlauf und
  keinen farbigen Schatten mehr; die Punkte zeigen echte Icons statt der
  Rohzeichen „●"/„✓".
- **Adressbuch-Badges sind auf drei gedeckelt.** `addressBadgeList()`
  (`addressBookView.mjs`, rein und getestet) fasst „Standard-Absender" und
  „Standard-Empfänger" bei Rolle „Beides" zu EINEM Badge zusammen — die
  zugrunde liegenden Flags bleiben unverändert, nur die Darstellung.
- **`dtDE()` zeigt keine Sekunden mehr.** Der Zeitpunkt bleibt identisch, nur
  die Formatierung ist ruhiger (betrifft alle vier Entwurfs-Zeitstempel).
- **Skeletons pulsieren einheitlich.** Die bereichseigenen Shimmer-Keyframes
  von Entwürfen und Adressbuch sind entfallen; beide nutzen jetzt
  `ce-skeleton-pulse` aus `patterns.css`. Die Adressbuchsuche ersetzt eine
  bereits sichtbare Liste NICHT mehr durch ein Skeleton.
- **`.inv-status` bleibt bewusst außerhalb von `.badge`** (dokumentierte
  Entscheidung aus Phase 5, siehe `customerInvoiceView.mjs`). Nur die
  doppelt gepflegten Hex-Werte verweisen jetzt auf die Foundation-Tokens.
- **PDF-Vorschau nutzt die gemeinsame XL-Dialogbreite** (`--ce-size-dialog-xl`)
  und Foundation-Material; ihre Fokusfalle bleibt hand-gerollt, weil sie den
  `iframe` einschließen muss, den `useDialog`s Selektor nicht kennt.
- Governance: `src/styles/managementBilling.test.mjs` (Quelltext, 23 Tests) und
  `tests/e2e/managementBillingPaketC.test.mjs` (echter Dev-Server, 5 Tests).

## Übersicht, Konto und Kommunikation (Paket D)

Die Übersicht ist eine **operative Arbeitsfläche**, kein Produktprospekt mehr.
Profil, Support und Benachrichtigungen laufen auf denselben Primitives und
Mustern. Business-, API-, Status- und Routinglogik blieben unangetastet.

- **Zwei Zustände, eine Seite.** `hasOperationalData()` (`utils/overviewModules.mjs`)
  entscheidet: Hat das Konto Sendungen oder Rechnungen, zeigt die Übersicht
  letzte Sendungen, offene Rechnungen und Benachrichtigungen — „01 Ablauf",
  „02 Vorteile" und der Trust-Block erscheinen dann NICHT. Ein leeres Konto
  bekommt genau umgekehrt das Onboarding. Das **Carrier-Netzwerk bleibt in
  beiden Zuständen** (Markenfläche). Solange nichts geladen ist, gilt das
  Konto als operativ — sonst blitzt beim ersten Rendern das Onboarding auf.
- **Die frühere Schnellaktionen-Sektion ist ersatzlos entfernt** (fünf Karten:
  Neue Sendung, Versand berechnen, Sendungen ansehen, Rechnungen ansehen,
  Supportanfrage erstellen). Dieselben fünf Ziele stehen bereits dauerhaft in
  der Sidebar — eine zweite Verlinkung auf der Übersicht war redundant. Kein
  Platzhalter, kein Ersatzblock: Auf die KPI-Karten folgt jetzt direkt „Letzte
  Sendungen"; der Abstand dorthin trägt bewusst den Sektionsrhythmus von
  `.pp-sec` (64px), nicht den kleineren 34-px-Rhythmus der übrigen Modulfolge
  (siehe `.ov-mod-grid > .ov-mod` in `overview.css`).
- **Nur vorhandene Daten und Ziele.** Die Module rufen KEINE API und
  navigieren nicht selbst: `shipments`/`invoices`/`invoiceSummary` reicht
  `DashboardPage` bereits herein, Benachrichtigungen kommen aus dem
  bestehenden `NotificationsProvider` (ein Takt, ein Zustand), Ziele laufen
  über `navigateTo`/`navigate`. Der frühere Kopfzeilen-CTA „Neue Sendung"
  (`.pp-cta`) ist entfallen — dasselbe Ziel bleibt über die Sidebar
  erreichbar.
- **Eine Initialenquelle.** `utils/accountIdentity.mjs` (`accountInitials` /
  `accountDisplayName`) speiste zu Paket-D-Zeiten Sidebar, Benutzerchip UND
  Profilhero. Die fest verdrahtete Marke „CE" im Profil ist weg: ein Konto
  „Muster GmbH" trug dort ein „CE" und in der Sidebar ein „M". Bewusst EIN
  Buchstabe — zwei Initialen aus „Muster GmbH" ergäben „MG", also die
  Rechtsform als zweite Stelle. Die Sidebar zeigt seit der Entfernung der
  Firmenkarte keine Initiale mehr; Benutzerchip und Profilhero bleiben die
  zwei verbliebenen Aufrufer.
- **Der Passwortbereich ist geschlossen**, bis der Nutzer ihn öffnet; Abbrechen
  stellt den Zustand wieder her, die Erfolgsmeldung bleibt als Quittung stehen.
  Felder, Regeln und der bewusste Verzicht auf `auth: true` (401 = falsches
  Passwort, nicht Session-Ende) sind unverändert.
- **Supportkategorien erscheinen nie roh.** `supportCategoryDisplay()` gibt
  `[Text, Rohwert]` zurück — dieselbe Regel wie `statusFallback()` für Status;
  vorher stand ein unbekannter Backendwert („shipping") mitten im Satz.
- **Das Panel verliert bei einem Ladefehler nichts.** Bereits geladene
  Meldungen bleiben stehen, der Fehler steht als schmale Zeile darüber; nur
  ohne Inhalt füllt er die Fläche. Erstes Laden zeigt ein Skeleton.
  Gelesen-/Ungelesen-Logik, Badge-Zählung und Kontextaktionen sind unverändert.
  **Kein „Alle anzeigen"** — es gibt keine Benachrichtigungsseite, also wird
  auch kein Ziel behauptet.
- Governance: `src/styles/dashboardAccountCommunication.test.mjs` (Quelltext,
  26 Tests), `src/utils/overviewModules.test.mjs`, `src/utils/accountIdentity.test.mjs`
  und `tests/e2e/dashboardAccountPaketD.test.mjs` (echter Dev-Server, 7 Tests).

Bewusst zurückgestellt: eine Empfänger-/Zielspalte in „Letzte Sendungen" —
`GET /kunde/shipments` führt keine Empfängerdaten (die Sendungsliste selbst
zeigt dort ebenfalls keine). Ebenso der „Antwortstatus" der Supportliste: die
Kundenantwort kennt kein solches Feld. Beides würde neue Backenddaten brauchen.

## Bestandsseite und Kennzahlenausrichtung

- **`.ce-num` markiert eine TABELLENSPALTE — sonst nichts.** Das Primitive
  bringt `text-align: right` mit (primitives.css). Auf einem frei stehenden
  Element in einer Karte richtete es jeden Wert an der rechten Kante seiner
  Zelle aus, während die Beschriftung links stand: die fünf Kennzahlen der
  Artikeldetailseite standen dadurch 81 bis 194 px von ihrer eigenen
  Beschriftung entfernt, und der Versatz änderte sich mit der Fensterbreite.
  Betroffen waren ebenso die Kennzahlkarten der Lagerübersicht und die
  Kartenfakten aller vier Listen. Wo Beschriftung und Wert UNTEREINANDER
  stehen, trägt die Zahl deshalb kein `.ce-num`; die tabellarischen Ziffern
  kommen aus der jeweiligen Blockklasse.
- **Die Kennzahlen teilen sich zwei Zeilenspuren** (`grid-template-rows:
  subgrid` auf `.inv-detail-stock > div`, als `@supports`-Stufe über der
  Flexspalte). Damit hängt die Wertposition an der Rasterspur, nicht an der
  Textlänge — eine zweizeilige Beschriftung schiebt nicht mehr nur IHREN Wert
  nach unten. Kein Ausgleich je einzelner Kennzahl.
- **Korrekturgrund statt Ja/Nein.** Die Frage „Fehlmenge ist Bruch oder
  Schwund" ist ein Auswahlfeld geworden (Inventurdifferenz · Beschädigung ·
  Schwund · Sonstiges). Der Grund wird serverseitig als eigenes Feld der
  Bewegung gespeichert (`inventory_movements.reason`), **nicht** im Notiztext.
  Der Bewegungstyp bleibt die führende Angabe und ändert sich nicht: die
  Verlustgründe buchen weiter DAMAGE, die übrigen ADJUSTMENT_OUT/-IN. Das alte
  Feld `damage` bleibt backendseitig gültig, weil gehashte Bundles mit
  `immutable` ausgeliefert werden.
- **Vorschauen sind Darstellung, keine Autorität.** `receiptPreview()` und
  `adjustmentPreview()` (`utils/inventoryView.mjs`) sagen, was der eingetippte
  Wert bedeutet. Gesendet wird unverändert der GEZÄHLTE Bestand, nie ein selbst
  gerechnetes Delta. Eine Vorschau erscheint **nur bei belastbarer Grundlage**:
  aus der Bestandszeile (genau ein Paar Artikel/Lager) oder bei genau einem
  Lager — die Artikelsuche liefert `SUM(on_hand)` über alle Lager und taugt
  sonst nicht als Ausgangswert.
- **Drei Zeilenaktionen passen nicht nebeneinander.** Knöpfe für Einbuchen,
  Korrigieren und Sperren messen zusammen 336 px; die Aktionsspalte bekommt
  selbst auf 1920 px nur 271 px. Sichtbar bleibt „Einbuchen", der Rest steht im
  Zeilenmenü (`RowActionsMenu`, gleiches Muster wie `AddressActionsMenu`:
  Fokusfalle nach außen, Escape, und Fokusrückgabe an den Auslöser VOR der
  Aktion). Das Bündel aus Knopf und Kebab trägt `.inv-row-actions--tight`
  (`flex-wrap: nowrap`): mit Umbruch meldete es als Mindestbreite nur den
  breitesten Knopf, und die Tabelle gab ihm 131 statt der nötigen 132 px.
- **Zwei behobene Altlasten aus derselben Ecke:** `.ce-page-header-actions` hielt
  über `flex-shrink: 0` seine max-content-Breite und brach deshalb nie um — zwei
  Kopfaktionen ragten auf 390 px um 46 px aus dem Bild, kaschiert von
  `body { overflow-x: hidden }` (jetzt `max-width: 100%`). Und `.inv-card-title`
  ist ein `.btn`: dessen `white-space: nowrap` verhinderte den Umbruch langer
  Artikelnamen, dessen Flexzentrierung stellte kurze Namen mittig — beides
  gezielt aufgehoben.
- Governance: `src/utils/stockPageUx.test.mjs` (32 Tests) und backendseitig
  `tests/inventory-adjustment-reasons.test.js` (22 Tests).

## „Auftrag erstellen" — vor jeder Änderung am Auftragsdialog lesen

Ein Auftrag reserviert Bestand. Mehr nicht: der Dialog berechnet **keine**
Carrierquote, erzeugt **keine** Sendung, bucht **kein** Label und verlangt
**keine** Paketmaße. Er bleibt ein einziger Schritt in drei Abschnitten
(Empfänger → Positionen → Zusatzangaben) — kein Wizard.

- **Pflichtfelder kommen exakt vom Backend**, nicht aus Gewohnheit.
  `validateRecipient()` (`routes/orders.js`) verlangt `fullName`,
  `streetAndNumber`, `city`, `country` — sonst nichts. **Die PLZ steht bewusst
  nicht darunter**: sie läuft über `validatePostalCode(country, …)` und ist damit
  landesabhängig. Das Formular trug zuvor unbedingt „PLZ *" und lehnte eine leere
  Eingabe immer ab; für Länder ohne Postleitzahlsystem (IE, AE, HK …) war das ein
  erfundener Stern vor einer gültigen Adresse. Feldlängen spiegeln
  `RECIPIENT_LIMITS` 1:1 (`ORDER_RECIPIENT_LIMITS`).
- **Das Adressbuch wird benutzt, nicht nachgebaut.** Die Auswahl liest den
  bestehenden Endpunkt über `getAddresses()` mit dem vorhandenen Reiterbegriff
  `TAB_RECIPIENT` (serverseitig „recipient ODER both"). Die Feldauslegung steht
  als `mapAddressToOrderRecipient()` **neben** `mapAddressToShipmentFormPatch()`
  in `addressBookView.mjs` — eine Stelle, an der Adressbuchfelder ausgelegt
  werden. Die Bauteile der Adressbuchseite (Reiter, Favoriten, Standardflags,
  Verwaltungsmenü) sind bewusst NICHT übernommen. Das Auswahlbauteil selbst ist
  inzwischen **verallgemeinert** (`components/addressbook/AddressPicker`, Reiter
  als Prop) und wird von diesem Dialog **und** „Neue Sendung" genutzt; sein
  Material heißt seitdem `.abk-pick*` und steht in `addressbook.css` statt in
  `inventory.css` — dieselben Werte wie vorher, nur nicht mehr im Bereichs-
  Stylesheet des Lagers. Der Dialog klappt die Auswahl unverändert **in-flow**
  auf; die schwebende Fassung gehört zur Überschriftszeile langer Formulare
  (siehe „Adressbuchauswahl im Versandformular").
- **Die Übernahme ist eine Vorbelegung und lässt danach los.** Gesetzt wird
  ausschließlich im Klickhandler, nie in einem Effekt: wer nach der Übernahme die
  Straße korrigiert, behält seine Korrektur. Es entsteht keine Referenz auf die
  Adressbuchzeile (der Auftrag speichert einen Snapshot) und **nichts wird
  zurückgeschrieben**.
- **Das Land zeigt „Deutschland" und sendet `DE`** — dieselbe Liste
  (`utils/countries.js`) wie das Versandformular, keine zweite Länderquelle. Das
  frühere zweistellige Freitextfeld ist entfallen.
- **Vorschau ist Darstellung, Sperre ist Bedienhilfe.** `reservationPreview()`
  sagt, was die eingetippte Menge bindet und was danach übrig bleibt; bei
  Überschreitung wird **keine negative Restmenge** behauptet, dort steht
  „Nur 17 Einheiten verfügbar." Der Absendeknopf sperrt erst nach dem ersten
  Absendeversuch und nur bei einem Fehler, den der Nutzer sieht. Ohne bekannten
  Bestand wird **nicht** gesperrt (fail-open). Das ist ausdrücklich **keine
  Race-Condition-Absicherung** — die bleibt vollständig serverseitig und atomar.
  `available` wird nie selbst gerechnet, sondern gelesen.
- **Doppelte Artikel entstehen gar nicht erst.** Ein bereits enthaltener Artikel
  wird in der Auswahlliste als „bereits im Auftrag" markiert; ein Klick führt zur
  vorhandenen Position und fokussiert deren Mengenfeld. Das frühere stille
  Hochzählen um 1 sah für den Nutzer aus, als sei nichts passiert. Backendseitig
  wurde dafür **nichts** ergänzt — der Server fasst gleiche Artikel weiterhin
  zusammen (UNIQUE `order_id`/`product_id`).
- **Eine Erklärung, an der richtigen Stelle.** „Was passiert mit dem Bestand?"
  (`STOCK_EXPLANATION`) steht unter den Positionen und ersetzt den früheren
  Fußzeilensatz unter den Buttons. Kein Lagerfachjargon („Allocation",
  „Commitment", „Fulfillment Reservation").
- **Nach Erfolg geht es auf die Auftragsdetailseite**, nicht in den
  Versandprozess. Dort steht der Auftrag vollständig, und „Versand vorbereiten"
  wartet — ausgelöst wird es von niemandem ungefragt.
- **`INSUFFICIENT_STOCK` benennt den Artikel und zieht die Zahlen nach.** Der
  Server liefert `details.productId` mit (`inventory.reserve`); daraus entsteht
  die Meldung, ohne zu raten. Die **Mengen bleiben unverändert** — automatisch
  etwas anderes zu bestellen, als der Nutzer eingetragen hat, wäre keine Hilfe.
- Bewusst unangetastet: atomare Reservierung, `inventory_reservations`,
  Auftragsstatus, Sendungsverbrauch, gesperrter Bestand, Provider-Buchung. **Das
  Backend wurde für dieses Paket nicht geändert.**
- Governance: `src/utils/orderCreateUx.test.mjs` (69 Tests — Pflichtfeldparität,
  landesabhängige PLZ, Adressbuchmapper ohne fremde Felder, Vorbelegung ohne
  Nachsynchronisierung, Vorschau- und Mengenregeln, Doppelartikel, Erklärblock,
  Zusatzangaben, Zielnavigation, Bestandskonflikt, Foundation-Konformität).

## Bewegungen — vor jeder Änderung an der Bestands-Historie lesen

Die Seite erzeugt keine Funktionen, sie erklärt vorhandene Daten. Jede Zeile
beantwortet acht Fragen: was (Artikel) · wann · warum (Typ + Grund + Notiz) ·
wie viel (Menge mit Vorzeichen) · was blieb (Bestand danach) · wo (Lager) ·
wodurch (Referenz) · wer (erfassendes Konto).

- **Nur tatsächlich erzeugbare Typen im Filter.** `insertMovement()` ist der
  einzige Schreiber und wird nur aus `goodsIn` (RECEIPT), `consume` (SHIPMENT)
  und der Korrekturaktion (ADJUSTMENT_IN/-OUT/DAMAGE) aufgerufen. `RETURN`,
  `TRANSFER_IN` und `TRANSFER_OUT` sind benannt und per CHECK erlaubt, aber kein
  Codepfad schreibt sie — sie stehen deshalb **nicht** im sichtbaren Filter
  (`PRODUCIBLE_MOVEMENT_TYPES`). Eine Filteroption mit garantiert null Treffern
  behauptet eine Funktion, die es nicht gibt.
- **Altdaten werden nicht versteckt.** `movementTypeOptions(items)` ergänzt jeden
  Typ, der in den geladenen Zeilen vorkommt. Die Beschriftung aller acht Typen
  bleibt in `MOVEMENT_LABELS` — eine vorhandene Zeile heißt nie „Unbekannter
  Status". Kommt ein Retouren- oder Umlagerungsvorgang, wandert sein Typ in
  `PRODUCIBLE_MOVEMENT_TYPES`.
- **Grund und Notiz sind zwei Dinge.** `reason` ist die strukturierte Ursache
  einer Korrektur, `note` freier Text (bis 500 Zeichen). Beide stehen als
  Unterzeile am Typ — der Grund schlicht, die Notiz mit dem Präfix „Notiz:".
  Bis zu diesem Paket fiel `note` in die REFERENZSPALTE: eine freie Notiz wurde
  als Referenz ausgegeben. Fehlt eines von beiden, entsteht keine leere Zeile.
  Kein Grund wird je aus Typ oder Menge abgeleitet.
- **Referenzen zeigen die kundenseitige Nummer, nie die interne ID.**
  `reference_id` ist eine Zeilen-ID und für einen Kunden bedeutungslos. Der
  Endpunkt liefert additiv `referenceNumber` (CE-Bestellnummer beziehungsweise
  CE-AU…-Auftragsnummer), aufgelöst über zwei **mandantengebundene** Joins
  (`user_id = m.user_id`). Fehlt die Nummer, steht dort nur „Sendung" — nie die
  ID, nie eine Providerreferenz.
- **Verlinkt wird nur, wo es eine Zielseite gibt.** Ein Auftrag hat
  `/inventory/orders/:id`. Für Sendungen gibt es **keine** kundenseitige
  Detailroute und die Sendungsliste kennt keinen Filter — die Sendungsnummer
  bleibt deshalb Text. Ein Link auf eine ungefilterte Liste wäre ein
  Versprechen, das die Seite nicht hält.
- **„Erfasst durch", nicht „Benutzer".** Das Backend liefert
  `COALESCE(company_name, name, email)` des erfassenden Kontos, und
  ConfidaraExpress kennt je Firma genau einen Zugang — es gibt kein
  Mitarbeitermodell. Dort steht das Konto, nicht eine handelnde Person. Für
  diese Spalte wurde **keine** Benutzer-/Rollenarchitektur gebaut.
- **Der Artikelfilter ist jetzt sichtbar bedienbar.** `ProductFilterField`
  (`InventoryShared.jsx`) nutzt dieselbe Artikelsuche wie der `ProductPicker`
  (`getProducts` mit `q`) — eine Suche, zwei Darstellungen. Der Endpunkt filtert
  über `productId`, deshalb wird ein konkreter Artikel ausgewählt und nicht frei
  getextet. Alle vier Filter (Artikel · Typ · Von · Bis) wirken gemeinsam.
- **Der Startfilter eines Deep-Links entsteht beim ERSTEN Rendern**
  (`waehleStartfilter` in `DashboardPage.jsx`), genau wie der Bereich
  (`waehleStartbereich`). Vorher stand er nur im Effekt — und die Zielseite ist
  lazy geladen: bei kaltem Chunk hängt sie beim ersten Rendern, der Effekt läuft,
  der Filter kommt an; bei **warmem** Chunk mountet sie sofort, vor dem Effekt,
  und startete ungefiltert. Gemessen: derselbe Deep-Link
  (`?page=movements&product=…`) filterte beim ersten Aufruf und beim zweiten
  nicht mehr. Der Effekt setzt den Filter deshalb **nur noch bei einer späteren
  Adressänderung** (`location.search !== startSuche.current`) — sonst holte er
  ihn zurück, nachdem die Zielseite ihn bereits verbraucht hat.
- Bewusst unangetastet: `on_hand`/`reserved`/`blocked`/`available`, die
  Bewegungserzeugung, Wareneingang, Korrekturtransaktionen, Versandverbrauch,
  Aufträge und die Race-Condition-Absicherung. Der **Sperrbestand
  (`inventory_blocks`) bleibt ein eigenes Ledger** und wird nicht in diese Liste
  gemischt. Bewegungen sind append-only: keine Bearbeiten-, keine Löschaktion.
- Governance: `src/utils/movementsUx.test.mjs` (47 Tests) und backendseitig
  `tests/inventory-movement-references.test.js` (13 Tests, echte Route gegen eine
  echte Datenbank — inklusive Mandantentrennung der Referenzauflösung).

## Premium-Adminportal (Paket E)

Das Adminportal ist **keine eigene Designwelt mehr**. Shell, Navigation,
Übersicht, alle Listen, alle Detailseiten, Dialoge und Zustände laufen auf
denselben Foundations wie das Kundenportal. Erhalten bleibt die **Admin-Dichte**:
kompaktere Abstände, kleinere Bedienhöhen, mehr Information je Fläche.
API-Verträge, Berechtigungen, Freischaltungs-, Sperr-, Aufschlags-, Rechnungs-,
Storno-, Support-, Audit- und Backfill-Logik sind unangetastet.

- **Ein Grund, zwei Sidebars.** `.adm-shell` trägt dieselbe Ivory-Rampe wie
  `.app-shell` (`--ce-app-bg-*`). Die Adminnavigation bleibt bewusst **hell**,
  damit der Bereichswechsel sichtbar ist — Deep Navy (`--ce-sidebar-*`)
  gehört weiter allein dem Kundenportal. Der aktive Eintrag ist mehrfach
  codiert: Brand-Soft-Fläche + Brand-Kante + Indigo-`inset`-Akzentkante +
  Schriftschnitt. Die Marke wird nicht mehr nachgebaut: die Sidebar zeigt
  `mark-primary.svg`, dieselbe Bildmarke wie das Kundenportal.
- **admin.css hat keine eigenen Farben.** Null Hex-/rgba-Literale, keine
  Legacy-Aliase (`--blue2`, `--navy`, `--gray50`, `--radius` …), jeder Radius
  aus `--ce-radius-*`, jede Tiefe aus `--ce-elevation-*`. Die sieben früheren
  Hinweisflächen (`.adm-pii-warn`, `.adm-scope-note`, `.adm-conflict`,
  `.adm-b2b-warn`, `.adm-overdue-note`, `.adm-nonproductive-note`,
  `.adm-markup-note`) sind **ein** Streifen `.adm-note` mit Farbrollen; die
  historischen Klassennamen bleiben gültig.
- **Ein Seitenkopf je Seite.** Alle 13 Adminseiten nutzen
  `<PageHeader variant="admin">` — auch die Detailseiten, deren eigener
  Kartenkopf entfallen ist. Der Zurück-Link steht im Kopf (`backLink`),
  `.adm-back` teilt die Regel mit `.ce-page-header-back`.
- **Genau eine Stelle je Aktion.** „Aktuelles Kundenkonto öffnen"
  (Rechnungsdetail) und „Kunde öffnen" (Sendungsdetail) standen doppelt — im
  Seitenkopf UND in der zugehörigen Karte. Sie leben jetzt nur noch in der
  Karte, direkt neben den Daten, die sie öffnen.
- **Drei Gefahrstufen statt zwei.** Alltäglich (Primary) · **unumkehrbar**
  (`irreversible` → Warnrolle, `.adm-irreversible-action`) · **gefährlich**
  (`danger` → `.adm-btn-danger`). „Als bezahlt markieren" ist unumkehrbar, nicht
  zerstörend — deshalb bewusst **kein** roter Button, aber auch keine normale
  Primäraktion mehr. Jede der drei Stufen läuft über `ConfirmDialog`.
- **Alle Admin-Dialoge auf dem globalen System.** Die beiden letzten
  handgebauten Dialoge (Label-Download im Sendungsdetail, Backfill-Bestätigung)
  hatten **weder Fokusfalle noch Fokusrückgabe noch Escape**; sie nutzen jetzt
  `ConfirmDialog`. Der Wortlaut ist unverändert.
- **Deutsche Datumseingabe.** `components/admin/DateField.jsx`: ein leeres,
  unfokussiertes `<input type="date">` blendet seinen nativen Formathinweis aus
  (der folgt der **Browsersprache**, nicht dem `lang` des Dokuments — auf einem
  englischen Browser stand dort „mm/dd/yyyy") und zeigt „TT.MM.JJJJ". Beim
  Fokussieren übernimmt sofort wieder die native Bedienung. Der Feldwert bleibt
  ISO, der Backendvertrag unberührt.
- **Die Kundensuche bleibt ehrlich.** Sie durchsucht weiterhin **nur die
  geladene Seite** (`GET /admin/users` kennt keine Serverfilter) und sagt das:
  Label „Diese Seite durchsuchen", Hinweis mit der Zahl der geladenen Einträge.
- **Kennzahlen ohne Erfindung.** Die Adminübersicht liest ausschließlich den
  `pagination.total` bereits vorhandener Listen-Endpunkte (mit `pageSize: 1`).
  Fehlt der Zähler, steht dort „—" und „Anzahl nicht verfügbar" — nie eine aus
  der Seitengröße hochgerechnete Zahl. `utils/adminOverview.mjs` hält auch die
  bis dahin sechsfach duplizierten `selectTotal`/`selectHasMore`.
- **Touch und Dichte gleichzeitig.** Auf Zeigergeräten bleiben Buttons bei
  32/40 px und Eingaben bei 36 px (Admin-Dichte). Unter 900 px wächst **jedes**
  Bedienelement auf 44 px (WCAG 2.5.5). Textlinks in Fließtext und Tabellen
  bleiben ausgenommen (Inline-Ausnahme).
- **Behobene Altlasten.** Fünf `<h2 className="adm-card-title">` der
  Supportdetailseite zeigten auf eine **nirgends definierte** Klasse — die
  Überschriften fielen auf die Browservorgabe zurück und sprengten ihre Karten,
  die ohne `.adm-card-body` randlos waren. Ebenso las `support.css` eine
  `--adm-*`-Tokenfamilie, die **nie definiert** war. Und ein Menüeintrag im
  Kunden-Kebab gab den Fokus nicht zurück, weil er beim Öffnen des Dialogs
  selbst verschwand.
- Governance: `src/styles/premiumAdmin.test.mjs` (Quelltext, 21 Tests) und
  `tests/e2e/premiumAdminPaketE.test.mjs` (echter Dev-Server, 8 Tests).

Bewusst zurückgestellt: die Kennzahl „offene Freischaltungen". `GET /admin/users`
kennt laut Backendvertrag keinen Statusfilter (`USER_PARAMS = limit/offset`) —
die Zahl ließe sich nur aus der geladenen Seite hochrechnen. Sie braucht einen
serverseitigen Filter. Die damals zurückgestellte Fokusrückgabe-Lücke in
`AddressActionsMenu`/`DraftActionsMenu` ist mit dem Abschlusspaket geschlossen.

## Abschluss: Designsystem-Audit und Legacy-Bereinigung

Die Pakete A–E haben das System aufgebaut; dieses Paket räumt auf, was dabei
liegen geblieben ist, und schließt die letzten belegten Lücken. **Kein
Business-, API-, Routing-, Berechtigungs- oder Datenverhalten wurde berührt.**

- **Ein Blau.** `#1d4ed8`/`#3b82f6` (Legacy) sind aus allen Stylesheets
  verschwunden; die fünf frei gewählten Kantendeckkräfte laufen jetzt über
  `--ce-color-brand-border` (0,28) und `--ce-color-brand-border-soft` (0,16).
- **Tiefe steht nur noch in `variables.css`.** Keine Regel schreibt einen
  Schattenwert selbst — außer `auth.css` (Glaswelt). Der letzte freie Schatten
  (`.pw-slider-rail`) ist `--ce-elevation-inset` geworden. Der einzige farbige
  Glow des Systems bleibt `--auth-blue-glow`.
- **21 tote Tokens und 72 tote Regeln sind entfernt**, jede mit Nachweis: der
  Referenzzähler ignoriert Tests, damit eine Testerwartung keine produktiv tote
  Variable am Leben hält. Libre Franklin ist als Familie vollständig weg —
  keine `@font-face`-Regel, keine Datei. Geladen werden genau zwei Familien.
- **`lucide-react` ist entfernt** (Dependency + Lockfile). Es war seit
  `Icon.jsx` ungenutzt und durch drei Tests bereits verboten.
- **Keine Emojis mehr als Zustandsfläche.** 🔑/🔒/✅/⚠️ in
  `ForgotPasswordForm`, `ResetPasswordForm` und `EmailChangeConfirmPage` sind
  Icons aus `Icon.jsx` geworden (`.auth-card-icon` trägt sie jetzt als Flex-
  Fläche statt als 38-px-Schriftgröße).
- **Trefferflächen unter 860 px.** Was Paket E für das Adminportal getan hat,
  gilt jetzt auch für Kundenportal, öffentliche Navigation und Auth-Bereich:
  jedes Bedienelement erreicht 44 px. Zwei Fallen dabei, beide gemessen:
  `.pp-side .nitem` muss höher spezifisch sein als die Stauchung kurzer
  Viewports (`dashboard-premium.css`, `max-height: 940px`), und der Anker der
  Inhaltsflächen ist `.main-content`, **nicht** `.page-body` (Entwürfe und
  Adressbuch laufen nicht durch `.page-body`). Ausgenommen bleibt
  `.auth-field-link` — Inline-Ausnahme von WCAG 2.5.5/2.5.8.
- **Fokusrückgabe vollständig.** Alle drei Kebab-Menüs geben den Fokus ZUERST
  an ihren Auslöser zurück und lösen DANN die Aktion aus.
- Governance: `src/styles/designSystemClosure.test.mjs` (Quelltext, 12 Tests —
  eine Markenfarbe · kein toter Alias · keine undefinierte Variable · kein
  freier Schatten · ein Overlayton · zwei Schriftfamilien · keine ungenutzte
  Abhängigkeit · keine Emojis · beschriftete Tabellen · Fokusrückgabe ·
  unveränderter Routen- und `page`-State-Bestand) und
  `tests/e2e/designSystemClosure.test.mjs` (echter Dev-Server, 5 Tests).

**Kein Lint-Skript.** Das Repo hat `dev`, `build`, `preview`, `test`,
`test:e2e` — mehr nicht. Das ist der Bestand, kein Versehen; es wurde bewusst
keines erfunden.

Bewusst nicht angefasst: die Glasflächen des Auth-Bereichs (eigene Welt, eigene
Tokenfamilie), das Eigenmaterial der Übersicht (`--ce-kpi-*`, `--ce-flow-*`,
`--ce-bento-*`, `--ce-net-*`) und das Sidebar-Chrome — alle drei sind gemessen,
dokumentiert und durch eigene Tests gedeckt.

## Markenintegration Web (Branding-Paket 1)

**Alles kommt aus einer Datei:** `src/assets/brand/confidara-master.svg` ist die
geometrische Source of Truth (viewBox 1254², zwei Compound-Paths, 57 Subpaths).
Sie wird von **keiner Komponente importiert** — sie ist reine Quelle und landet
nicht im Bundle.

Aus ihr sind sechs Produktassets abgeleitet, durch **Subpath-Filterung**: die
Pfadstrings sind wörtlich übernommen, angepasst wurde ausschließlich der
Ausschnitt (`viewBox`) — die Standardassets tragen seit dem Markenabschluss
zusätzlich die **Originalfarben** des Masters (siehe unten), nur die
Reverse-Fassungen färben um.

| Band im Master | y-Bereich | Subpaths | Verwendung |
|---|---|---|---|
| Signet (C/E) | 247–671 | 5 | `signet-standard/-reverse.svg` |
| Wortmarke (nur Schriftzug) | 725–860 | 23 | `wordmark-standard/-reverse.svg` |
| Signet + Wortmarke (gestapelt) | 247–860 | 5 + 23 | `lockup-standard/-reverse.svg` |
| Claim | 881–907 | 29 | **in keinem Produktasset** |

```jsx
<BrandLogo variant="lockup"  tone="reverse" sub={…} />
<BrandLogo variant="signet"  tone="standard" chip alt="" />
<BrandLogo variant="wordmark" tone="standard" />
```

- **Die Wortmarke ist Vektorgeometrie, kein Text.** Der frühere Aufbau
  „Signet + HTML-Text in DM Sans" ist entfallen — er war eine typografische
  Nachbildung und traf die Marke nicht: der Master ist in einer anderen Schrift
  gesetzt. `.ce-brand-word`, `.ce-brand-text`, `.logo-text` und `.logo-mark`
  sind samt Regeln verschwunden.
- **Drei Varianten, klar getrennte Aufgaben.** `signet` (nur C/E, 1,19:1) für
  kleine/quadratische Flächen; `wordmark` (nur Schriftzug, 8,71:1) für schmale
  horizontale Leisten; `lockup` (Originalkomposition, Signet über Schriftzug,
  1,92:1) für Flächen mit Höhe. `lockup` enthält Signet UND Schriftzug in den
  Masterkoordinaten — also **gestapelt**, mit dem dortigen Abstand und
  Größenverhältnis. Signet und Wortmarke werden **nicht** zu einer eigenen
  horizontalen Zeile neu zusammengesetzt — dafür gibt es `wordmark` als eigenes
  Asset, ebenfalls direkt aus dem Master gefiltert, keine Neukomposition.
- **Die Variante folgt der Flächenhöhe, nicht dem Bereich.** Die gestapelte
  Komposition (1176 × 613) braucht Höhe: in der 64-px-Leiste der öffentlichen
  Navigation liefe sie auf **9,7 px** Schrifthöhe hinaus, in der 44-px-Topbar
  auf **7,0 px** — beides unter der 11-px-Untergrenze der Typografieskala.
  Sidebars, Auth und der Mobile-Drawer haben Höhe und tragen deshalb `lockup`
  (17–20 px Schrifthöhe). Die 64-px-Leiste der öffentlichen Navigation trägt
  stattdessen `wordmark` — **gemessen, nicht geschätzt**: bei 360 px ist bei
  174 px Breite (≙ 20 px Höhe) Schluss, 192 px sprengt bereits die Zeile; ab
  500 px bleibt bis mindestens 279 px Luft. 174 px trägt einheitlich von 360
  bis 1440 px — kein Breakpoint-Umschalten nötig. Die 44-px-Topbar der
  eingeloggten App (zu flach auch für die reine Wortmarke ohne weitere
  Verkleinerung) bleibt beim Signet.
- **Verbindliche Markenfarben: Navy `#011B55`, Blau `#004AFC`** — die
  Originalfarben des Masters. Sie gelten für **jedes** Standard-Logoasset, in
  Web, E-Mail und Rechnungs-PDF gleichermaßen; die Marke sieht damit in allen
  drei Kanälen identisch aus.

  Bis zum Markenabschluss trugen die **Webassets** stattdessen die UI-Tokens
  `#111A33` / `#5367E8`, um sich der Oberfläche anzugleichen — während E-Mail
  und PDF bereits die Originalfarben führten. Das war eine Farbdivergenz
  zwischen den Kanälen und ist behoben. **Gemessen**: das neue Blau erreicht
  auf Weiß 6,20:1 gegenüber 4,69:1 vorher, ist also auch kontraststärker;
  Navy misst 16,29:1.

  **UI-Tokens und Logofarben sind ab hier zwei getrennte Systeme.**
  `--ce-color-text-primary` (`#111A33`) und `--ce-color-brand` (`#5367E8`)
  bleiben für Oberflächen, Buttons, Links und Fokus unverändert gültig — sie
  färben nur keine Markengeometrie mehr. Auch `theme-color` in `index.html`
  bleibt beim UI-Token: Browser-Chrome ist kein Logoasset.
- **Reverse ist EINFARBIG hell — gemessen, nicht gewählt.** Auf der Chipfläche
  der Sidebar (effektiv `#242D3A`) erreicht das Markenblau nur ~3:1, auf den
  übrigen dunklen Flächen 3,45–4,39:1. Off-White misst dort 13–19:1. Dunkle
  Flächen tragen deshalb weiterhin `tone="reverse"` in `#F7F8FC` — die
  Originalfarben werden dort **nicht** erzwungen. Keine dritte Markenfarbe.
  Die Begründung samt Zahlen steht im Markenblock von `primitives.css`.
- **Kein Claim produktiv.** „IHRE VERSANDVERMITTLUNG" steht im Master und bleibt
  dort unangetastet, wird aber in kein Produktasset übernommen (Abstimmung mit
  den AGB steht aus — die AGB führen CE als *Wiederverkäufer*, nicht als
  Vermittler). Ein Test vergleicht die 29 Claim-Subpaths gegen jedes Asset.
- **Kein seitenweites Wasserzeichen.** Die Regel gegen Markenassets im
  `.app-shell`-Hintergrund bleibt bestehen; das einzige Wasserzeichen ist
  weiterhin das lokale Detail des Trust-Tiles der Übersicht.
- **Favicon:** Signet-Geometrie, nur transformiert, auf eigener Fläche in
  Master-Navy `#011B55` — ein Favicon steht je nach Browserthema auf hellem
  ODER dunklem Grund. Rand 5/64 zugunsten der Erkennbarkeit bei 16 px. Keine
  vereinfachte Zweitform. Bewusst **einfarbig hell auf Trägerfläche** statt
  zweifarbig: bei 16 px verschmelzen die E-Striche mit dem C, und Markenblau
  auf Master-Navy misst nur 4,6:1; Off-White darauf misst 15,3:1.
- **Browser-Icons sind versioniert und werden kurz gecacht.** Die Datei heißt
  `favicon-v2.svg`, das Apple-Touch-Icon `apple-touch-icon-v1.png` — bei jeder
  sichtbaren Änderung wird die Zahl hochgezählt. Grund: `nginx.conf` liefert
  statische Assets mit `expires 1y` + `immutable` aus, und `immutable`
  unterdrückt die Revalidierung **auch bei Strg+R**. Ein Wechsel unter festem
  Namen wäre für wiederkehrende Besucher bis zu einem Jahr unsichtbar geblieben
  — genau das ist beim Wechsel der alten CE-Textmarke auf das echte Signet
  passiert. Zusätzlich haben beide Pfade in `nginx.conf` eine eigene
  `location ^~`-Regel mit `max-age=3600, must-revalidate`. **Der `^~`-Modifier
  ist tragend**: ohne ihn prüft nginx nach dem Präfixtreffer weiterhin die
  regulären Ausdrücke, und der generische Assetblock würde wieder gewinnen.
  Für gehashte Buildassets bleibt dieser Block unverändert aggressiv.
  `brandIdentity.test.mjs` (14b) sichert Reihenfolge, Modifier und Cachezeiten.
- **Proportionen:** `.ce-brandmark-img` trägt `height: auto` und wird über die
  BREITE gesetzt — Signet und Wortmarke haben verschiedene Seitenverhältnisse
  (1,19:1 gegen 1,92:1). Ein E2E-Test misst das gerenderte Kastenverhältnis
  gegen die viewBox; Verzerrung fällt damit sofort auf.
- **Bundle:** `lockup-*` (11 KB) und `wordmark-*` (8 KB) liegen über Vites
  Inline-Grenze und werden als eigene, cachebare Datei ausgeliefert; die
  Signets (< 4 KB) landen als Data-URI im JS. Deshalb stehen ausführliche
  Begründungen in `primitives.css`/`layout.css` (wird beim Build entfernt),
  nicht in den SVGs.
- **Der Drawer der öffentlichen Navigation liegt über der Leiste**
  (z-index 1001 statt 999). Sein Kopf war schon auf `origin/main` verdeckt —
  mit der gestapelten Marke zerschnitt die fixierte Leiste sie sichtbar.
  Overlay (998) und Leiste (1000) sind unverändert. Ein E2E-Test hält fest,
  dass die Markenfläche dort tatsächlich die oberste Ebene ist.
- Governance: `src/styles/brandIdentity.test.mjs` (Quelltext, 20 Tests — u. a.:
  jeder Pfad steht wörtlich im Master · jede Variante trägt in Standard und
  Reverse exakt dieselbe Geometrie · `lockup` enthält Signet und Wortmarke in
  Originalposition · `wordmark` enthält weder Signet noch Claim · **jede
  Farbfläche stammt aus derselben Farbgruppe des Masters** (ein vertauschtes
  Paar bestünde die reine Hexprüfung) · kein UI-Token färbt Markengeometrie ·
  kein HTML-Nachbau · Favicon == Signet · **Icon-Cachestrategie**) und
  `tests/e2e/brandIdentity.test.mjs` (echter Dev-Server, 8 Tests — Proportionen
  gegen die viewBox, Kontraste gegen die echten Verlaufsstopps, kein
  Abschneiden, die öffentliche Leiste ohne Überlauf auf 360–1440 px, der
  Drawer nicht verdeckt).

**E-Mails** (Paket 2) und **PDF-Dokumente** (Paket 3) sind eigene Pakete und
tragen dieselbe Marke in denselben Originalfarben; sie werden von Webänderungen
nicht berührt. Carrierlabel, Commercial Invoice und Zollunterlagen bekommen
dauerhaft kein CE-Branding — dort ist ConfidaraExpress nicht Herausgeber.

Ein **Apple-Touch-Icon** gibt es seit dem Markenabschluss
(`public/apple-touch-icon-v1.png`, 180 × 180): Safari/iOS kann für
`apple-touch-icon` kein SVG. Es wird von `scripts/export-apple-touch-icon.mjs`
aus `favicon-v2.svg` gerastert — dieselbe Geometrie, keine zweite Quelle, keine
neue Abhängigkeit (Playwright liegt bereits vor). Bewusst vollflächig **ohne**
eigene Rundung: iOS legt seine eigene Maske darüber, eigene Ecken ergäben einen
doppelten Rand.

**Manifest und OG-Bild gibt es weiterhin nicht** und sie wurden bewusst nicht
neu eingeführt — PWA liegt außerhalb des Markenpakets, ein OG-Bild will
gestaltet und nicht generiert werden.

## Firmenlogo des Kunden — nicht mit der CE-Marke verwechseln

Ein Kundenkonto kann ein **eigenes Firmenlogo** hinterlegen. Das ist etwas
grundsätzlich anderes als alles im Abschnitt darüber: die CE-Marke gehört
ConfidaraExpress und liegt als Asset im Repo, das Firmenlogo gehört dem Kunden
und liegt in seinem Konto. Die beiden teilen sich keine Datei, keine Klasse und
keinen Token.

**Das Bild repräsentiert das UNTERNEHMEN, nicht die Person.** ConfidaraExpress
kennt kein Personenbildmodell — es gibt kein Profilbild, keinen Avatar und keine
Absicht, eines einzuführen. Alles heißt deshalb durchgängig `companyLogo`; ein
Test verbietet `profile_picture`, `avatar` & Co. in den beteiligten Dateien.

| Baustein | Datei | Aufgabe |
|----------|-------|---------|
| Anzeige-/Prüflogik | `utils/companyLogoView.mjs` | Metadaten lesen, Formatierung, Sofortprüfung, Fehlertext (rein) |
| Zugriff | `api/companyLogoApi.js` | GET/POST/DELETE über `apiFetch`, Object-URL-Zwischenspeicher |
| Einbindung | `hooks/useCompanyLogo.js` | ein Abruf je Fassung, liefert URL **oder null** |
| Darstellung | `components/ui/UserChip.jsx` | `CompanyMark` (Chip, 36 px) · `CompanyLogoPreview` (Profil, 68 px) |

**Verbindlich:**

- **`null` heißt überall „zeig die Initiale".** Es gibt genau drei Wege dorthin,
  und alle drei sind abgedeckt: kein Logo hinterlegt *oder ein Backend ohne das
  Feld* (die Profilantwort liefert es dann schlicht nicht) · der Abruf scheitert
  (der Service liefert `null`, statt zu werfen) · das Bild lädt, ist aber nicht
  darstellbar (`onError`). Es gibt keinen Zustand, in dem eine leere Fläche
  stünde — und keinen, in dem das Frontend ohne das Backend bricht.
- **Das Bild kommt über `fetch`, nicht über `<img src>`.** Die Route ist
  authentifiziert, und ein `<img>` kann keinen `Authorization`-Header senden.
  Die Alternative wäre eine öffentliche oder signierte URL — also eine zweite
  Zugriffsklasse für dieselben Daten. Stattdessen: Blob holen, Object-URL setzen.
- **Die Version ist der Cache-Schlüssel.** Die Profilantwort liefert
  `companyLogo.version` (gekürzter Inhaltshash). Der Zwischenspeicher liegt auf
  **Modulebene** — der Chip hängt an vier Stellen im Baum und wird bei jedem
  Bereichswechsel neu montiert; ohne ihn liefe bei jeder Navigation ein Abruf.
  Nach Upload/Löschen wird die neue Fassung über `updateUser({ companyLogo })`
  ins Konto gespiegelt; **das** ist das Cache-Busting, kein Zeitstempel-Suffix.
- **Nichts wird persistiert.** Kein `localStorage`, kein `sessionStorage`, keine
  Base64-Kopie, kein Logofeld im Profilformular. Die eine Kopie lebt als
  Object-URL im Arbeitsspeicher des Tabs und wird an **beiden** Abmeldewegen
  freigegeben (sichtbarer Logout und zentraler 401/403-Handler) — sonst
  überlebte sie den Kontowechsel im selben Tab.
- **`object-fit: contain`, nie `cover`.** Ein Kundenlogo hat ein beliebiges
  Seitenverhältnis (eine Wortmarke misst leicht 8:1). `cover` würde beschneiden,
  width+height ohne `object-fit` stauchen. Das Bild wird eingepasst — schmaler
  oder niedriger, aber nie verzerrt und nie angeschnitten. Ein Smoke misst das
  gerenderte Kastenverhältnis gegen die natürlichen Bildmaße.
- **Die Clientprüfung ist Komfort, nicht Sicherheit.** `preCheckLogoFile()` gibt
  sofortige Rückmeldung statt einer Rundreise; maßgeblich ist allein der Server
  (MIME, Dateisignatur, Größe, Bildmaße). Ein **leerer** Dateityp wird deshalb
  bewusst NICHT abgelehnt — manche Systeme liefern keinen, und der Client darf
  keine gültige Datei blockieren, deren Typ er nur nicht kennt.
- **Kein SVG.** Aktiver Inhalt ohne Sanitisierungsinfrastruktur. Es steht nicht
  einmal im `accept` des Dateidialogs, und der Grund steht sichtbar in der Karte.
- **Kein Zuschneide-Editor, keine Ablagefläche, keine Bildbearbeitung.** Ein
  verstecktes `<input type="file">` (`.sr-only`) plus zwei `.btn` — mehr nicht.
- **Die Karte sagt, wo das Logo NICHT erscheint.** Es ist ausschließlich im
  eigenen Kundenportal sichtbar: nicht auf Versandlabels, nicht auf Rechnungen,
  nicht auf Lieferscheinen, nicht auf Zollunterlagen und nirgends beim Provider.
  Ein Kunde, der ein Logo hinterlegt, nimmt das sonst an.
- Backendvertrag: `GET|POST|DELETE /api/kunde/company-logo` (Multipart, Feld
  `logo`) und `companyLogo` als **Metadatenfeld** der `/kundenbereich`-Antwort.
  Der Pfad trägt **keine** Konto-ID — das Konto steht im JWT, die
  Mandantentrennung ist damit strukturell und nicht durch eine Prüfung erkauft.
- Governance: `src/utils/companyLogo.test.mjs` (17 Tests) und backendseitig
  `tests/company-logo.test.js` (32 Tests).

## Sendungshandle — vor jeder Sendungsoperation lesen

Eine gebuchte Sendung wird kundenseitig **ausschließlich über `shipments.id`**
adressiert — den providerneutralen ConfidaraExpress-Sendungshandle. Alle drei
Operationen liegen in **einem** Namensraum:

| Operation | Pfad |
|---|---|
| Label | `GET /api/shipments/:shipmentId/label` |
| Tracking | `GET /api/shipments/:shipmentId/tracking` |
| Stornoanfrage | `POST /api/shipments/:shipmentId/cancellation-request` |

`jumingo_shipment_id` ist eine **externe Providerreferenz**. Sie steht in keinem
Kundenpfad mehr, in keinem Dialogtext, in keiner Sichtbarkeitsbedingung und in
keinem Dateinamen — der Server löst sie intern auf. Wer eine Sendungsoperation
ergänzt, nimmt `s.id`, nicht `s.jumingo_shipment_id`.

**Verbindlich:**

- **Keine ID-Heuristik.** Kein „numerisch → interne ID, String → Providerreferenz".
  Jeder Pfad nimmt genau EIN Format entgegen und löst genau EINE Spalte auf.
- **Die Altpfade** (`/api/jumingo/label/:id`, `/api/tracking/:id`,
  `/kunde/shipments/:id/cancellation-request`) bleiben backendseitig bestehen und
  werden vom Frontend **nicht mehr aufgerufen**. Grund: gehashte JS-Bundles gehen
  mit `immutable` raus — ein zum Deploymentzeitpunkt geöffneter Tab hält sein
  altes Bundle. Entfernbar, sobald kein Client sie mehr aufruft.
- **`GET /api/tracking/public/:key` bleibt unverändert.** Die öffentliche
  Sendungsverfolgung adressiert über die Carrier-Trackingnummer, nicht über den
  Handle, und ist bewusst kein Teil dieses Namensraums.
- **Das Abholzeitfenster bleibt bei der Providerreferenz.** Es ist ein
  Entwurfsvorgang VOR der Buchung (Backend löst über `jumingo_shipment_id` UND
  `status='draft'` auf). Die beiden Ebenen nicht vermischen.
- **Der Dateiname der Label-PDF** kommt aus der CE-Bestellnummer. Bei einem
  Blob-Download entscheidet das `download`-Attribut, **nicht** das serverseitige
  `Content-Disposition` — der Hinweis muss deshalb vom Aufrufer mitkommen
  (`downloadLabel(id, businessOrderNumber)`).
- **Die Buchungsantwort** trägt beides: `shipmentId` (unverändert die
  Providerreferenz — der Wert, den der Client gesendet hat) und additiv
  `ceShipmentId` (der Handle). Der Label-Button des Erfolgsbildschirms hängt am
  Handle, Sichtbarkeit und Handler an derselben Bedingung.

Governance: `src/utils/providerNeutralShipmentHandle.test.mjs` (8 Tests).

### Vor der Buchung: ZWEI IDs, strikt getrennt

`/calculate-price` liefert beide — sie bedeuten **nicht** dasselbe und dürfen nie
gegeneinander ausgetauscht werden:

| Feld | Bedeutung | Wofür |
|---|---|---|
| `shipmentId` | JUMiNGO-/Providerreferenz (`s_` + 32 Hex) | `/book`, Abholzeitfenster, Handelsrechnung |
| `ceShipmentId` | ConfidaraExpress-Sendungshandle (`shipments.id`) | „Als Entwurf speichern" (`POST /api/kunde/drafts/:id/save`) |

- **`hasSavableShipmentId` verlangt die interne ID** (positive Ganzzahl) und lehnt
  die Providerform ab — **das ist richtig so und wird nicht aufgeweicht**. Wer eine
  Entwurfsaktion baut, korrigiert die Datenquelle, nicht den Guard.
- **`hasUsableShipmentReference` ist der andere Validator** (akzeptiert die
  Providerform). Die beiden nie vertauschen.
- **Ohne `ceShipmentId` erscheint die Aktion nicht** — statt ersatzweise die
  Providerreferenz zu senden. Fail-safe, nicht fail-open.
- Beide IDs gehören zum **selben** Entwurf: sie werden gemeinsam gespiegelt und
  gemeinsam verworfen (`dropOffers`). Der Handle liegt additiv im Vorgang, damit
  die Aktion einen Reload überlebt.

Diese Trennung stand einmal falsch dokumentiert: ein Kommentar in `api/client.js`
nannte die Handelsrechnungs-ID „interne Confidara-Shipment-ID" (tatsächlich die
Providerreferenz), zwei Module beriefen sich darauf — und „Als Entwurf speichern"
war dadurch produktiv dauerhaft unsichtbar. **ID-Zuordnungen am Backendpfad
prüfen, nie an einem Kommentar.** Governance:
`src/utils/saveDraftShipmentId.test.mjs` (11 Tests) und
`tests/e2e/shippingFlowRestore.test.mjs` (Tests 38–41; der dortige Mock liefert
beide IDs bewusst in ihrer ECHTEN Form — eine Ganzzahl als `shipmentId` hatte den
Fehler jahrelang verdeckt).

## Abrechnungsart des Kontos — vor jeder Änderung an Profil, Buchung oder Rechnungen lesen

Ein Konto rechnet entweder je Sendung ab (Einzelrechnung, Standard und unverändertes
Verhalten jedes Bestandskontos) oder gesammelt über 7 Tage.

| Baustein | Datei | Aufgabe |
|---|---|---|
| Auswertung + Texte (rein) | `utils/billingModeView.mjs` | Modus, Patch, Vorschau, Erfolgsbildschirm |
| Zugriff | `api/client.js` → `getCurrentConsolidatedPeriod()` | einziger Weg zur Zeitraumvorschau |
| Kundenkarte | `components/dashboard/Profile.jsx` | „Abrechnung & Rechnungen" |
| Adminkarte | `components/admin/BillingModeSection.jsx` | Umstellung durch Support/Onboarding |

**Verbindlich:**

- **Das Frontend rechnet nichts.** Kein Datumsrechnen, keine Preis- oder Steuerlogik,
  keine aus einer kaputten Antwort erfundene Zahl. Zeiträume und Beträge kommen fertig
  vom Server. **0 ist überall ein gültiger Wert** — die Auswertung nutzt
  `Number.isFinite`, nie eine Falsy-Prüfung.
- **Ein unbekannter oder fehlender Modus gilt als Einzelrechnung.** Ein Backend ohne
  das Feld liefert es schlicht nicht, und die Oberfläche darf daraus nie eine
  Sammelabrechnung behaupten.
- **Gespeichert wird über denselben `PATCH /kunde/profil`** wie jedes andere
  Profilfeld — dieselbe `isEnum`-Regel wie der Lieferscheinmodus, keine zweite
  Speicherstrecke, GENAU ein Schlüssel im Body. Das Kundenportal ruft den
  Adminendpunkt nicht auf.
- **Die Zeitraumvorschau wird NUR bei Sammelabrechnung geholt.** Ein Request, den ein
  Konto nie braucht, stünde sonst in jedem Profilaufruf jedes Bestandskunden. Ein
  Ausfall ergibt eine ruhige Hinweiszeile — keine leere Fläche, kein Renderfehler;
  der laufende Abruf setzt nach dem Unmount nichts mehr.
- **Die Vorschau weist sich als Vorschau aus** („Voraussichtlicher Rechnungsbetrag",
  `periodPreviewNote`). Ein Betrag ohne diesen Vorbehalt sähe aus wie eine
  feststehende Rechnungssumme, obwohl der Zeitraum noch läuft. Offene Sendungen aus
  ÄLTEREN Zeiträumen werden mitgezählt, nicht verschwiegen.
- **Der Erfolgsbildschirm der Buchung zeigt bei Sammelabrechnung KEINE
  Rechnungsnummer und kein Fälligkeitsdatum** — zu dieser Sendung gibt es noch keine
  Rechnung, und ein Platzhalter wäre eine Behauptung über einen Beleg, den es nicht
  gibt. Auch der Rechnungs-Zustellhinweis entfällt dort: er spricht über eine
  Rechnungs-E-Mail, die es noch nicht gibt. Die Entscheidung liegt in
  `bookingBillingNotice()`, nicht als Modusvergleich im JSX.
- **Die Karten sagen, was die Umstellung NICHT tut:** sie gilt für künftige
  Buchungen; bereits gebuchte Sendungen behalten ihre Abrechnung. Ohne diesen Satz
  nimmt ein Nutzer an, offene Sendungen würden mit umgestellt.
- **Kein zweites Auswahlbauteil.** Kundenseitig dieselben Radios auf demselben
  `forms.css`-Primitive wie die Lieferscheinauswahl (`.dn-mode-fieldset`); im Admin
  ein `.field-select` (dort zählt Dichte). Der Adminzustand ist doppelt codiert —
  Badge MIT TEXT plus Auswahlstellung, nie allein farblich.
- **Die Adminkarte hat bewusst KEINEN Bestätigungsdialog** (anders als die
  früheren Testbuchungsberechtigung): eine Abrechnungsart ist keine Berechtigung, sie ist
  umkehrbar und wirkt nur für künftige Buchungen. Ein Dialog wäre Zeremonie ohne
  Gegenwert. Ein Umstellen auf den bereits gesetzten Wert sendet nichts.
- **Eine Werteliste für das ganze Frontend** (`BILLING_MODES`) — Profil, Buchung,
  Admin-API und Adminkarte lesen dieselbe. Kein technischer Bezeichner steht im
  sichtbaren Text.
- **Nichts wird persistiert.** Kein `localStorage`, kein `sessionStorage`. Der
  Vorschau-Endpunkt ist read-only und trägt keine Konto-ID — das Konto steht im JWT.
- Governance: `src/utils/billingModeUx.test.mjs` (31 Tests) und
  `tests/e2e/billingMode.test.mjs` (8 Browser-Smokes gegen einen echten Dev-Server
  mit gemocktem Backend — **niemals eine Bestellung, niemals ein echter
  Sammelrechnungslauf**).

## Proforma-Rechnung auf dem Erfolgsbildschirm — vor jeder Änderung daran lesen

Nach einer erfolgreichen Buchung kann der Kunde seine eigene Proforma-Rechnung
(das Zollbegleitdokument einer Drittlandsendung) direkt vom Erfolgsbildschirm
laden — **sofern der Server eine meldet**. Der Beleg selbst entsteht
serverseitig nach dem Commit der Buchung und liegt dort unveränderlich; das
Frontend zeigt ihn nur an.

| Baustein | Datei | Aufgabe |
|---|---|---|
| Auswertung (rein) | `utils/proformaDocumentView.mjs` | Zustände, Pfad-Guard, Nachladetakt, alle sichtbaren Texte |
| Download | `utils/downloadProforma.js` | Blob-Download über den SERVERPFAD, Serverdateiname |
| Zugriff | `api/client.js` → `getShipmentDocuments()` | einziger Weg zur Dokument-Metadaten-API |
| Darstellung | `pages/BookingPage.jsx` (Schritt 3) | gedeckeltes Nachladen + drei Anzeigezustände |

**Verbindlich:**

- **Die Dokument-Metadaten-API ist die einzige Quelle.** Ob es zu einer Sendung
  eine Proforma gibt, sagt ausschließlich `GET /api/shipments/:id/documents` —
  **nie** das Zielland, die Zollpflicht, `customsInvoiceMode`, `exportReason`,
  `use_commercial_invoice`, der Tarif oder der Provider. Fachlich fällt die
  Entscheidung PROFORMA ↔ COMMERCIAL serverseitig aus dem persistierten
  Zollsnapshot; ein zweiter, clientseitiger Ableitungsweg wäre eine zweite
  Wahrheit, die zwangsläufig irgendwann abweicht. Ein Test schneidet Effekt,
  Handler und Oberfläche aus der Buchungsseite und verbietet dort jeden dieser
  Begriffe — die Seite trägt daneben unverändert den echten Zollablauf.
- **Eine erfolgreiche Buchung bleibt erfolgreich.** Der Metadatenabruf hat
  bewusst **keinen** Fehlerzustand: ein Netzfehler, ein 500er oder ein kaputter
  Body ergeben `absent` — also exakt den Bildschirm, den es vor diesem Paket
  gab. Nichts wird entfernt, nichts umgefärbt, `/book` wird nie erneut
  ausgelöst. Ein nicht auswertbarer Abruf überschreibt einen bereits gefundenen
  Beleg **nicht** mit „nicht vorhanden", sondern wird im Budget wiederholt.
- **Vier Zustände, drei Anzeigen.** `ready` → Downloadknopf (mit der
  servergelieferten PF-Nummer) · `processing` → ruhiger Hinweis „wird erstellt" ·
  `failed` → neutrales „derzeit nicht verfügbar. Ihre Buchung ist davon nicht
  betroffen." · `absent` → **gar nichts**. Der Fehlerfall trägt **kein Rot** und
  **keinen Wiederholen-Knopf**: neben „Sendung erfolgreich gebucht!" liest sich
  eine rote Fläche wie ein Zweifel an der Buchung, und ein weiterer Anlauf des
  Kunden ändert am serverseitigen Zustand des Belegs nichts.
- **`ready` verlangt ZWEI Dinge:** den Serverzustand **und** einen benutzbaren
  Pfad. Alles Unbekannte gilt als `processing`, nie als ladbar — sonst
  behauptete ein künftiger Serverzustand einen Download, den es nicht gibt.
- **Der Pfad kommt vom Server** (`downloadPath` aus der Liste) und wird **nie**
  im Frontend gebaut; ein Test verbietet das Pfadliteral in allen vier
  beteiligten Dateien. Er wird trotzdem geprüft (`isSafeApiPath`): `apiFetch`
  reicht eine absolute URL unverändert durch **und** hängt den Bearer-Token an —
  ein Pfad auf einen fremden Host würde das Kundentoken dorthin senden.
- **Gedeckeltes Nachladen, kein Hintergrundworker.** Erster Abruf **sofort**
  (der Beleg entsteht unmittelbar nach dem Commit), danach fester Takt von 2 s
  mit einem Budget von 30 s — kein `setInterval`, kein Backoff über Minuten (das
  Muster der Rechnungszustellung nebenan wartet auf einen Mailversand und darf
  deshalb länger laufen). Gestoppt wird bei **jedem** Endzustand, beim Unmount
  und beim Schrittwechsel; läuft das Budget ab, bleibt der ruhige Hinweis stehen.
  `nextProformaPollDelay` prüft erst den TYP, dann den Wert — `Number(null)` ist
  `0` und hätte sonst einen Takt erzeugt, der sein Budget nie erreicht.
- **Der Dateiname kommt vom Server** (`Content-Disposition`, gelesen mit dem
  vorhandenen `filenameFromContentDisposition`). Es wird **kein** eigener
  Belegname erfunden und die serverseitige Namensregel nicht nachgebaut.
  **GEMESSEN:** `Content-Disposition` ist kein CORS-safelisted Response-Header,
  und `middleware/cors.js` setzt kein `exposedHeaders` — im Produktivbetrieb
  liest der Browser ihn deshalb **nicht**. Der Rückfall ist ein neutraler,
  konstanter Name (`proforma-rechnung.pdf`) **ohne** Belegnummer. Gibt das
  Backend den Header später frei, greift der Servername ohne Frontendänderung;
  beide Richtungen sind als Browser-Smoke gemessen.
- **Kein Interna im sichtbaren Text.** Keine Fehlercodes, keine Codepunkte
  (der Rendererfehler des Belegs trägt serverseitig welche), kein Status, kein
  Providername. Der Serverfreitext wird **nicht** angezeigt — bewusst strenger
  als die drei Nachbarhelfer (Auditbefund #3 des Labeldownloads: dort stand
  wortwörtlich „Fehler" im Kundenbanner).
- **Label, Auftragsbestätigung und Lieferschein sind unverändert** und laufen
  weiter über ihre eigenen Helfer — sie wurden **nicht** auf die Dokumentliste
  umgestellt. Die Dokumentliste wird an genau EINER Stelle abgefragt.
- **Kein Backend, kein Schema, keine ENV, kein P6.** Kein Dokument-Drawer, keine
  Änderung an der Sendungsliste, kein zweiter Abrufweg, kein `localStorage`.
- Governance: `src/utils/proformaSuccessDownload.test.mjs` (16 Tests) und
  `tests/e2e/proformaSuccessDownload.test.mjs` (6 Browser-Smokes gegen einen
  echten Dev-Server mit gemocktem Backend — **niemals eine echte Bestellung**).
  Drei Kernaussagen sind mutationsgeprüft: ein unbekannter Status als „ladbar",
  ein Nachladen ohne Obergrenze und ein Abbruch des Nachladens im Zustand
  `processing` färben je genau die zuständige Prüfung rot.

## ConfidaraExpress — Buchung, Preise & Jumingo

- **Frontend ersetzt keine serverseitige Prüfung.** Preis-, Tarif-, Auth-, Zahlungs- und Buchungsvalidierung passieren im Backend — das Frontend prüft sie nie ersatzweise.
- **Preise/Tarife nur anzeigen**, niemals als Quelle der Wahrheit behandeln oder clientseitig berechnen/überschreiben.
- **Keine geratenen Jumingo-Daten:** Felder, Tarife, `serviceType`, `pickup`/`dropoff`, Access-Point-/Paketshop-Daten nicht erfinden — nur belegte Werte verwenden.
- **Carrier-Bedingungen immer aus dem konkreten Tarif** (`tariff.carrierLinks.agb`) — nie über den Carriernamen zuordnen und nie die CE-AGB als Ersatz verlinken. Fehlt der Link, erscheint nur der neutrale Hinweistext, kein Ersatzlink.
- **Versicherungsinformationen laufen dreistufig:** Buchungskarte → Versicherungsdetails-Dialog →
  Seite `/versicherungsinformationen`. Aller kundenseitiger Versicherungstext steht in
  `utils/insuranceTerms.mjs` (Karte/Dialog) und `utils/insuranceInfo.mjs` (Seite) — nicht in JSX.
  Jede Aussage trägt dort ihre Herkunft (`agb` / `produkt` / `bedingungen`); fremde
  Vollbedingungen werden weder kopiert noch verlinkt.
- **Versicherungscopy nur aus prüfbarer Quelle.** Zulässig sind allein die vorliegenden
  Versicherungsbedingungen, belegte CE-AGB-Inhalte und technisch belegte Produktdaten — ein
  Implementierungs-Prompt ist **keine** Quelle. Die Bedingungswerke unterscheiden mehrere
  Profile (u. a. national/international) mit abweichenden Güterklassen, Grenzen und
  Meldefristen; solange technisch nicht feststeht, welches gilt, wird **keine profilspezifische
  Regel als allgemeingültig** dargestellt. Reklamationsfristen der CE-AGB sind **nicht** die
  versicherungsrechtliche Meldefrist.
- **White Label:** Jumingo ist interner Upstream-Anbieter und darf in kundenseitiger UI, Copy und Links nicht erscheinen — auch nicht als Bedingungsgeber, Kosten-, Schaden- oder Supportträger. Technische Feldnamen, API-Pfade, Mocks und interne Kommentare bleiben davon unberührt. Der konkret gewählte Versanddienstleister (DPD, UPS, DHL Express, GLS …) **darf und soll** sichtbar sein.

### Dropoff/Paketshop-Guardrail (zwingend)

Dropoff/Paketshop darf im UI **nicht** so dargestellt werden, als sei eine verbindliche Buchung möglich, wenn der **Backend-Guard dies noch blockiert**. Wenn das Backend eine Dropoff-Buchung blockiert, muss das Frontend diese Realität respektieren. **Keine UI-Texte, die dem tatsächlichen Backend-Verhalten widersprechen.** Bei Unklarheit über Felder/Übergabe: stoppen, Analyse liefern und nachfragen.

## Sicherheitsregeln

**Kein Logging von Tokens oder Nutzerdaten:**
```js
// NIEMALS
console.log("Token:", localStorage.getItem("ce_token"));
console.log("User:", user);
// Vor jedem Merge prüfen: keine console.log mit Auth-Daten
```

**localStorage und JWT:** Das JWT wird bewusst in `localStorage` gespeichert (kein `httpOnly`-Cookie). Das ist ein bekannter XSS-Kompromiss zugunsten von Einfachheit. Konsequenz: Kein unsanitierter User-Content darf als `innerHTML` gerendert werden. React's JSX-Escaping schützt in der Regel — aber kein `dangerouslySetInnerHTML` einführen.

**`.env`-Datei:** Die `.env` enthält die Produktions-API-URL (`https://api.confidaraexpress.de`). Sie ist im Repo versioniert — **keine weiteren Secrets** (API-Keys, Passwörter, Private Keys) in `.env` ablegen. Für lokale Entwicklungsüberschreibungen eine lokale `.env.local` (in `.gitignore`) nutzen.

**CORS:** Die API läuft auf `api.confidaraexpress.de`, das Frontend auf einer anderen Domain. CORS-Header werden serverseitig gesetzt. Neue API-Endpunkte nicht im Frontend aufrufen, bevor sie serverseitig CORS-freigegeben sind.

**Neue Abhängigkeiten:** `package.json` verwendet `"latest"` für alle Dependencies — das ist ein Stabilitätsrisiko. Neue Pakete mit exakter Version (`"^x.y.z"`) pinnen und vorher auf Aktualität und Vertrauenswürdigkeit prüfen (`npm info <paket>`).

## Härtung: Auffindung statt Dateiliste, Fehlergrenzen, Auslieferungsheader

Dieses Paket hat nichts Fachliches geändert. Es schließt drei Lücken, die ein
Audit gemessen hat, und macht den bestehenden Zustand reproduzierbar prüfbar.
**Kein Business-, API-, Routing-, Preis- oder Berechtigungsverhalten wurde
berührt.**

### Testdateien werden GESUCHT, nicht aufgezählt

`package.json` führte jede Testdatei einzeln auf. Zwei Dateien lagen dadurch im
Repository, ohne je zu laufen: `src/utils/voucherUx.test.mjs` (30 Prüfungen) und
`tests/e2e/addressValidation.test.mjs` (10 Browserprüfungen). Beide waren
geschrieben, beide nie ausgeführt — die zweite war beim ersten Lauf sofort rot.

- `npm test` → `node --test "src/**/*.test.mjs"`
- `npm run test:e2e` → `node scripts/run-e2e.mjs` (sucht `tests/e2e/*.test.mjs`)

**Was da ist, läuft.** Es gibt keine Ausnahmeliste: wer eine Suite nicht laufen
lassen will, löscht oder verschiebt sie — beides steht im Diff, ein stiller
Ausschluss stünde dort nicht.

`scripts/run-e2e.mjs --shard i/n` teilt die Suiten **reihum** auf (Datei k →
Teil k mod n), weil ihre Laufzeiten stark schwanken und benachbarte Dateien oft
zum selben Thema gehören; blockweise bekäme ein Teil alle schweren. Lokaler Lauf
und CI teilen sich **dieselbe** Auffindung — zwei getrennte Listen wären genau
der Fehler von oben.

**Governance-Tests messen das jetzt richtig.** Fünf Dateien prüften ihre eigene
Fortdauer über `pkg.scripts.test.includes("…")`. Unter Auffindung ist das
bedeutungslos; sie nutzen deshalb `scripts/governance.mjs`
(`pruefeImTestlauf` / `pruefeImE2eLauf` / `pruefeNichtVorhanden`), das die
Konjunktion prüft: das Skript sucht wirklich rekursiv **und** die Datei liegt im
durchsuchten Bereich. Für eine bewusst entfernte Datei zählt ihre Abwesenheit
auf der Platte, nicht ihr Fehlen in einem String.

### Ein Formularhelfer für alle Versand-E2E

Zehn Suiten trugen eine wörtlich kopierte Hilfsfunktion, die „Neue Sendung" über
**Platzhaltertexte** ansprach (`getByPlaceholder("5", { exact: true })`). Als das
Paket „Paketmaße sind Pflicht" den Maßfeldern ein „z. B." voranstellte, fielen
zehn Suiten gleichzeitig aus — nicht weil das Produkt kaputt war, sondern weil
zehn Kopien derselben Annahme existierten.

`tests/e2e/helpers/newShipmentForm.mjs` ist jetzt die einzige Stelle. Verbindlich:

- **Ein Platzhalter ist Beschriftungstext und kein Selektor.** Angesprochen wird
  über die stabilen `ns-…`-ids, die der Produktcode ausdrücklich vergibt
  (`addrField` / `zipField` / `countrySelect` in `NewShipmentPage.jsx`).
- **Kein positionsbasierter Zugriff mehr** (`.booking-addr-grid > div nth(1)
  input nth(4)`) — der zählte Eingabefelder in DOM-Reihenfolge und hätte bei
  jedem eingefügten Feld still das falsche getroffen.
- **Das Land steht ZUERST.** Seit „Neue Sendung startet leer" ist es ohne
  Auswahl leer; die PLZ-Regel und die Adressprüfung hängen daran.
- **Nichts wird erzwungen.** `berechneAngebote()` prüft, dass der CTA bedienbar
  IST, und schlägt sonst mit dem sichtbaren Hinweis fehl. Kein `force`-Klick,
  kein Entfernen von `disabled` — genau das würde die Produktprüfung umgehen,
  um die es geht.

**Jede E2E-Suite, die die Buchungsseite erreicht, muss
`GET /api/legal/booking-context` beantworten** (`{ enabled: false }` = Server mit
abgeschalteter Schranke, der heutige Produktivzustand). Ohne Antwort greift der
Sammelfall `200 {}`, `parseBookingContext` wertet das fail-closed als `error`,
und die Bestellung ist gesperrt. Das ist richtiges Produktverhalten; die Suite
muss den Endpunkt schlicht kennen. Beide Zustände prüft
`tests/e2e/legalBookingGate.test.mjs`.

### Fehlergrenzen an allen sechs Stellen

`ContentErrorBoundary` deckte nur das Kundendashboard ab. Wurzel, Auth-Bereich,
öffentliche Seiten und Adminportal waren offen — dort erzeugte ein Renderfehler
weiterhin eine weiße Seite.

| Ort | Datei | Rahmen |
|---|---|---|
| Wurzel | `main.jsx` | über Router UND AuthProvider |
| Auth | `App.jsx` (`AuthAreaBoundary`) | `.container` |
| öffentlich | `NavbarLayout.jsx` | `.container` |
| Admin | `AdminLayout.jsx` | `.adm-page` |
| Dashboard-Layout | `DashboardLayout.jsx` | `.page-body` (bestand bereits) |
| Dashboard-Seiten | `DashboardPage.jsx` | `.page-body` (bestand bereits) |

Verbindlich:

- **Es gibt GENAU EINE Fehlergrenzen-Komponente.** Kein zweites Muster daneben;
  ein Test sucht projektweit nach `getDerivedStateFromError`/`componentDidCatch`
  und lässt genau eine Datei zu.
- **Die Wurzelgrenze liegt ÜBER Router und AuthProvider** — innerhalb könnte sie
  einen Fehler des Routers selbst nicht sehen, und genau dort entstünde die
  weiße Seite, gegen die das Muster gebaut ist.
- **Zwei Ursachen, zwei Handlungen.** Ein nicht mehr ladbarer Codeabschnitt
  (alle Seiten sind `React.lazy`, die Bündel gehen mit `immutable` raus — ein
  zum Deploymentzeitpunkt offener Tab fragt nach einem Dateinamen, den es nicht
  mehr gibt) braucht **Neuladen**; „Erneut versuchen" fordert denselben
  fehlenden Abschnitt erneut an und hilft dort nie. `isChunkLoadError()` trennt
  beides an den bekannten Browser-Wortlauten und gilt im Zweifel als
  gewöhnlicher Renderfehler — lieber „erneut versuchen" anbieten als
  fälschlich versprechen, Neuladen behebe das Problem.
- **Nie von selbst neu laden.** Ein reproduzierbarer Renderfehler würde daraus
  eine Schleife machen, die der Nutzer nicht anhalten kann.
- **Kein technischer Rohwert in der sichtbaren Fläche, keine Nutzerdaten und
  keine Tokens im Log.** Geloggt werden Fehlerobjekt und Komponentenspur.
- Jede Bereichsgrenze trägt `key={pathname}`; sonst bliebe die Fehlerfläche
  einer verlassenen Seite stehen und blockierte die nächste.
- Governance: `src/components/common/errorBoundaryCoverage.test.mjs` (12 Tests,
  drei Mutationen gegengeprüft).

### Auslieferung: Sicherheitsheader und eine gemessene CSP

`nginx.conf` setzt `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy` und eine `Content-Security-Policy`.

- **`add_header` wird NICHT vererbt**, sobald eine `location` selbst eines
  setzt. Vier Locations tun das (Cache-Control) — der Block ist dort deshalb
  wiederholt. Wer eine neue Location mit `add_header` anlegt, MUSS ihn
  mitkopieren, sonst verliert genau dieser Pfad still seine Header.
- **Die CSP ist gemessen, nicht geschätzt.** Der echte `dist/`-Build lief in
  Chromium hinter der Richtlinie: React montiert, sieben Schriften laden, der
  blob:-Worker von maplibre startet, das PDF-`iframe` wird akzeptiert — null
  `securitypolicyviolation`. Gegenprobe: ohne den Kachelhost in `img-src`
  meldet derselbe Lauf genau eine `img-src`-Verletzung, das Messinstrument
  greift also.
- `style-src 'unsafe-inline'` ist **unvermeidbar** (React-`style={{…}}`-Attribute
  und Laufzeitstile von maplibre), `'unsafe-eval'` ist **nicht** nötig.
- **ACHTUNG, Kopplung an den Build:** `connect-src` und `img-src` nennen zwei
  Hosts, die als Buildvariablen im Bündel landen (`VITE_API_URL` aus `.env`,
  Kachelhost aus `src/config/map.js` bzw. `VITE_MAP_STYLE_URL`). Wer einen davon
  ändert, MUSS ihn in `nginx.conf` nachziehen — sonst blockiert der Browser jeden
  API-Aufruf beziehungsweise die Karte. Die Richtlinie ist ein Deploymentvertrag,
  kein Selbstläufer.

### Abhängigkeiten sind festgenagelt

`"latest"` stand bei vier Paketen. Das war kein theoretisches Risiko: es hatte
das Projekt bereits still von **React 18 auf 19** gehoben, ohne dass irgendwo
eine Entscheidung dazu stand (CLAUDE.md nennt oben weiterhin React 18 — der Text
beschreibt insoweit nicht mehr den Bestand). Alle vier tragen jetzt den Bereich
ihrer tatsächlich getesteten Fassung, und `Dockerfile` nutzt `npm ci` statt
`npm install` — ein Build, dessen Abhängigkeiten von package-lock.json abweichen,
bricht ab, statt ungetesteten Code auszuliefern.

`react-router-dom` ist auf `^7.18.2` gehoben (fünf Advisories bis 7.18.1,
darunter ein Open Redirect über Backslash in `<Link>`/`useNavigate` — beide
werden hier benutzt), `vite` auf `^8.0.16` (zwei Advisories, beide
Windows- und Dev-Server-spezifisch, ohne Wirkung auf das ausgelieferte
Statikpaket).

**Offen und bewusst nicht in diesem Paket:** `vite` und `@vitejs/plugin-react`
stehen unter `dependencies`, obwohl sie reine Buildwerkzeuge sind und in keinem
ausgelieferten Modul vorkommen. `npm audit --omit=dev` misst dadurch mehr, als
es behauptet. Die Umhängung nach `devDependencies` ist richtig, berührt aber
mehrere Governance-Tests und gehört in ein eigenes Paket.

### Jede E2E-Suite beendet ihren Dev-Server wirklich

`spawn("npx", ["vite", …])` erzeugt keinen Prozess, sondern drei:
`npx` → `sh -c vite` → `node …/vite`. **`server.kill(…)` signalisiert nur den
npx-Prozess**; Kind und Enkel bleiben stehen — mitsamt dem gebundenen Port.

Gemessen, an drei unabhängigen Stellen dasselbe Bild:

- Nach einem vollen lokalen Lauf standen die Dev-Server der bereits beendeten
  Suiten noch auf ihren Ports (`authErrors` 5225, `adminDraftDeletion` 5236,
  `bookingOptionControls` 5248, `addressValidation` 5263 …), teils eine halbe
  Stunde lang.
- `adminOverviewMetrics` — die einzige der ersten sechs Suiten **mit**
  `detached: true` + `process.kill(-pid)` — räumte sauber auf.
- Der GitHub-Actions-Runner meldete am Jobende von sich aus
  `Terminate orphan process: pid (…) (sh)` / `(node)`, in vier Paaren.

Die Folge ist keine Kleinigkeit: **ein zweiter `npm run test:e2e` auf derselben
Maschine fällt in jeder Suite aus**, weil `--strictPort` nicht ausweicht — und
zwar jedes Mal erst nach der vollen Startfrist von 90 Sekunden. Der Lauf war
damit nicht wiederholbar, was der Zweck dieser Testinfrastruktur ist.

**Verbindlich, und beide Teile gehören zusammen:**

- **`detached: true`** macht das Kind zum Anführer einer eigenen Prozessgruppe.
  Erst dadurch adressiert ein negatives Signal die ganze Gruppe. Ohne
  `detached` gehörte das Kind zur Gruppe des Testlaufs — ein `kill(-pid)`
  träfe dann den Testlauf selbst oder liefe ins Leere.
- **`process.kill(-server.pid, …)`** im Teardown, in `try` gefasst: ist die
  Gruppe schon weg, wirft der Aufruf `ESRCH`, und ein ungefangener Wurf im
  `after`-Haken färbte eine erfolgreiche Suite rot — der Aufräumcode zerstörte
  dann genau das, wofür er da ist. Der zweite Kill auf das Kind bleibt als
  Rückfallebene.

25 der 33 Suiten trugen das Muster nicht. Vier setzten sogar ausdrücklich
`detached: false`. **Eine Wortsuche nach „detached" beantwortet die Frage
nicht** — in zwölf Dateien steht das Wort ausschließlich in Playwrights
`waitForSelector({ state: "detached" })`. Die Prüfung schaut deshalb ins
Spawn-Statement, nicht in die Datei.

Erkannt werden Suiten am einheitlichen `server = spawn(` — bewusst nicht an
`spawn("npx", ["vite"…])`: zwei Suiten (`insuranceTerms`,
`newShipmentFloatingLabels`) starten denselben Server über `npm run dev` und
fielen aus einer zu engen Erkennung heraus. Ein eigener Test hält fest, dass
die Erkennung keine spawn-nutzende Datei übersieht.

Governance: `tests/e2e/helpers/devServerTeardown.test.mjs` (4 Tests) und
`tests/e2e/helpers/portUniqueness.test.mjs` (3 Tests) — zwei Seiten derselben
Fehlerklasse: ein fremder Server auf meinem Port.

### CI

`.github/workflows/ci.yml`: Unit-Tests + Build, vier parallele E2E-Teile über
`scripts/run-e2e.mjs --shard i/4`, und `npm audit --omit=dev`. Kein echtes
Backend, keine echte Bestellung, keine E-Mail, keine Secrets — jede E2E-Suite
mockt ihre Aufrufe über `page.route` gegen einen lokalen Dev-Server.

**Node 22 ist Pflicht, nicht Geschmack.** `npm test` lautet
`node --test "src/**/*.test.mjs" …`; das Auflösen dieses Musters übernimmt
**Node**, nicht die Shell (die Anführungszeichen verhindern das gerade) — und
Node kann das erst ab Version 22. Die Datei stand zunächst auf `"20"`, und der
erste echte Lauf brach dort sofort ab (`Could not find '…/src/**/*.test.mjs'`),
während derselbe Befehl lokal auf Node 22 alle Prüfungen ausführte. Die
Pipeline hat mit ihrem ersten Lauf sich selbst gefunden. Die Fassung steht
zusätzlich als `engines` in `package.json`, damit ein zu altes Node schon bei
`npm ci` eine verständliche Meldung erzeugt.

**Die beiden Helferprüfungen liefen zunächst nirgends.** Sie liegen unter
`tests/e2e/helpers/` — `scripts/run-e2e.mjs` sucht dort nicht (nicht rekursiv,
und sie brauchen keinen Browser), `npm test` durchsuchte nur `src/`, und der
CI-Schritt, den ihr eigener Kommentar behauptete, existierte nie. Das ist
exakt der Fehler, gegen den dieses Paket angetreten ist. `npm test` sucht
deshalb jetzt **zwei** Muster ab:

```
node --test "src/**/*.test.mjs" "tests/e2e/helpers/*.test.mjs"
```

### Offener Punkt aus diesem Paket

**Der Preisrechner sagt nicht, warum sein CTA gesperrt ist.** „Neue Sendung"
trägt bei unvollständigen Maßen eine Hinweiszeile (`packageHint`,
`NewShipmentPage.jsx`); auf `/calculator` steht nur der deaktivierte Knopf ohne
Begründung — gemessen, `.offers-calc-cta` enthält dort ausschließlich „Angebote
vergleichen". Das widerspricht der eigenen Regel unter „Paketmaße sind Pflicht",
in deren Geltungsbereich der Preisrechner ausdrücklich steht. Bewusst NICHT in
diesem Paket behoben: das wäre eine sichtbare Oberflächenänderung und keine
Härtung. In `tests/e2e/calculatorErrors.test.mjs` steht die Stelle als Kommentar
markiert, damit die Prüfung dorthin wandert, sobald die Zeile existiert.

## Was nicht geändert werden sollte

- **Auth-Logik** — serverseitig gesteuert; kein clientseitiges Freischalten
- **API-Routen** — Backend ist extern, Endpunkte nicht umbenennen
- **CSS-Token-Systeme trennen** — kein Cross-Pollination zwischen `--auth-*`, `--ce-*` und Legacy-Variablen
- **Legal-Seiten-Design** — bleibt dauerhaft Light-Theme (Lesbarkeit, rechtliche Konvention)
- **`.app-shell` als einziger Layout-Wrapper** — keine seitenabhängigen Theme-/Hintergrund-Scopes und keine zweite Hintergrund-Ebene wieder einführen
