// ─────────────────────────────────────────────────────────────────────────────
// Admin-Kundenverwaltung — reine, framework-freie Anzeige- und Ablauflogik.
//
// Bündelt alles, was an Kundenliste und Kundendetail testbar ist: Feldlesung,
// lokale Suche/Filter, Aktionsmodell der Zeile, statusabhängige Texte, das
// Lösch-Gate und der Selbstschutz des angemeldeten Admins. Kein React, kein
// Netzwerk, kein State.
//
// GESCHÄFTSREGELN (unverändert, hier nur abgebildet):
//   • ConfidaraExpress ist reines B2B — es gibt keine Privatkunden.
//   • Es gibt KEIN Kreditlimit und KEINE automatische Sperrung bei Zahlungsverzug.
//   • Das Zahlungsziel beträgt für alle Kunden sieben Tage NACH RECHNUNGSERHALT
//     (nicht nach Rechnungsdatum). Der Wortlaut kommt aus utils/paymentTerm.mjs.
//   • Offene/überfällige Rechnungen blockieren Buchungen NICHT automatisch; ein
//     Kunde wird ausschließlich manuell durch einen Admin blockiert.
//   • Vor jeder echten Transition nach „approved" muss ein individueller
//     Kundenaufschlag bestätigt sein (Gate in utils/customerMarkup.mjs).
//
// AUTORITÄT: Das Backend bleibt in allem verbindlich. Alles hier dient der
// Bedienbarkeit — es ist ausdrücklich KEIN Sicherheitsersatz.
// ─────────────────────────────────────────────────────────────────────────────

import { isApprovalBlocked, missingB2BAccountFields } from "./b2bAccount.mjs";
import { PAYMENT_TERM_DAYS, paymentTermLabel } from "./paymentTerm.mjs";

const firstDefined = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== "");

const str = (v) => (v === null || v === undefined ? "" : String(v).trim());

// ── Feldlesung ──────────────────────────────────────────────────────────────
// NUR erlaubte Felder. password/password_hash/token/secret werden bewusst NIE
// gelesen — kein Object.keys, kein Spread des ganzen Objekts. Die Aliasse
// entsprechen exakt denen, die Liste und Detail bisher schon nutzten.
export function customerFields(user) {
  const u = user && typeof user === "object" ? user : {};
  return {
    id: firstDefined(u.id, u.user_id, u.uuid) ?? null,
    name: str(firstDefined(u.name, u.full_name, u.contact_name)),
    company: str(firstDefined(u.company_name, u.company, u.firma)),
    email: str(firstDefined(u.email, u.e_mail)),
    status: str(firstDefined(u.status, u.state)),
    role: str(firstDefined(u.role)),
    vatId: str(firstDefined(u.vat_id, u.vatId, u.ust_id)),
    createdAt: firstDefined(u.created_at, u.createdAt, u.created) ?? null,
    // Kundennummer ausschließlich aus dem fachlichen Feld — NIE aus der internen ID.
    customerNumber: str(firstDefined(u.customer_number, u.customerNumber)),
  };
}

// Anzeigename der Zeile: Firma zuerst, sonst Ansprechpartner, sonst Kundennummer.
// Nie die interne ID als Identität — sie ist ein rein technischer Schlüssel.
export function customerDisplayName(user) {
  const f = customerFields(user);
  return f.company || f.name || f.customerNumber || "Unbekannter Kunde";
}

export const isAdminAccount = (user) => customerFields(user).role === "admin";

// ── Kundennummer im Kundendetail ────────────────────────────────────────────
// Das Detail liefert { user, summary }. Die Kundennummer wird zuerst im
// user-Objekt gesucht und — falls der Endpunkt sie neben `user` in der Hülle
// führt — auch dort. Es wird ausschließlich das fachliche Feld gelesen
// (customer_number / customerNumber); es wird nie eine Nummer aus der internen
// ID abgeleitet, erfunden oder hart kodiert.
export function customerNumberFromDetail(payload, user) {
  const fromUser = customerFields(user).customerNumber;
  if (fromUser) return fromUser;
  const d = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const envelope = str(firstDefined(d.customer_number, d.customerNumber));
  return envelope || "";
}

