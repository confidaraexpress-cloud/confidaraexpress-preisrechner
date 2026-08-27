// Governance für Paket C — Verwaltung und Abrechnung.
//
// Geprüft wird die Migration von Sendungen, Sendungsdetails, Entwürfen,
// Tracking (intern + öffentlich), Adressbuch, Rechnungen und der PDF-Vorschau
// auf die Paket-A-Primitives/-Muster — UND, ebenso wichtig, dass dabei keine
// Business-, API- oder Statuslogik angefasst wurde. Reine Quelltextprüfung
// (kein DOM); die Laufzeitseite (Überlauf, Fokusverhalten, Skeleton-statt-
// Datenverlust) ist über manuelle Playwright-Smoke-Checks während der
// Entwicklung abgesichert.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const shipmentsList = read("../components/dashboard/ShipmentsList.jsx");
const trackingPage = read("../pages/TrackingPage.jsx");
const draftsHeader = read("../components/drafts/DraftsHeader.jsx");
const draftsPage = read("../pages/DraftsPage.jsx");
const draftDesktopRow = read("../components/drafts/DraftDesktopRow.jsx");
const draftCard = read("../components/drafts/DraftCard.jsx");
const formDraftDesktopRow = read("../components/drafts/FormDraftDesktopRow.jsx");
const formDraftCard = read("../components/drafts/FormDraftCard.jsx");
const draftActionsMenu = read("../components/drafts/DraftActionsMenu.jsx");
const draftEmptyState = read("../components/drafts/DraftEmptyState.jsx");
const formatters = read("../utils/formatters.js");
const addressBookView = read("../utils/addressBookView.mjs");
// Modularisierungs-Audit: addressBookView.mjs ist seither die Fassade; die
// Funktionskörper wohnen in Fachmodulen. Die beiden Quelltext-Prüfungen dieses
// Tests wandern MIT ihrem Modul um (addressBadgeList → addressMenuView.mjs,
// ROLE_BOTH → addressRoles.mjs); die Fassade wird zusätzlich geprüft, damit die
// Kette Konsument → Fassade → Fachmodul geschlossen bleibt.
const addressMenuView = read("../utils/addressMenuView.mjs");
const addressRoles = read("../utils/addressRoles.mjs");
const addressDesktopRow = read("../components/addressbook/AddressDesktopRow.jsx");
const addressActionsMenu = read("../components/addressbook/AddressActionsMenu.jsx");
const addressList = read("../components/addressbook/AddressList.jsx");
const addressBookPage = read("../pages/AddressBookPage.jsx");
const invoicesList = read("../components/dashboard/InvoicesList.jsx");
const customerInvoiceView = read("../utils/customerInvoiceView.mjs");
const dashboardPage = read("../pages/DashboardPage.jsx");
const dashboardCss = stripComments(read("./dashboard.css"));
const draftsCss = stripComments(read("./drafts.css"));
const addressbookCss = stripComments(read("./addressbook.css"));

/* ══════════ 1 — PageHeader-Eyebrows ═══════════════════════════════════════ */

