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
| App-Chrome „Executive Ivory + Midnight Slate" | `--ce-app-*`, `--ce-sidebar-*` | `variables.css` → `dashboard-premium.css` | Hintergrund + Sidebar des eingeloggten Bereichs |
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

## App-Layout „Executive Ivory + Midnight Slate" — wichtigste Regel

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
- Die Sidebar ist mattes Midnight Slate (`--ce-sidebar-bg-*`), niemals schwarz
  und niemals glasig — der Blaukanal muss klar über dem Rotkanal liegen.
- Firmenkarte und Supportkarte teilen EINE Materialsprache (gleiche Rundung,
  gleiche Bordersprache) in ZWEI Höhenlagen: die Firmenkarte erhöht
  (`--ce-sidebar-card` + Schatten), die Supportkarte vertieft
  (`--ce-sidebar-well`, ohne Schatten).
- Der Kontrast Sidebar↔Hauptfläche ist die tragende Idee des Layouts und darf
  nicht unter ~12:1 fallen — `appShellChrome.test.mjs` misst das.
- Der aktive Navigationseintrag ist mehrfach codiert (Fläche + Border +
  Akzentkante als `inset`-Schatten + Schriftschnitt), nicht allein farbig.
- Die gesamte Sidebarspalte (`.pp-side-in`) scrollt — nicht `.pp-nav` separat,
  sonst wird auf kurzen Viewports „Abmelden" abgeschnitten.
- Legal Pages (Impressum, Datenschutz, AGB, Widerruf) und der Auth-Bereich
  liegen außerhalb dieses Rahmens und bleiben unverändert.

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
  navigate("/dashboard", { replace: true }); // Query-Param danach entfernen
}
```

Dieser Mechanismus ermöglicht Direktlinks in Dashboard-Unterseiten aus externen Kontexten.

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

Entwicklung läuft auf `claude/premium-shipping-process-package-b`. Nicht auf `main` pushen ohne explizite Freigabe.

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
- **Live-Zusammenfassung** (`BookingLiveSummary`/`.booking-livesum`) ist ab
  861 px sticky (`top: 16px`) mit eigener Elevation-Stufe. Bekannte, bewusst
  akzeptierte Eigenschaft von `position: sticky`: sie überlappt beim
  Scrollen kurzzeitig die obere Kante der darunterliegenden Karte — wie jede
  sticky Zusammenfassungsleiste. Kein Dialog wird dadurch verdeckt
  (Dialoge laufen auf `--ce-z-dialog`, weit über der Leiste).
- **`.calc-panel`** (Preisrechner, Neue Sendung, alle Buchungsmodule) ist
  jetzt Base Card aus der Foundation — kein Gradient-Kartenkopf mehr.
- **Auswahlkarten** (`.ins-card`, `.labelfmt-card`, Angebotskarten
  `.offer-card`) tragen im ausgewählten Zustand Brand Border + Brand Soft,
  keinen Schatten-Ring mehr.
- **`offerBadges.js`** vergibt „Günstigste"/„Schnellste" nur noch unter
  bereits verfügbaren (`availableForDate !== false`) Angeboten.
- Governance: `src/styles/shippingProcess.test.mjs` (Quelltext) und
  `tests/e2e/shippingProcessPaketB.test.mjs` (echter Dev-Server) sichern App-
  Shell-Einbindung, Badge-Logik, JUMiNGO-Payload-Felder, Konfliktdialoge und
  Tastaturbedienung gegen Regression ab.

## ConfidaraExpress — Buchung, Preise & Jumingo

- **Frontend ersetzt keine serverseitige Prüfung.** Preis-, Tarif-, Auth-, Zahlungs- und Buchungsvalidierung passieren im Backend — das Frontend prüft sie nie ersatzweise.
- **Preise/Tarife nur anzeigen**, niemals als Quelle der Wahrheit behandeln oder clientseitig berechnen/überschreiben.
- **Keine geratenen Jumingo-Daten:** Felder, Tarife, `serviceType`, `pickup`/`dropoff`, Access-Point-/Paketshop-Daten nicht erfinden — nur belegte Werte verwenden.

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