// ── Status ──────────────────────────────────────────────────────────────────
// Einheitliche deutsche Begriffe — dieselbe Bezeichnung überall (Liste, Detail,
// Filter, Dialoge). Die Badge-Klassen kommen weiterhin aus utils/adminUsers.js.
export const STATUS_FILTER_OPTIONS = Object.freeze([
  Object.freeze({ value: "all", label: "Alle" }),
  Object.freeze({ value: "pending", label: "Ausstehend" }),
  Object.freeze({ value: "approved", label: "Freigegeben" }),
  Object.freeze({ value: "blocked", label: "Blockiert" }),
  Object.freeze({ value: "anonymized", label: "Anonymisiert" }),
]);

export const DEFAULT_FILTERS = Object.freeze({ query: "", status: "all" });

// ── Lokale Suche und Filter ─────────────────────────────────────────────────
// Das Backend bietet für GET /admin/users KEINE Server-Filter (nur limit/offset).
// Gesucht und gefiltert wird deshalb ausschließlich auf der aktuell geladenen
// Seite — die Oberfläche sagt das ausdrücklich. Es werden KEINE Backendparameter
// erfunden.
export const SEARCHABLE_FIELDS = Object.freeze(["company", "name", "email", "vatId", "customerNumber"]);

export function matchesQuery(user, query) {
  const q = str(query).toLowerCase();
  if (q === "") return true;
  const f = customerFields(user);
  return SEARCHABLE_FIELDS.some((key) => f[key] && f[key].toLowerCase().includes(q));
}

export function matchesStatus(user, status) {
  const want = str(status) || "all";
  if (want === "all") return true;
  return customerFields(user).status === want;
}

export function filterCustomerRows(rows, filters = DEFAULT_FILTERS) {
  const list = Array.isArray(rows) ? rows : [];
  const { query = "", status = "all" } = filters || {};
  return list.filter((u) => matchesStatus(u, status) && matchesQuery(u, query));
}

export function hasActiveFilters(filters = DEFAULT_FILTERS) {
  const { query = "", status = "all" } = filters || {};
  return str(query) !== "" || (str(status) !== "" && str(status) !== "all");
}

// Beschreibt die aktiven Filter als Chips — sichtbar und einzeln entfernbar.
export function activeFilterChips(filters = DEFAULT_FILTERS) {
  const { query = "", status = "all" } = filters || {};
  const chips = [];
  if (str(query) !== "") chips.push({ key: "query", label: `Suche: „${str(query)}“` });
  if (str(status) !== "" && str(status) !== "all") {
    const opt = STATUS_FILTER_OPTIONS.find((o) => o.value === status);
    chips.push({ key: "status", label: `Status: ${opt ? opt.label : status}` });
  }
  return chips;
}

// Leerzustände klar unterscheiden: „noch gar keine Kunden" ist etwas anderes als
// „für diese Suche und Filter nichts gefunden".
export function listEmptyState({ loadedCount = 0, filteredCount = 0, filters = DEFAULT_FILTERS } = {}) {
  if (filteredCount > 0) return { show: false, title: "", text: "" };
  if (loadedCount === 0) {
    return { show: true, title: "Noch keine Kunden vorhanden.", text: "Sobald sich Unternehmen registrieren, erscheinen sie hier." };
  }
  if (hasActiveFilters(filters)) {
    return {
      show: true,
      title: "Für diese Suche und die gewählten Filter wurden keine Kunden gefunden.",
      text: "Die Suche wirkt nur auf die aktuell angezeigte Seite. Setzen Sie die Filter zurück oder blättern Sie weiter.",
    };
  }
  return { show: true, title: "Keine Kunden auf dieser Seite.", text: "Blättern Sie weiter, um weitere Kunden zu sehen." };
}

// ── Selbstschutz des angemeldeten Admins ────────────────────────────────────
// Rein aus dem Vergleich der Kontokennungen abgeleitet (der AuthContext kennt
// den angemeldeten Admin über GET /kundenbereich). Das verhindert die häufigste
// Fehlbedienung — es ersetzt KEINEN serverseitigen Schutz.
export function isSelfAccount(user, currentAdminId) {
  const id = customerFields(user).id;
  if (id === null || currentAdminId === null || currentAdminId === undefined || currentAdminId === "") return false;
  return String(id) === String(currentAdminId);
}

export const SELF_ACTION_REASON = "Sie können Ihr eigenes Adminkonto hier nicht ändern.";

// Fehlende B2B-Stammdaten sperren AUSSCHLIESSLICH die Freischaltung — Blockieren
// bleibt jederzeit möglich. Der Grund wird sichtbar benannt, statt einen Eintrag
// kommentarlos zu deaktivieren. Verbindlich bleibt der serverseitige Guard (409).
export function approvalBlockReason(user) {
  if (!isApprovalBlocked(user)) return "";
  const missing = missingB2BAccountFields(user).map((f) => f.missingText).join(" · ");
  return `${missing} — die Freischaltung wird serverseitig abgelehnt, solange diese Angaben fehlen.`;
}

