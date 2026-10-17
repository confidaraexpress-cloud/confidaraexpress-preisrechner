// utils/manualInvoiceView.mjs — manuell erstellte Rechnungen im Adminbereich (Auftrag 2 / P1, 2026-10-17).
//
// Framework-frei: Formularzustand ⇄ Backendvertrag (routes/admin/manualInvoices.js), Eingabeprüfung der Zahlformen,
// Texte, Sperren und Fehlerabbildung. Es wird hier NICHTS gerechnet, was auf einem Beleg steht: Netto, Umsatzsteuer
// und Brutto kommen ausschließlich vom Server (lib/manualInvoice.js) — eine zweite Rechenregel im Browser könnte
// um einen Cent abweichen und stünde dann neben einer anderen Zahl auf dem PDF.
//
// Der Client wandelt nur die EINGABEFORM in die Maschinenform: „1.234,56" → 123456 Cent, „1,5" → "1.5".
import { fieldLabel } from "./invoiceBackfillView.mjs";

export const MANUAL_INVOICE_TEXT = Object.freeze({
  newButton: "Neue Rechnung erstellen",
  titleNew: "Neue Rechnung",
  titleDraft: "Rechnungsentwurf",
  subtitle: "Manuell erstellte Rechnung — an einen bestehenden Kunden oder eine externe Firma. Ein Entwurf ist keine Rechnung: er verbraucht keine Nummer und ist keine Forderung.",
  draftsTitle: "Offene Entwürfe",
  draftsEmpty: "Keine offenen Entwürfe.",
  draftsError: "Die Entwürfe konnten nicht geladen werden.",
  recipientTitle: "Empfänger",
  recipientCustomer: "Bestehender Kunde",
  recipientExternal: "Externe Firma ohne Kundenkonto",
  customerSearchLabel: "Kunde suchen",
  customerSearchHint: "Firma, Name, E-Mail oder Kundennummer — ab zwei Zeichen.",
  customerSearchEmpty: "Kein passender Kunde gefunden.",
  customerChosen: "Ausgewählter Kunde",
  customerChange: "Anderen Kunden wählen",
  recipientHint: "Die Empfängerdaten gelten nur für diese Rechnung. Das Kundenkonto bleibt unverändert.",
  serviceTitle: "Leistung",
  positionsTitle: "Positionen",
  addPosition: "Position hinzufügen",
  removePosition: "Position entfernen",
  paymentTitle: "Zahlung und Texte",
  totalsTitle: "Summen",
  totalsHint: "Netto, Umsatzsteuer und Brutto berechnet der Server beim Speichern.",
  unsavedHint: "Ungespeicherte Änderungen — die Summen gelten für die zuletzt gespeicherte Fassung.",
  save: "Entwurf speichern",
  saving: "Wird gespeichert …",
  saved: "Entwurf gespeichert.",
  preview: "Vorschau ansehen",
  previewTitle: "Vorschau — Entwurf, keine Rechnung",
  issue: "Rechnung ausstellen …",
  discard: "Entwurf verwerfen",
  discardTitle: "Entwurf verwerfen?",
  discardText: "Der Entwurf wird gelöscht. Es entsteht keine Rechnung und keine Nummer.",
  issueTitle: "Rechnung jetzt ausstellen?",
  issueText: "Die Rechnung erhält die nächste Nummer aus dem Rechnungskreis und ist danach unveränderlich. Es wird keine E-Mail versendet — Download, Druck und E-Mail-Versand sind anschließend eigene Schritte.",
  issueNote: "Die Aktion wird im Protokoll festgehalten.",
  issueConfirm: "Jetzt ausstellen",
  issueBusy: "Wird ausgestellt …",
  issueNeedsSave: "Bitte zuerst speichern — ausgestellt wird genau die gespeicherte Fassung.",
  issueStatusFailed: "Der Ausstellungsstatus konnte nicht geladen werden.",
  conflict: "Der Entwurf wurde inzwischen an anderer Stelle geändert. Bitte neu laden — Ihre Änderungen sind nicht gespeichert.",
  alreadyIssued: "Aus diesem Entwurf wurde bereits eine Rechnung ausgestellt.",
  notFound: "Der Entwurf wurde nicht gefunden.",
  rateLimited: "Zu viele Admin-Aktionen. Bitte kurz warten.",
  failed: "Die Aktion ist fehlgeschlagen. Bitte erneut versuchen.",
  manualBadge: "Manuell",
  manualLabel: "Manuell erstellt",
  externalRecipient: "Externer Empfänger",
  noShipment: "Keine Sendung — manuell erstellte Rechnung.",
  noAccountExternal: "Externer Empfänger ohne Kundenkonto.",
  documentNoteManual: "Für manuell erstellte Rechnungen sendet das System keine E-Mail — weder nach der Erzeugung noch beim Download oder Druck. Die Aktion wird im Protokoll festgehalten.",
  print: "Drucken",
  // Stornorechnung im System (Schritt 3) und Stornovermerk eines externen Belegs
  reversalTitle: "Storno",
  stornoButton: "Stornorechnung erstellen …",
  stornoDialogTitle: "Stornorechnung erstellen?",
  stornoDialogText: "Erstellt eine Stornorechnung mit eigener Nummer (CE-ST), die diese Rechnung vollständig aufhebt — mit denselben Positionen und Beträgen mit umgekehrtem Vorzeichen. Die Rechnung selbst, ihre Nummer und ihr PDF bleiben unverändert. Es wird keine E-Mail versendet und keine Zahlung ausgelöst.",
  stornoConfirm: "Stornorechnung erstellen",
  stornoHint: "Die Stornorechnung entsteht hier im System. Danach ist die Rechnung keine offene Forderung mehr. Den Beleg laden Sie anschließend herunter und stellen ihn dem Empfänger selbst zu.",
  stornoDone: (nr) => `${nr ? `Stornorechnung ${nr}` : "Stornorechnung"} erstellt. Es wurde keine E-Mail versendet.`,
  stornoDownload: "Stornorechnung herunterladen",
  stornoDownloadFailed: "Die Stornorechnung konnte nicht geladen werden. Bitte erneut versuchen.",
  stornoSourceInternal: "Stornorechnung (im System erstellt)",
  stornoSourceExternal: "Externer Stornobeleg (vermerkt)",
  reversalButton: "Externen Stornobeleg vermerken …",
  reversalDialogTitle: "Storno vermerken?",
  reversalDialogText: "Vermerkt den außerhalb erstellten Stornobeleg an dieser Rechnung. Danach ist sie keine offene Forderung mehr. Die Rechnung selbst, ihre Nummer und ihr PDF bleiben unverändert.",
  reversalConfirm: "Storno vermerken",
  reversalHint: "Der Stornobeleg entsteht außerhalb des Systems (eigene Nummer, Vier-Augen-Freigabe — Runbook Stornierung).",
  reversalPaidAck: "Die Rechnung ist bereits bezahlt. Die Erstattung veranlasse ich gesondert.",
  reversalDone: "Storno vermerkt.",
  cancelledBadge: "Storniert",
  cancelledNote: "Für diese Rechnung ist ein Storno vermerkt. Sie ist keine offene Forderung mehr und bleibt als Beleg unverändert abrufbar.",
});

