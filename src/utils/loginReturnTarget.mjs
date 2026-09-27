// ── Rücksprung nach dem Login — ausschließlich auf erlaubte interne Ziele ─────
//
// Öffnet jemand eine geschützte Adresse ohne gültige Sitzung (Lesezeichen,
// Link aus einer Mail, App-Start nach abgelaufener Sitzung), führt die
// Anwendung zur Anmeldung. Nach erfolgreichem Login soll der Kunde dort
// ankommen, wohin er wollte — nicht pauschal auf der Übersicht.
//
// Das Ziel ist eine Eingabe von außen und wird deshalb NIE durchgereicht,
// sondern aus geprüften Bestandteilen NEU zusammengesetzt. Alles, was nicht
// eindeutig ein erlaubtes internes Ziel ist, ergibt `null` (→ Übersicht):
// absolute URLs, protokollrelative `//host`, Backslashes, Steuerzeichen,
// unbekannte Pfade und Queryparameter. Damit entsteht keine Weiterleitung auf
// fremde Seiten (kein Open Redirect).
//
// Bewusst NICHT erlaubt: /booking — der Versandvorgang lebt nur im Speicher
// des Tabs und ist nach einer Neuanmeldung leer; die Übersicht ist dort das
// ehrlichere Ziel. Ebenso wenig die Anmeldeseiten selbst.

const INTERNE_BASIS = "https://ce.invalid";
const ID = /^[1-9][0-9]{0,9}$/;
// Die Bereiche des Dashboards — exakt die Werte von DASHBOARD_PAGES in
// pages/DashboardPage.jsx (ein Paritätstest hält beide gleich). Alles andere
// wäre dort ohnehin verworfen worden; hier wird es gar nicht erst übernommen.
const DASHBOARD_BEREICHE = new Set(["overview", "new", "drafts", "addressbook", "shipments", "invoices", "profile",
  "tracking", "support", "inventory", "products", "stock", "orders", "movements"]);
// Zusatzparameter gelten nur in ihrem Bereich: ein Vorgang gehört zu den
// Supportanfragen (Glockenmeldung), ein Artikelfilter zu den Bewegungen
// („Alle Bewegungen anzeigen"). Dieselbe Zuordnung wie in DashboardPage.
const BEREICHS_PARAMETER = new Map([["support", "ticket"], ["movements", "product"]]);
const ADMIN = /^\/admin(\/[a-z-]{1,40}(\/[A-Za-z0-9-]{1,64})?)?$/;
const INVENTAR = /^\/inventory\/(products|orders)\/[1-9][0-9]{0,9}$/;

/** Liefert das bereinigte interne Ziel oder `null`. */
export function safeReturnTarget(raw) {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;

  let url;
  try {
    url = new URL(raw, INTERNE_BASIS);
  } catch {
    return null;
  }
  if (url.origin !== INTERNE_BASIS) return null;

  const pfad = url.pathname;
  if (pfad === "/dashboard") {
    // Nur die Parameter des bestehenden Deep-Link-Modells, jeweils geprüft:
    // ein existierender Bereich und höchstens SEIN Zusatzparameter. Ein
    // unbekannter Bereich ergibt die Übersicht.
    const out = new URLSearchParams();
    const page = url.searchParams.get("page");
    if (page && DASHBOARD_BEREICHE.has(page)) {
      out.set("page", page);
      const parameter = BEREICHS_PARAMETER.get(page);
      const wert = parameter ? url.searchParams.get(parameter) : null;
      if (wert && ID.test(wert)) out.set(parameter, wert);
    }
    const query = out.toString();
    return query ? `/dashboard?${query}` : "/dashboard";
  }
  if (pfad === "/calculator") return "/calculator";
  if (INVENTAR.test(pfad)) return pfad;
  if (ADMIN.test(pfad)) return pfad;
  return null;
}

/** Ziel aus einem Router-/Fensterstandort (pathname + search). */
export function returnTargetFromLocation(loc) {
  if (!loc || typeof loc !== "object") return null;
  return safeReturnTarget(`${loc.pathname || ""}${loc.search || ""}`);
}