test("1 — Sendungen, Entwürfe, Adressbuch und Rechnungen tragen die Eyebrow „Verwaltung“", () => {
  assert.match(dashboardPage, /shipments:\s*\{\s*eyebrow:\s*"Verwaltung"/, "Sendungen ohne Eyebrow");
  assert.match(dashboardPage, /invoices:\s*\{\s*eyebrow:\s*"Verwaltung"/, "Rechnungen ohne Eyebrow");
  assert.match(draftsHeader, /eyebrow="Verwaltung"/, "Entwürfe ohne Eyebrow");
  const addressBookHeader = read("../components/addressbook/AddressBookHeader.jsx");
  assert.match(addressBookHeader, /eyebrow="Verwaltung"/, "Adressbuch ohne Eyebrow");
});

/* ══════════ 2 — Sendungen: „Track“ vollständig ersetzt ═══════════════════ */

test("2 — „Track“ ist vollständig durch „Sendung verfolgen“ ersetzt", () => {
  assert.ok(!/>Track</.test(shipmentsList), "der rohe Button-Text „Track“ darf nicht mehr vorkommen");
  // Adressiert wird über den ConfidaraExpress-Sendungshandle (shipments.id),
  // nicht mehr über die Providerreferenz.
  assert.match(shipmentsList, /onTrack\(s\.id\)\}>Sendung verfolgen</);
});

/* ══════════ 3 — Sendungsdetail: Muted Card statt Inline-Style ════════════ */

test("3 — Sendungsdetail nutzt die Muted Card statt eines Inline-Style-Hintergrunds", () => {
  assert.ok(!/style=\{\{ background: "var\(--gray50\)"/.test(shipmentsList), "der alte Inline-Style-Hintergrund darf nicht mehr vorkommen");
  assert.match(shipmentsList, /<td colSpan=\{7\} className="shipment-detail-cell">/);
  assert.match(shipmentsList, /<div className="ce-card-muted shipment-detail-card">/);
  assert.match(dashboardCss, /\.shipment-detail-card \{ padding: 20px 24px; \}/);
});

/* ══════════ 4 — Tracking-Glyphen sind echte Icons ═════════════════════════ */

test("4 — track-dot und step-circle zeigen Icons statt roher „●“/„✓“-Glyphen", () => {
  for (const [datei, quelle] of [["ShipmentsList.jsx", shipmentsList], ["TrackingPage.jsx", trackingPage]]) {
    assert.ok(!/["'`]●["'`]/.test(quelle), `${datei}: rohe „●“-Glyphe noch vorhanden`);
    assert.ok(!/["'`]✓["'`]/.test(quelle), `${datei}: rohe „✓“-Glyphe noch vorhanden`);
  }
  assert.match(shipmentsList, /<Icon n="mapPin" s=\{14\} \/> : <Icon n="check" s=\{14\} \/>/);
  assert.match(trackingPage, /<Icon n="mapPin" s=\{14\} \/> : <Icon n="check" s=\{14\} \/>/);
  assert.match(trackingPage, /\{i < stepIndex \? <Icon n="check" s=\{14\} \/> : i \+ 1\}/);
});

/* ══════════ 5 — track-dot ohne Verlauf/Glow ═══════════════════════════════ */

test("5 — .track-dot ist eine flache Fläche ohne Verlauf oder farbigen Schatten", () => {
  const block = dashboardCss.match(/\.track-dot\.active \{([^}]*)\}/)[1];
  assert.ok(!/gradient/.test(block), "kein linear-gradient mehr im aktiven track-dot");
  assert.ok(!/box-shadow/.test(block), "kein Glow-Schatten mehr im aktiven track-dot");
  const doneBlock = dashboardCss.match(/\.track-dot\.done\s*\{([^}]*)\}/)[1];
  assert.ok(!/box-shadow/.test(doneBlock), "kein Glow-Schatten mehr im erledigten track-dot");
  assert.match(dashboardCss, /\.track-dot\.active \{ border-color: var\(--ce-color-brand\); background: var\(--ce-color-brand\); color: white; \}/);
});

/* ══════════ 6 — Entwürfe: Löschen ist kein Dauerbutton mehr ══════════════ */

test("6 — Löschen läuft in allen vier Entwurfsansichten über das Kebab-Menü, nicht mehr über einen Dauerbutton", () => {
  assert.ok(!/dft-delete-btn/.test(draftsCss), ".dft-delete-btn darf keine Regel mehr haben");
  for (const [datei, quelle] of [
    ["DraftDesktopRow.jsx", draftDesktopRow], ["DraftCard.jsx", draftCard],
    ["FormDraftDesktopRow.jsx", formDraftDesktopRow], ["FormDraftCard.jsx", formDraftCard],
  ]) {
    assert.ok(!/dft-delete-btn/.test(quelle), `${datei}: alter Löschen-Button noch verdrahtet`);
    assert.match(quelle, /<DraftActionsMenu draft=\{draft\}/, `${datei}: nutzt DraftActionsMenu nicht`);
  }
  // Fortsetzen bleibt für Formularentwürfe ein eigener, direkt sichtbarer Button.
  assert.match(formDraftDesktopRow, /dft-resume-btn/);
  assert.match(formDraftCard, /dft-resume-btn/);
});

test("7 — das Entwürfe-Kebab-Menü hat Fokusfalle-Zutaten (Escape, Außenklick, Fokusrückgabe) und einen beschrifteten Trigger", () => {
  assert.match(draftActionsMenu, /e\.key === "Escape"/);
  assert.match(draftActionsMenu, /mousedown/);
  assert.match(draftActionsMenu, /triggerRef\.current\?\.focus\(\)/);
  assert.match(draftActionsMenu, /aria-label="Aktionen für diesen Entwurf"/);
  assert.match(draftActionsMenu, /title="Aktionen"/);
});

/* ══════════ 8 — dtDE() ohne Sekunden ══════════════════════════════════════ */

test("8 — dtDE() formatiert ohne Sekunden (Wert bleibt unverändert, nur die Anzeige ändert sich)", () => {
  const fn = formatters.match(/export const dtDE = \(d\) =>[\s\S]*?: "—"\);/)[0];
  assert.ok(!/second/.test(fn), "dtDE darf keine Sekunden-Option mehr setzen");
  assert.match(fn, /hour: "2-digit", minute: "2-digit"/);
  assert.match(fn, /new Date\(d\)\.toLocaleString/, "dtDE muss weiterhin denselben Zeitpunkt formatieren, nur anders");
});

/* ══════════ 9 — gemeinsame Skeleton-Puls-Technik statt eigenem Shimmer ═══ */

test("9 — Entwürfe- und Adressbuch-Skeleton nutzen dieselbe Puls-Animation wie die Foundation (kein eigener Shimmer mehr)", () => {
  for (const css of [draftsCss, addressbookCss]) {
    assert.ok(!/@keyframes \w+-shimmer/.test(css), "kein bereichseigenes Shimmer-Keyframe mehr");
    assert.match(css, /animation: ce-skeleton-pulse 1\.4s ease-in-out infinite;/);
  }
});

/* ══════════ 10 — Adressbuch-Badges: höchstens drei, über addressBadgeList ═ */

test("10 — AddressBadges rendert über addressBadgeList (höchstens drei Badges, siehe addressBookView.test.mjs)", () => {
  assert.match(addressDesktopRow, /import \{ addressBadgeList \} from "\.\.\/\.\.\/utils\/addressBookView\.mjs"/);
  assert.match(addressDesktopRow, /addressBadgeList\(address\)\.map/);
  assert.ok(!/address\.isDefaultSender && <span/.test(addressDesktopRow), "die alte Vier-Badge-Logik darf nicht wiederkommen");
  assert.match(addressMenuView, /export function addressBadgeList/);
  assert.match(addressBookView, /export \{[\s\S]*?\baddressBadgeList\b[\s\S]*?\} from "\.\/addressMenuView\.mjs"/,
    "die Fassade reicht addressBadgeList aus addressMenuView.mjs weiter");
});

/* ══════════ 11 — kein outline:none ohne Ersatz in den neuen Kebab-Menüs ═══ */

test("11 — die Kebab-Menüpunkte unterdrücken den Fokusring nicht mehr (kein outline:none ohne Ersatz)", () => {
  const dftItem = draftsCss.match(/\.dft-actions-item:hover,\s*\.dft-actions-item:focus-visible \{([^}]*)\}/)[1];
  assert.ok(!/outline:\s*none/.test(dftItem), "dft-actions-item darf den Fokusring nicht per outline:none entfernen");
  const abkItem = addressbookCss.match(/\.abk-actions-item:hover,\s*\.abk-actions-item:focus-visible \{([^}]*)\}/)[1];
  assert.ok(!/outline:\s*none/.test(abkItem), "abk-actions-item darf den Fokusring nicht per outline:none entfernen");
});

/* ══════════ 12 — gemeinsamer Seitenrahmen (.page-body) ════════════════════ */

test("12 — Entwürfe und Adressbuch laufen durch den gemeinsamen Seitenrahmen (.page-body statt .container)", () => {
  assert.ok(!/className="container dft-wrap"/.test(draftsPage), "Entwürfe: alter .container-Wrapper noch vorhanden");
  assert.ok(!/className="container abk-wrap"/.test(addressBookPage), "Adressbuch: alter .container-Wrapper noch vorhanden");
  assert.match(draftsPage, /<div className="page-body">/);
  assert.match(addressBookPage, /<div className="page-body">/);
  // DashboardPage darf diese Seiten nicht zusätzlich noch einmal in .page-body wickeln
  // (sonst doppelter Rahmen) — PageHeader/Liste bringen ihn jetzt selbst mit.
  assert.ok(!/\{page === "drafts" && \(\s*<div className="page-body">/.test(dashboardPage));
  assert.ok(!/\{page === "addressbook" && \(\s*<div className="page-body">/.test(dashboardPage));
});

/* ══════════ 13 — Rechnungen: redundantes Mikrolabel entfernt ═════════════ */

test("13 — die Rechnungstabelle zeigt „Betrag“ nur noch im Spaltenkopf, nicht zusätzlich pro Zeile", () => {
  const amountBlock = invoicesList.match(/function AmountBlock\(\{ inv \}\) \{([\s\S]*?)\n\}/)[1];
  assert.ok(!/inv-amount-label/.test(amountBlock), "das redundante Zellen-Mikrolabel darf nicht mehr vorkommen");
  assert.match(invoicesList, /<th scope="col">Betrag<\/th>/, "der Spaltenkopf bleibt die einzige Beschriftung");
  assert.ok(!/inv-amount-label/.test(dashboardCss), "die zugehörige CSS-Regel muss mit entfernt sein");
});

/* ══════════ 14 — Rechnungen: gemeinsame Zustandsflächen ═══════════════════ */

test("14 — Rechnungsliste nutzt EmptyState/NoResultsState/ErrorState statt eigenem Markup", () => {
  assert.match(invoicesList, /import \{ EmptyState, NoResultsState, ErrorState \} from "\.\.\/ui\/StateView"/);
  assert.match(invoicesList, /<ErrorState\s/);
  assert.match(invoicesList, /<EmptyState icon="invoice"/);
  assert.match(invoicesList, /<NoResultsState\s/);
});

/* ══════════ 15 — Statussystem-Audit: .inv-status bleibt bewusst eigenständig ═ */

test("15 — .inv-status bleibt eine bewusst dokumentierte Ausnahme (keine stille .badge-Migration); doppelte Hex-Werte verweisen jetzt auf die Foundation", () => {
  // Die Entscheidung steht als Kommentar in customerInvoiceView.mjs UND in
  // dashboard.css (dort im gestrippten CSS logischerweise nicht mehr
  // durchsuchbar) — deshalb hier an der .mjs-Quelle geprüft.
  assert.match(customerInvoiceView, /KEINE/, "die dokumentierte Entscheidung muss im Quelltext stehen bleiben");
  assert.match(customerInvoiceView, /globale \.badge-\*-Migration/, "die dokumentierte Entscheidung muss im Quelltext stehen bleiben");
  assert.match(dashboardCss, /--inv-positive-bg:\s*var\(--ce-color-status-success-surface\);/);
  assert.match(dashboardCss, /--inv-positive-fg:\s*var\(--ce-color-status-success-fg\);/);
  assert.match(dashboardCss, /--inv-critical-bg:\s*var\(--ce-color-status-overdue-surface\);/);
  assert.match(dashboardCss, /--inv-critical-fg:\s*var\(--ce-color-status-overdue-fg\);/);
  // attention/neutral bleiben bewusst eigenständig (kein Foundation-Pendant im selben Wert).
  assert.match(dashboardCss, /--inv-attention-fg:\s*#8a6a3f;/);
  // Die Statuslogik selbst (welcher Backendwert -> welcher Ton) bleibt unverändert.
  assert.match(customerInvoiceView, /if \(inv && inv\.status === "paid"\) return \[TONE\.POSITIVE, "Bezahlt"\];/);
});

/* ══════════ 16 — PDF-Vorschau: XL-Dialogbreite statt hartem Pixelwert ═════ */

test("16 — die PDF-Vorschau nutzt die gemeinsame XL-Dialogbreite und Foundation-Material", () => {
  const block = dashboardCss.match(/\.pdfview-modal \{([\s\S]*?)\}/)[1];
  assert.match(block, /--ce-dialog-width:\s*var\(--ce-size-dialog-xl\);/);
  assert.ok(!/min\(920px/.test(block), "die harte 920px-Notation darf nicht mehr vorkommen");
  assert.ok(!/background:\s*#fff/.test(block), "kein rohes #fff mehr");
  assert.match(block, /background:\s*var\(--ce-color-surface\);/);
  assert.match(block, /border-radius:\s*var\(--ce-radius-xl\);/);
  assert.match(block, /box-shadow:\s*var\(--ce-elevation-3\);/);
});

/* ══════════ 17 — kein rohes weiß mehr in den bereinigten Bereichsdateien ══ */

test("17 — addressbook.css und drafts.css tragen keine rohen #fff/white-Flächenfarben mehr", () => {
  assert.ok(!/background:\s*white\b/.test(addressbookCss), "addressbook.css: rohes „white“ als Hintergrund gefunden");
  assert.ok(!/background:\s*#fff\b/.test(addressbookCss), "addressbook.css: rohes #fff als Hintergrund gefunden");
  assert.ok(!/background:\s*white\b/.test(draftsCss), "drafts.css: rohes „white“ als Hintergrund gefunden");
});

/* ══════════ 18 — Kontrastfix: aktiver Filterchip bleibt auch bei :hover lesbar ═ */

test("18 — .inv-filter-chip--active bleibt bei :hover lesbar (Regressionsschutz für den gefundenen Kontrastfehler)", () => {
  assert.match(dashboardCss, /\.inv-filter-chip--active:hover \{ color: var\(--ce-color-text-inverse\); \}/,
    "ohne diese Regel wird der aktive Filterchip bei :hover unsichtbar (Navy auf Navy)");
});

/* ══════════ 19 — Adressbuch-Suche wischt die sichtbare Liste nicht weg ════ */

test("19 — AddressList zeigt das Skeleton nur bei echter Erstladung, nicht bei jedem Such-Refresh", () => {
  assert.match(addressList, /if \(loading && items\.length === 0\) return <AddressSkeleton \/>;/);
});

/* ══════════ 20 — Icon-Farbfix: kein rohes Hex mehr im Tracking-Icon ═══════ */

test("20 — TrackingPage nutzt für das Kartenicon einen Foundation-Token statt eines rohen Hex-Werts", () => {
  assert.ok(!/c="#1D4ED8"/.test(trackingPage), "das rohe Blau muss durch einen Token ersetzt sein");
  assert.match(trackingPage, /c="var\(--ce-color-brand-ink\)"/);
});

/* ══════════ 21 — TrackingPage bleibt ohne PageHeader (kein doppelter Kopf) ═ */

test("21 — TrackingPage rendert weiterhin ihre eigene Überschrift statt eines PageHeaders", () => {
  assert.ok(!/from ["']\.\.\/components\/ui\/PageHeader["']/.test(trackingPage), "TrackingPage darf keinen PageHeader importieren");
  assert.match(trackingPage, /<h1 className="section-title">Sendung verfolgen<\/h1>/);
});

/* ══════════ 22 — Adressbuch-Kebab-Trigger ist vollständig beschriftet ═════ */

test("22 — der Adressbuch-Kebab-Trigger trägt sowohl aria-label als auch title", () => {
  const trigger = addressActionsMenu.match(/<button[\s\S]*?abk-actions-trigger[\s\S]*?<\/button>/)[0];
  assert.match(trigger, /aria-label=\{/);
  assert.match(trigger, /title="Aktionen"/);
});

/* ══════════ 23 — Business-/API-Verträge unverändert ═══════════════════════ */

test("23 — Business-Nummernkreise, JUMiNGO-Felder und Zahlungsstatuslogik sind unverändert nachweisbar", () => {
  assert.match(shipmentsList, /customerShipmentNumbers\(s\)/);
  // Die Sendungsliste adressiert ausschließlich über den CE-Handle; die
  // Providerreferenz kommt in ihr nicht mehr vor (White Label + Providerwechsel).
  assert.ok(!/s\.jumingo_shipment_id/.test(shipmentsList),
    "die Sendungsliste darf die Providerreferenz nicht mehr verwenden");
  // Die dokumentbezogene Aktion der Liste ist seit dem Dokumente-Drawer EINE
  // zentrale Aktion („Dokumente") statt eines Knopfes je Dokumenttyp; sie hängt
  // unverändert am CE-Handle der Zeile.
  assert.match(shipmentsList, /onDocuments=\{setDocumentsShipment\}/);
  assert.match(shipmentsList, /shipmentId=\{documentsShipment\.id\}/);
  // Die Rechnungsliste zeigt kundenseitig KEINE Vorgangsnummer mehr: weder die
  // Auftragsbestätigungsnummer (CE-AB…) noch die interne Bestellnummer (CE-BS…).
  // Beide bleiben backendseitig, im PDF-Metablock und in der Adminsicht erhalten.
  // Gescannt wird der CODE, nicht die Begründung darüber: der Kommentar an der
  // betroffenen Stelle nennt den entfernten Aufruf ausdrücklich, damit niemand ihn
  // versehentlich zurückholt. Ein Scan über den Rohtext verwechselte ihn mit dem Verstoß.
  const invoicesListCode = invoicesList
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/orderConfirmationNumberOf|business_order_number/.test(invoicesListCode),
    "die Kundenrechnungsliste zeigt wieder eine Vorgangsnummer");
  assert.match(customerInvoiceView, /isOverdueInvoice\(inv\)/);
  assert.match(addressRoles, /export const ROLE_BOTH = "both";/);
  assert.match(addressBookView, /export \{[\s\S]*?\bROLE_BOTH\b[\s\S]*?\} from "\.\/addressRoles\.mjs"/,
    "die Fassade reicht ROLE_BOTH aus addressRoles.mjs weiter");
});
