// utils/adminBillingModeRequests.mjs — Anträge auf Sammelrechnung im Adminbereich (P5, Canonical v2.111).
//
// REIN: kein Netz, kein Storage, kein React. Liste (/admin/billing-mode-requests) und Kundendetail lesen ihre
// Aussagen von hier. Entschieden wird ausschließlich serverseitig (Rolle, Status unter Sperre, Verfügbarkeit);
// diese Datei verhindert nur Versuche, die der Server ohnehin ablehnen würde, und formuliert die Zustände.

import { BILLING_MODE_REJECTION_REASON_MAX } from "./billingModeView.mjs";
import { statusFallback } from "./statusFallback.mjs";

export const ADMIN_BILLING_MODE_REQUESTS_PATH = "/admin/billing-mode-requests";

// [badge-Klasse, Label] — derselbe Satz Badgefarben wie bei den Stornierungsanfragen. Unbekannt: der zentrale
// Rückfall („Unbekannter Status“, Rohwert nur an dritter Stelle).
const STATUS_META = {
  pending: ["badge-yellow", "Offen"],
  approved: ["badge-green", "Genehmigt"],
  rejected: ["badge-red", "Abgelehnt"],
  withdrawn: ["badge-gray", "Zurückgezogen"],
};
export function billingModeRequestStatusMeta(status) {
  return STATUS_META[status] || statusFallback(status);
}

export const BILLING_MODE_REQUEST_FILTER_OPTIONS = [
  { value: "pending", label: "Offen" },
  { value: "all", label: "Alle" },
  { value: "approved", label: "Genehmigt" },
  { value: "rejected", label: "Abgelehnt" },
  { value: "withdrawn", label: "Zurückgezogen" },
];

export const ADMIN_BILLING_REQUEST_TEXT = {
  pageTitle: "Sammelrechnungsanträge",
  pageSubtitle: "Anträge auf die Sammelrechnung alle 7 Tage. Entschieden wird im Kundendetail; eine Genehmigung gilt für künftige Buchungen und stellt keine Rechnung aus.",
  listError: "Die Anträge konnten nicht geladen werden.",
  emptyPending: { title: "Keine offenen Anträge", text: "Neue Anträge erscheinen hier und unter „Zu erledigen“ in der Übersicht." },
  emptyOther: { title: "Keine Anträge", text: "Für diesen Filter gibt es keine Anträge." },
  review: "Prüfen",
  sectionTitle: "Antrag auf Sammelrechnung",
  pendingSince: (datum) => `beantragt am ${datum}`,
  customerNote: "Begründung des Kunden",
  noCustomerNote: "Keine Begründung angegeben.",
  approve: "Genehmigen",
  approving: "Wird genehmigt…",
  approveConfirmTitle: "Sammelrechnung genehmigen?",
  approveConfirmText: "Das Konto wird sofort auf die 7-Tage-Sammelrechnung umgestellt. Sie gilt für alle künftigen Buchungen; bereits gebuchte Sendungen behalten ihre Abrechnungsart. Es wird keine Rechnung ausgestellt.",
  approveConfirmLabel: "Genehmigen",
  approved: "Antrag genehmigt. Das Konto nutzt jetzt die Sammelrechnung.",
  approvalUnavailable: "Genehmigen ist erst möglich, wenn Sammelrechnungen freigegeben sind (Sammelrechnungslauf und reguläre Rechnungsstellung). Der Antrag bleibt bis dahin offen; ablehnen ist jederzeit möglich.",
  reject: "Ablehnen",
  rejecting: "Wird abgelehnt…",
  rejectLabel: "Ablehnungsgrund",
  rejectHint: "Pflichtangabe, höchstens 300 Zeichen. Der Kunde sieht diesen Text.",
  rejected: "Antrag abgelehnt.",
  history: "Frühere Anträge",
  noRequests: "Dieses Konto hat keinen Antrag auf Sammelrechnung gestellt.",
  loadError: "Die Anträge dieses Kontos konnten nicht geladen werden.",
  decideError: "Die Entscheidung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
  decidedBy: (name) => `von ${name}`,
  auditLink: "Verlauf im Protokoll",
};

// Ablehnungsgrund: Pflicht, nach dem Trimmen 1–300 Zeichen (Codepunkte wie der Server).
export function validateRejectionReasonInput(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text === "") return { ok: false, error: "Bitte geben Sie einen Ablehnungsgrund an." };
  if (Array.from(text).length > BILLING_MODE_REJECTION_REASON_MAX) {
    return { ok: false, error: `Der Ablehnungsgrund darf höchstens ${BILLING_MODE_REJECTION_REASON_MAX} Zeichen lang sein.` };
  }
  return { ok: true, reason: text };
}

// Eine Zeile der Serverantwort, defensiv gelesen. Unbekannte Form: `null` (wird nicht angezeigt).
export function normalizeAdminBillingModeRequest(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const id = Number(raw.id);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const text = (v) => (typeof v === "string" && v.trim() !== "" ? v : null);
  const c = raw.customer && typeof raw.customer === "object" ? raw.customer : null;
  return {
    id,
    userId: Number.isSafeInteger(Number(raw.userId)) ? Number(raw.userId) : null,
    status: typeof raw.status === "string" ? raw.status : null,
    customerNote: text(raw.customerNote),
    decisionNote: text(raw.decisionNote),
    requestedAt: text(raw.requestedAt),
    decidedAt: text(raw.decidedAt),
    withdrawnAt: text(raw.withdrawnAt),
    decidedBy: raw.decidedBy && typeof raw.decidedBy === "object" ? { id: raw.decidedBy.id ?? null, name: text(raw.decidedBy.name) } : null,
    customer: c ? {
      id: c.id ?? null, company: text(c.company), contactName: text(c.contactName), email: text(c.email),
      customerNumber: text(c.customerNumber), billingMode: text(c.billingMode),
    } : null,
  };
}

// Firma primär, Ansprechpartner/Kundennummer sekundär — nie allein die interne Kennung.
export function billingModeRequestCustomerCell(row) {
  const c = row && row.customer;
  if (!c) return { primary: "Unbekanntes Konto", secondary: null, known: false };
  const primary = c.company || c.contactName || c.email || "Konto ohne Namen";
  const secondary = [c.customerNumber, c.company && c.contactName ? c.contactName : null].filter(Boolean).join(" · ") || null;
  return { primary, secondary, known: true };
}

// Der offene Antrag eines Kontos (höchstens einer, serverseitig garantiert) und die übrigen als Verlauf.
export function splitAccountRequests(requests) {
  const list = (Array.isArray(requests) ? requests : []).map(normalizeAdminBillingModeRequest).filter(Boolean);
  return { pending: list.find((r) => r.status === "pending") || null, history: list.filter((r) => r.status !== "pending") };
}

export function billingModeRequestEmptyState(status) {
  return status === "pending" ? ADMIN_BILLING_REQUEST_TEXT.emptyPending : ADMIN_BILLING_REQUEST_TEXT.emptyOther;
}