export const RECIPIENT_FIELDS = Object.freeze([
  { key: "company", label: "Firma", required: true, max: 200, autoComplete: "organization" },
  { key: "name", label: "Ansprechpartner", max: 100, autoComplete: "name" },
  { key: "email", label: "E-Mail für den Rechnungsversand", max: 254, type: "email", autoComplete: "email" },
  { key: "vatId", label: "USt-IdNr.", max: 30 },
  { key: "street", label: "Straße und Hausnummer", required: true, max: 200, autoComplete: "street-address" },
  { key: "zip", label: "PLZ", required: true, max: 20, autoComplete: "postal-code" },
  { key: "city", label: "Ort", required: true, max: 100, autoComplete: "address-level2" },
]);

// Freigegeben ist nur der Steuerfall „Inland, Regelsteuersatz" — das Land steht deshalb als Auswahl mit DE.
// Trägt ein bestehender Entwurf ein anderes Land, bleibt es sichtbar (der Server sperrt das Ausstellen).
export const DOMESTIC_COUNTRY = Object.freeze({ code: "DE", label: "Deutschland" });
export function countryOptions(current) {
  const list = [{ value: DOMESTIC_COUNTRY.code, label: `${DOMESTIC_COUNTRY.label} (${DOMESTIC_COUNTRY.code})` }];
  if (current && current !== DOMESTIC_COUNTRY.code) list.push({ value: current, label: `${current} — Steuerfall nicht freigegeben` });
  return list;
}