// ── Aktionsmodell der Kundenzeile ───────────────────────────────────────────
// „Details" ist die primäre, immer sichtbare Aktion. Statuswechsel und die
// gefährlichen Aktionen liegen im Menü; „Blockieren" ist ausdrücklich NICHT
// mehr die dominante Aktion jeder freigegebenen Zeile.
//
// → [{ key, label, icon, danger, separatorBefore, disabled, reason }]
export function buildCustomerMenuModel({ user, currentAdminId = null } = {}) {
  const f = customerFields(user);
  const self = isSelfAccount(user, currentAdminId);
  const items = [{ key: "details", label: "Details öffnen", icon: "arrowRight", danger: false, separatorBefore: false, disabled: false, reason: "" }];

  // Die B2B-Sperre gilt NUR für das Ziel „approved" — nie für das Blockieren.
  const b2bReason = approvalBlockReason(user);
  const approveReason = self ? SELF_ACTION_REASON : b2bReason;
  const approveDisabled = self || b2bReason !== "";

  if (f.status === "pending") {
    items.push({
      key: "approve", label: "Kunde freischalten", icon: "check",
      danger: false, separatorBefore: true, disabled: approveDisabled, reason: approveReason,
    });
  } else if (f.status === "blocked") {
    items.push({
      key: "approve", label: "Kunde reaktivieren", icon: "check",
      danger: false, separatorBefore: true, disabled: approveDisabled, reason: approveReason,
    });
  } else if (f.status === "approved") {
    items.push({
      key: "block", label: "Kunde blockieren", icon: "lock",
      danger: true, separatorBefore: true, disabled: self, reason: self ? SELF_ACTION_REASON : "",
    });
  }
  // „anonymized": bewusst keine Statusaktion — das Konto ist ein Tombstone.
  return items;
}

// Kurzer, sichtbarer Hinweis statt einer stumm fehlenden Aktion.
export function statusActionNote(user) {
  const f = customerFields(user);
  if (f.status === "anonymized") return "Anonymisierte Konten haben keine Statusaktion.";
  return "";
}

// ── Statusabhängige Texte im Kundendetail ───────────────────────────────────
// Die Überschrift muss zum tatsächlichen Status passen: ein freigeschalteter
// Kunde darf nie „Kunde freischalten" als Überschrift tragen.
//
// → { title, description, hint, actionLabel, actionKind }
//   actionLabel === null heißt: keine Statusaktion in diesem Bereich.
export function accountStatusCopy(status) {
  switch (str(status)) {
    case "approved":
      return {
        title: "Kunde ist freigeschaltet",
        description: "Dieser Kunde ist freigeschaltet und kann ConfidaraExpress nutzen.",
        hint: "",
        actionLabel: "Kunde blockieren",
        actionKind: "block",
      };
    case "blocked":
      return {
        title: "Kunde reaktivieren",
        description: "Dieser Kunde ist blockiert und kann derzeit keine neuen Sendungen buchen.",
        hint: "Vor der Reaktivierung muss ein individueller Kundenaufschlag bestätigt sein.",
        actionLabel: "Kunde reaktivieren",
        actionKind: "approve",
      };
    case "pending":
      return {
        title: "Kunde freischalten",
        description: "Dieser Kunde wartet auf die Freischaltung und kann ConfidaraExpress noch nicht nutzen.",
        hint: "Vor der Freischaltung muss ein individueller Kundenaufschlag bestätigt sein.",
        actionLabel: "Kunde freischalten",
        actionKind: "approve",
      };
    case "anonymized":
      return {
        title: "Konto anonymisiert",
        description: "Die personenbezogenen Kontodaten wurden dauerhaft entfernt. Sendungen und Rechnungen bleiben aus Nachweisgründen erhalten.",
        hint: "",
        actionLabel: null,
        actionKind: null,
      };
    default:
      return {
        title: "Kontostatus unbekannt",
        description: "Der Status dieses Kontos konnte nicht eindeutig gelesen werden.",
        hint: "",
        actionLabel: null,
        actionKind: null,
      };
  }
}

