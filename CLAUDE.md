# ConfidaraExpress — Preisrechner Frontend

B2B-Versandplattform. React 18 + Vite SPA. Kein TypeScript. Backend-API ist extern (nicht in diesem Repo).

## Mission & oberste Priorität

Oberste Priorität: **zuverlässige, korrekte Buchungen über ConfidaraExpress** — für **Abholung/Pickup** *und* **Paketshop/Dropoff**. **Jumingo-Parität** ist dabei kritisch: Felder, Werte und Abläufe müssen exakt dem entsprechen, was Backend/Jumingo erwartet. Funktionierende Buchungen haben Vorrang vor Eleganz und Refactors. Die konkreten Buchungsregeln stehen unter „ConfidaraExpress — Buchung, Preise & Jumingo".

## Tech Stack

- **Framework:** React 18, Vite
- **Routing:** React Router v7 (alle Pages lazy-loaded via `React.lazy`)
- **Styling:** Reines CSS, modular (`src/styles/index.css` importiert alle 11 Dateien)
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
├── styles/                   # 11 CSS-Dateien (variables → globals → ... → dashboard-premium)
├── utils/                    # formatters.js, countries.js
└── assets/carriers/          # SVG-Carrier-Logos (statisch importiert)
```

## CSS-Architektur — kritisch

Drei voneinander isolierte Theme-Schichten:

| Schicht | Präfix | Datei | Gilt für |
|---------|--------|-------|----------|
| App-Chrome „Executive Graphite + Porcelain" | `--ce-app-*`, `--ce-sidebar-*` | `variables.css` → `dashboard-premium.css` | Hintergrund + Sidebar des eingeloggten Bereichs |
| App-Inhaltsflächen | `--surface*`, `--border-*`, `--text-*`, `--accent-blue*`, `--shadow-card*` | `variables.css` | Karten, Tabellen, Seitenköpfe im eingeloggten Bereich |
| Legacy-Light | `--navy`, `--gray*`, `--blue*` | `variables.css` | Booking, Legal, Offer-/Preisrechnerkarten |
| Auth-Theme | `--auth-*` | `auth.css` | AuthPage, Login, Register |
| Admin | `--adm-*` / `.adm-*` | `admin.css` | Adminbereich (eigene Shell) |

**Token-Systeme niemals vermischen.** `.auth-*`-Klassen gehören ausschließlich in Auth-Komponenten, `.adm-*` ausschließlich in den Adminbereich.

Neue Flächen im eingeloggten Bereich immer über die App-Layout-Tokens bauen
(`--surface`, `--border-subtle`, `--shadow-card`) — keine eigenen Hex-Werte,
keine neuen Verläufe, kein Blau als Fläche.

**Chrome-Farben stehen ausschließlich in `variables.css`.** In den Shell- und
Sidebar-Regeln von `dashboard-premium.css` dürfen keine Farbliterale auftauchen
— `appShellChrome.test.mjs` prüft das (samt WCAG-AA-Kontrasten) automatisch.

### CSS-Import-Reihenfolge — kritisch

`src/styles/index.css` importiert alle Stylesheets in fester Reihenfolge.
Entscheidend ist nur: `dashboard-premium.css` steht **nach** `dashboard.css`
(es überschreibt dessen Basisregeln gezielt), und die isolierten Bereichs-
Stylesheets (`admin.css`, `addressbook.css`, `drafts.css`, `cancellation.css`,
`email-change.css`, `overview.css`) stehen danach — sie sind reine
Zusatz-Scopes ohne Kollision.

Neue Bereichs-Stylesheets ans Ende anhängen; Änderungen an gemeinsamen
Oberflächen gehören nach `variables.css` / `dashboard-premium.css`.

## App-Layout „Executive Graphite + Porcelain" — wichtigste Regel

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
  genommen — die Grundfläche ist bewusst überall dieselbe Porcelain-Rampe
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
- Die Sidebar ist matter Graphit (`--ce-sidebar-bg-*`), niemals schwarz und
  niemals glasig. Firmenkarte, Supportkarte und Navigation teilen sich EINE
  Materialsprache (`--ce-sidebar-surface`, `--ce-sidebar-border`, kein Schatten).
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

Entwicklung läuft auf `claude/refine-executive-sidebar-background`. Nicht auf `main` pushen ohne explizite Freigabe.

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