const str = (v) => (v == null ? "" : String(v));
let schluessel = 0;
const neuerSchluessel = () => `p${Date.now().toString(36)}${(schluessel++).toString(36)}`;

export function emptyPosition() {
  return { key: neuerSchluessel(), description: "", details: "", unit: "Stück", quantity: "1", unitPrice: "", discount: "" };
}

export function emptyDraftForm() {
  return {
    recipientKind: "external",
    recipientUserId: null,
    customerLabel: "",
    recipient: { company: "", name: "", email: "", vatId: "", street: "", zip: "", city: "", country: DOMESTIC_COUNTRY.code },
    positions: [emptyPosition()],
    serviceDateFrom: "",
    serviceDateTo: "",
    customerReference: "",
    paymentTermDays: "",
    introText: "",
    closingText: "",
    paymentNote: "",
  };
}

// ── Zahlformen ───────────────────────────────────────────────────────────────────────────────────────────────────
// Euro-Eingabe → Cent. Deutsch mit Komma („1.234,56", „80"), ohne Komma auch mit Punkt als Dezimaltrenner („12.5");
// „1.234" ohne Komma ist eine Tausendergruppe. Mehr als zwei Nachkommastellen, Vorzeichen und Buchstaben → null.
export function parseEuroCents(input) {
  let s = str(input).trim().replace(/\s/g, "").replace(/€$/, "");
  if (s === "") return null;
  if (s.includes(",")) {
    if (!/^\d{1,3}(\.\d{3})*(,\d{0,2})?$|^\d+(,\d{0,2})?$/.test(s)) return null;
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const m = /^(\d{1,9})(?:\.(\d{0,2}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 100 + Number(((m[2] || "") + "00").slice(0, 2));
}

export function formatCentsInput(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) return "";
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

export function formatCents(cents, currency = "EUR") {
  if (!Number.isFinite(cents)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(cents / 100);
}

// Menge/Rabatt: deutsche Eingabe → Maschinenform mit Punkt. Prüfung nur der FORM; die Grenzen setzt der Server.
function dezimal(input, stellen) {
  const s = str(input).trim().replace(/\s/g, "");
  if (s === "") return "";
  const re = new RegExp(`^\\d{1,9}(?:[.,]\\d{1,${stellen}})?$`);
  if (!re.test(s)) return null;
  return s.replace(",", ".");
}
export const parseQuantity = (v) => dezimal(v, 3);
export const parseDiscount = (v) => dezimal(v, 2);
const deutsch = (maschine) => str(maschine).replace(".", ",");

// ── Formular ⇄ Vertrag ───────────────────────────────────────────────────────────────────────────────────────────
export function draftToForm(draft) {
  const d = draft && typeof draft === "object" ? draft : {};
  const r = d.recipient && typeof d.recipient === "object" ? d.recipient : {};
  const positions = Array.isArray(d.positions) && d.positions.length
    ? d.positions.map((p) => ({
      key: neuerSchluessel(),
      description: str(p.description), details: str(p.details), unit: str(p.unit),
      quantity: deutsch(p.quantity),
      unitPrice: formatCentsInput(Number(p.unitPriceNetCents)),
      discount: p.discountPercent && Number(p.discountPercent) !== 0 ? deutsch(p.discountPercent) : "",
    }))
    : [emptyPosition()];
  return {
    recipientKind: d.recipientUserId != null ? "customer" : "external",
    recipientUserId: d.recipientUserId ?? null,
    customerLabel: d.recipientAccount && d.recipientAccount.customerNumber
      ? `${str(r.company) || "Kunde"} · ${d.recipientAccount.customerNumber}` : str(r.company),
    recipient: {
      company: str(r.company), name: str(r.name), email: str(r.email), vatId: str(r.vatId),
      street: str(r.street), zip: str(r.zip), city: str(r.city), country: str(r.country) || DOMESTIC_COUNTRY.code,
    },
    positions,
    serviceDateFrom: str(d.serviceDateFrom),
    serviceDateTo: str(d.serviceDateTo),
    customerReference: str(d.customerReference),
    paymentTermDays: d.paymentTermDays == null ? "" : String(d.paymentTermDays),
    introText: str(d.introText),
    closingText: str(d.closingText),
    paymentNote: str(d.paymentNote),
  };
}

// → { ok:true, payload } | { ok:false, errors: { feldschluessel: Text } }
export function formToPayload(form) {
  const f = form && typeof form === "object" ? form : emptyDraftForm();
  const errors = {};
  const positions = (Array.isArray(f.positions) ? f.positions : []).map((p, i) => {
    const quantity = parseQuantity(p.quantity);
    if (quantity === null || quantity === "") errors[`positions.${i}.quantity`] = "Bitte eine Menge angeben (z. B. 1 oder 1,5).";
    const cents = parseEuroCents(p.unitPrice);
    if (cents === null) errors[`positions.${i}.unitPrice`] = "Bitte einen Einzelpreis in Euro angeben (z. B. 80,00).";
    const discount = parseDiscount(p.discount);
    if (discount === null) errors[`positions.${i}.discount`] = "Rabatt in Prozent, höchstens zwei Nachkommastellen.";
    return {
      description: str(p.description), details: str(p.details), unit: str(p.unit),
      quantity: quantity || "0", unitPriceNetCents: cents === null ? 0 : cents, discountPercent: discount || "",
    };
  });
  if (f.recipientKind === "customer" && (f.recipientUserId === null || f.recipientUserId === undefined)) {
    errors.recipientUserId = "Bitte einen Kunden auswählen — oder „Externe Firma ohne Kundenkonto“ wählen.";
  }
  let paymentTermDays = null;
  if (str(f.paymentTermDays).trim() !== "") {
    if (!/^\d{1,2}$/.test(str(f.paymentTermDays).trim())) errors.paymentTermDays = "Zahlungsziel in ganzen Tagen.";
    else paymentTermDays = Number(str(f.paymentTermDays).trim());
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  const r = f.recipient || {};
  return {
    ok: true,
    payload: {
      recipientUserId: f.recipientKind === "customer" ? (f.recipientUserId ?? null) : null,
      recipient: {
        company: str(r.company), name: str(r.name), email: str(r.email), vatId: str(r.vatId),
        street: str(r.street), zip: str(r.zip), city: str(r.city), country: str(r.country),
      },
      positions,
      serviceDateFrom: str(f.serviceDateFrom) || null,
      serviceDateTo: str(f.serviceDateTo) || null,
      customerReference: str(f.customerReference),
      paymentTermDays,
      introText: str(f.introText),
      closingText: str(f.closingText),
      paymentNote: str(f.paymentNote),
      taxCase: "domestic_standard",
    },
  };
}

// Vorbelegung aus einem Treffer der Kundensuche: die Rechnungsanschrift des Kontos (editierbar, nur für diese Rechnung).
export function applyCustomerToForm(form, customer) {
  const c = customer && typeof customer === "object" ? customer : {};
  const r = c.recipient && typeof c.recipient === "object" ? c.recipient : {};
  return {
    ...form,
    recipientKind: "customer",
    recipientUserId: c.id ?? null,
    customerLabel: `${str(r.company) || str(r.name) || "Kunde"}${c.customerNumber ? ` · ${c.customerNumber}` : ""}`,
    recipient: {
      company: str(r.company), name: str(r.name), email: str(r.email), vatId: str(r.vatId),
      street: str(r.street), zip: str(r.zip), city: str(r.city), country: str(r.country) || DOMESTIC_COUNTRY.code,
    },
  };
}

// Serverfeld → Formularschlüssel („positions[2].unitPriceNetCents" → „positions.2.unitPrice").
export function formKeyOf(serverField) {
  const s = str(serverField);
  const m = /^positions\[(\d+)\]\.(\w+)$/.exec(s);
  if (m) {
    const map = { unitPriceNetCents: "unitPrice", discountPercent: "discount" };
    return `positions.${m[1]}.${map[m[2]] || m[2]}`;
  }
  return s;
}

// ── Sperren und Fehler ───────────────────────────────────────────────────────────────────────────────────────────
// Eine Sperre des Servers als Satz; Feldnamen der Ausstellerdaten in Klartext (dieselbe Beschriftung wie die
// Produktionsbereitschaft), nie ein Ausstellerwert.
export function blockerText(blocker) {
  const b = blocker && typeof blocker === "object" ? blocker : {};
  const basis = str(b.message) || "Die Rechnung kann derzeit nicht ausgestellt werden.";
  const liste = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x).map(fieldLabel) : []);
  const teile = [basis];
  const fehlend = liste(b.missingFields);
  const platzhalter = liste(b.placeholderFields);
  if (fehlend.length) teile.push(`Fehlend: ${fehlend.join(", ")}.`);
  if (platzhalter.length) teile.push(`Noch Platzhalter: ${platzhalter.join(", ")}.`);
  return teile.join(" ");
}

// Darf der Knopf „Rechnung ausstellen" aktiv sein? Ausgestellt wird nur die gespeicherte Fassung — mit
// ungespeicherten Änderungen nie; die Sperren kommen vom Server (issueBlockers des Entwurfs).
export function issueAvailability({ draft, dirty }) {
  if (!draft || !draft.id) return { allowed: false, reasons: [MANUAL_INVOICE_TEXT.issueNeedsSave] };
  if (dirty) return { allowed: false, reasons: [MANUAL_INVOICE_TEXT.issueNeedsSave] };
  const blockers = Array.isArray(draft.issueBlockers) ? draft.issueBlockers : [];
  if (blockers.length) return { allowed: false, reasons: blockers.map(blockerText) };
  return { allowed: true, reasons: [] };
}

// Antwort einer Entwurfs-/Ausstellungsaktion → { text, fieldErrors, conflict, blockers }.
export function manualInvoiceError(status, body) {
  const b = body && typeof body === "object" ? body : {};
  if (status === 400 && Array.isArray(b.errors)) {
    const fieldErrors = {};
    for (const e of b.errors) if (e && e.field && !fieldErrors[formKeyOf(e.field)]) fieldErrors[formKeyOf(e.field)] = str(e.message);
    return { text: str(b.error) || "Bitte die markierten Angaben prüfen.", fieldErrors };
  }
  if (status === 409 && b.code === "MANUAL_INVOICE_DRAFT_CONFLICT") return { text: MANUAL_INVOICE_TEXT.conflict, conflict: true };
  if (status === 409 && b.code === "MANUAL_INVOICE_DRAFT_ISSUED") return { text: MANUAL_INVOICE_TEXT.alreadyIssued, issuedInvoiceId: b.invoiceId ?? null };
  if (status === 409 && b.code === "MANUAL_INVOICE_ISSUE_BLOCKED") {
    const blockers = Array.isArray(b.blockers) ? b.blockers : [];
    return { text: str(b.error) || "Die Rechnung kann derzeit nicht ausgestellt werden.", blockers: blockers.map(blockerText) };
  }
  if (status === 409 && b.code === "MANUAL_INVOICE_POSITIONS_MISSING") return { text: str(b.error) };
  if (status === 404) return { text: MANUAL_INVOICE_TEXT.notFound };
  if (status === 429) return { text: MANUAL_INVOICE_TEXT.rateLimited };
  return { text: str(b.error) && status < 500 ? str(b.error) : MANUAL_INVOICE_TEXT.failed };
}

// ── Rechnung: Herkunft und Stornovermerk ─────────────────────────────────────────────────────────────────────────
export const isManualInvoice = (inv) => !!inv && inv.invoice_source === "manual";
export const isCancelledInvoice = (inv) => !!inv && inv.is_cancelled === true;

export function cancellationInfo(inv) {
  if (!isCancelledInvoice(inv)) return null;
  return {
    documentNumber: str(inv.cancellation_document_number),
    // Schritt 3: 'internal' = Stornorechnung im System (PDF abrufbar), sonst vermerkter externer Beleg.
    internal: inv.cancellation_document_source === "internal",
    documentAvailable: inv.cancellation_document_available === true,
    date: str(inv.cancellation_date),
    reason: str(inv.cancellation_reason),
    approvedBy: str(inv.cancellation_approved_by),
    recordedAt: inv.cancellation_recorded_at || null,
  };
}

export const EMPTY_REVERSAL_FORM = Object.freeze({
  externalDocumentNumber: "", cancellationDate: "", reason: "", approvedBy: "", acknowledgePaid: false,
});

// → { ok:true, body } | { ok:false, errors }
export function reversalPayload(form, { paid = false } = {}) {
  const f = form && typeof form === "object" ? form : EMPTY_REVERSAL_FORM;
  const errors = {};
  if (!str(f.externalDocumentNumber).trim()) errors.externalDocumentNumber = "Bitte die Nummer des Stornobelegs angeben.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str(f.cancellationDate))) errors.cancellationDate = "Bitte das Datum des Stornobelegs angeben.";
  if (!str(f.reason).trim()) errors.reason = "Bitte die Begründung angeben.";
  if (!str(f.approvedBy).trim()) errors.approvedBy = "Bitte die freigebende Person angeben.";
  if (paid && f.acknowledgePaid !== true) errors.acknowledgePaid = "Bitte bestätigen, dass die Erstattung gesondert veranlasst wird.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    body: {
      externalDocumentNumber: str(f.externalDocumentNumber).trim(), cancellationDate: str(f.cancellationDate),
      reason: str(f.reason).trim(), approvedBy: str(f.approvedBy).trim(), acknowledgePaid: f.acknowledgePaid === true,
    },
  };
}

export const EMPTY_STORNO_FORM = Object.freeze({ reason: "", approvedBy: "", acknowledgePaid: false });

// Stornorechnung (Schritt 3): Begründung, freigebende Person, bei bezahlter Rechnung die Erstattungsbestätigung.
// → { ok:true, body } | { ok:false, errors }
export function stornoPayload(form, { paid = false } = {}) {
  const f = form && typeof form === "object" ? form : EMPTY_STORNO_FORM;
  const errors = {};
  if (!str(f.reason).trim()) errors.reason = "Bitte die Begründung angeben.";
  if (!str(f.approvedBy).trim()) errors.approvedBy = "Bitte die freigebende Person angeben.";
  if (paid && f.acknowledgePaid !== true) errors.acknowledgePaid = "Bitte bestätigen, dass die Erstattung gesondert veranlasst wird.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, body: { reason: str(f.reason).trim(), approvedBy: str(f.approvedBy).trim(), acknowledgePaid: f.acknowledgePaid === true } };
}

const REVERSAL_CODE_TEXT = Object.freeze({
  INVOICE_ALREADY_CANCELLED: "Für diese Rechnung ist bereits ein Storno vermerkt.",
  REVERSAL_NUMBER_TAKEN: "Diese Stornobelegnummer ist bereits vermerkt.",
  REVERSAL_PAID_ACK_REQUIRED: "Die Rechnung ist bezahlt — bitte die gesonderte Erstattung bestätigen.",
  INVOICE_NOT_MANUAL: "Ein Stornovermerk ist nur für manuell erstellte Rechnungen vorgesehen.",
});
export function reversalError(status, body) {
  const b = body && typeof body === "object" ? body : {};
  if (status === 400 && Array.isArray(b.errors)) {
    const fieldErrors = {};
    for (const e of b.errors) if (e && e.field && !fieldErrors[e.field]) fieldErrors[e.field] = str(e.message);
    return { text: str(b.error) || "Bitte die Angaben prüfen.", fieldErrors };
  }
  if (REVERSAL_CODE_TEXT[b.code]) return { text: REVERSAL_CODE_TEXT[b.code], fieldErrors: b.code === "REVERSAL_NUMBER_TAKEN" ? { externalDocumentNumber: REVERSAL_CODE_TEXT[b.code] } : {} };
  if (status === 404) return { text: "Die Rechnung wurde nicht gefunden." };
  if (status === 429) return { text: MANUAL_INVOICE_TEXT.rateLimited };
  return { text: MANUAL_INVOICE_TEXT.failed };
}

// Meldung nach dem Ausstellen (auf der Rechnungsseite). Sie nennt ausdrücklich, dass KEINE E-Mail hinausging.
export function issuedNotice(invoiceNumber, alreadyIssued = false) {
  const nr = str(invoiceNumber) || "ohne Nummer";
  return alreadyIssued
    ? `Rechnung ${nr} war bereits ausgestellt. Es wurde keine zweite Rechnung erzeugt.`
    : `Rechnung ${nr} ausgestellt. Es wurde keine E-Mail versendet.`;
}

// Heutiges Datum in Europe/Berlin als JJJJ-MM-TT (Vorbelegung und Obergrenze des Stornodatums).
export function berlinToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
