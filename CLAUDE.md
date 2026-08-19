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
Lager & Aufträge   ›
Konto              ›
──────────────────
Abmelden
```

Geöffnet ist immer höchstens EINE Gruppe:

```
Versand            ˅
    Neue Sendung · Preisrechner · Entwürfe · Sendungen ·
    Sendungsverfolgung · Versandrechnungen
Lager & Aufträge   ˅  Lagerübersicht · Artikel · Bestand · Aufträge · Bewegungen
Konto              ˅  Unternehmen & Konto · Supportanfragen
```

**Verbindlich:**

- **Eine Konfiguration, zwei Bauteile.** `NAV_GROUPS` + `OVERVIEW_ITEM` +
  `ADDRESSBOOK_ITEM` in `DashboardSidebar.jsx` sind die einzige Quelle;
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
- **Adressbuch bleibt eigenständig.** Es ist eine gemeinsam genutzte Ressource
  (Versand, Empfänger, Aufträge); unter einer der Gruppen behauptete es eine
  Zugehörigkeit, die es nicht hat.
- **„Lager & Aufträge" steht NICHT ganz oben.** Das kehrt eine frühere
  Festlegung um: ConfidaraExpress ist primär eine Versandplattform, das
  Lagermodul ein optionales Zusatzmodul. Es führt die Kernnavigation nicht an.
- **„Versandrechnungen" ist nur eine Beschriftung.** Der page-Wert bleibt
  `invoices`, Route, Seite und Rechnungslogik sind unverändert. Wer den
  sichtbaren Namen ändert, benennt keine Route um.
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
  Adressbuch · Lager & Aufträge · Konto): 15 px / 600 / mindestens 44 px hoch /
  Icon 18 px — **alle fünf identisch**, nur der Chevron unterscheidet eine
  Gruppe. Zweite Ebene: 14 px / 500 / 40 px / Icon 17 px, eingerückt.
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
- Governance: `src/components/layout/sidebarNavigation.test.mjs` (19 Tests) und
  `src/components/layout/appShellChrome.test.mjs` (Chrome, Kontraste,
  Typografie).

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
speichern. Für den Sendungsentwurf gibt es keine „Fortsetzen"-Aktion
(`DraftsPage.jsx`/`DraftsList.jsx` reichen `onResume` nur an Formularentwürfe
durch), das Löschen des Flows hat dort also keine Rückwirkung.

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
  Detailfelder erscheinen erst nach dem Einschalten. Beide Schalter sind reiner
  UI-Zustand in `BookingPage` und werden beim Mount aus den vorhandenen Werten
  **abgeleitet** (Referenz vorhanden → an; Format ≠ A4 → an) — das
  Vorgangsschema (`BOOKING_KEYS`) bleibt unverändert. Die beiden Optionen
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
  `undefined` → `""`). Das Versenden, die Deduplizierung gleicher Adressen und
  der Label-Anhang passieren serverseitig.
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
  Verwaltungsmenü) sind bewusst NICHT übernommen; die Liste nutzt das
  Auswahlmaterial `.inv-picker*`, das im selben Dialog schon für Artikel steht.
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

## Was nicht geändert werden sollte

- **Auth-Logik** — serverseitig gesteuert; kein clientseitiges Freischalten
- **API-Routen** — Backend ist extern, Endpunkte nicht umbenennen
- **CSS-Token-Systeme trennen** — kein Cross-Pollination zwischen `--auth-*`, `--ce-*` und Legacy-Variablen
- **Legal-Seiten-Design** — bleibt dauerhaft Light-Theme (Lesbarkeit, rechtliche Konvention)
- **`.app-shell` als einziger Layout-Wrapper** — keine seitenabhängigen Theme-/Hintergrund-Scopes und keine zweite Hintergrund-Ebene wieder einführen