// Anforderungstext des Aufschlags-Gates — je nachdem, ob freigeschaltet oder
// reaktiviert wird. Wortgleich zwischen Aufschlagsbereich und Statusbereich.
export function markupRequirementText(status) {
  return str(status) === "blocked"
    ? "Vor der Reaktivierung muss ein individueller Kundenaufschlag festgelegt und bestätigt werden."
    : "Vor der Freischaltung muss ein individueller Kundenaufschlag festgelegt und bestätigt werden.";
}

// ── Aktivität und Zahlung ───────────────────────────────────────────────────
// EINE Quelle für die Debitorenwerte — sie standen bisher doppelt in „Zahlung"
// und „Aggregierte Kennzahlen". Reine Information: kein Kreditlimit, keine
// automatische Sperre, kein individuelles Zahlungsziel.
// Der Wortlaut kommt aus der EINEN zentralen Quelle. Er nennt seit dem Wechsel des
// Bezugspunkts auch, WOVON gezählt wird: vom Rechnungserhalt, nicht vom Rechnungsdatum.
export const PAYMENT_TERM_TEXT = paymentTermLabel(PAYMENT_TERM_DAYS);

export function activityMetrics(summary) {
  const s = summary && typeof summary === "object" ? summary : {};
  const numOrNull = (...vals) => {
    const v = firstDefined(...vals);
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const overdue = numOrNull(s.invoices_overdue, s.invoicesOverdue);
  return {
    shipmentsTotal: numOrNull(s.shipments_total, s.shipmentsTotal),
    invoicesTotal: numOrNull(s.invoices_total, s.invoicesTotal),
    invoicesUnpaid: numOrNull(s.invoices_unpaid, s.invoicesUnpaid),
    invoicesOverdue: overdue,
    openAmount: numOrNull(s.open_amount, s.openAmount),
    // Nur Hervorhebung in der Anzeige — löst NICHTS aus.
    hasOverdue: overdue !== null && overdue > 0,
  };
}

// Überfällige Rechnungen sind sichtbar, aber ausdrücklich ohne Automatik.
export const OVERDUE_NOTE =
  "Überfällige Rechnungen blockieren Buchungen nicht automatisch. Ein Konto wird ausschließlich manuell blockiert.";

// ── Lösch-Gate ──────────────────────────────────────────────────────────────
// Das Backend lehnt die harte Löschung bei abhängigen Sendungs-/Rechnungsdaten
// mit 409 ab. Sind diese Daten bereits bekannt, darf die Oberfläche die Aktion
// nicht so darstellen, als wäre sie zulässig.
//
// → { allowed, known, reason }
export function deleteEligibility(summary) {
  const m = activityMetrics(summary);
  const known = m.shipmentsTotal !== null || m.invoicesTotal !== null;
  const hasData = (m.shipmentsTotal !== null && m.shipmentsTotal > 0)
    || (m.invoicesTotal !== null && m.invoicesTotal > 0);
  if (hasData) {
    return {
      allowed: false,
      known: true,
      reason: "Dieser Kunde kann nicht gelöscht werden, da Sendungs- oder Rechnungsdaten vorhanden sind. "
        + "Verwenden Sie bei Bedarf die Anonymisierung.",
    };
  }
  return { allowed: true, known, reason: "" };
}

// ── Erfolgsmeldungen ────────────────────────────────────────────────────────
// Einheitliche Formulierungen — nie vor einer erfolgreichen Backendantwort.
export const SUCCESS_MESSAGES = Object.freeze({
  approved: "Kunde freigeschaltet",
  reactivated: "Kunde reaktiviert",
  blocked: "Kunde blockiert",
  markupConfirmed: "Aufschlag bestätigt",
  markupUpdated: "Aufschlag aktualisiert",
  anonymized: "Kunde anonymisiert",
  deleted: "Kunde gelöscht",
  unchanged: "Status war bereits gesetzt.",
});

export function statusSuccessMessage(targetStatus, previousStatus) {
  if (targetStatus === "blocked") return SUCCESS_MESSAGES.blocked;
  if (targetStatus === "approved") {
    return previousStatus === "blocked" ? SUCCESS_MESSAGES.reactivated : SUCCESS_MESSAGES.approved;
  }
  return "";
}

// ── Blockierungsdialog ──────────────────────────────────────────────────────
export const BLOCK_DIALOG = Object.freeze({
  title: "Kundenkonto blockieren?",
  text: "Der Kunde kann danach keine neuen Sendungen mehr buchen. Bestehende Sendungen und Rechnungen "
    + "bleiben erhalten. Die Aktion wird protokolliert.",
  cancel: "Abbrechen",
  confirm: "Kunde blockieren",
});
