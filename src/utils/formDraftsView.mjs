// ─────────────────────────────────────────────────────────────────────────────
// Formularentwürfe — reine, framework-freie Hilfslogik (.mjs, wie draftsView /
// addressBookView). Normalisierung + Zusammenführung beider Entwurfsquellen
// (form / shipment), Anzeige-Formatierung für Formularentwürfe, Rehydration des
// „Neue Sendung"-Formulars aus einem Detail-Snapshot sowie das Mapping der
// Übergangs-/Konflikt-Codes auf verständliche Meldungen. Kein React, kein Netzwerk.
//
// Backend-Kontrakt (siehe Aufgabenstellung, bereits gemergt & deployed):
//   GET /api/kunde/form-drafts        → { drafts: [ { id, kind:"form", schemaVersion,
//                                        revision, summary:{ sender, recipient,
//                                        packages, shippingDate }, createdAt,
//                                        updatedAt } ], nextCursor }
//   GET /api/kunde/form-drafts/:id    → { draft: { …, formData:{ sender, recipient,
//                                        packages, shippingOptions } } }
//   calculate-price → optional { formDraftTransition: { sourceFormDraftId,
//                                consumed, reason? } }
//
// Shipment-Drafts (bereits berechnet) kommen unverändert aus dem bestehenden
// /api/kunde/drafts-Vertrag; sie tragen im Backend evtl. kein `kind` — das wird
// hier AUSSCHLIESSLICH clientseitig als kind:"shipment" ergänzt (kein neuer
// Backend-Vertrag).

export const FORM_DRAFT_KIND = "form";
export const SHIPMENT_DRAFT_KIND = "shipment";

// Erlaubte Filter-Enums (Spiegel von NewShipmentPage SERVICE_OPTIONS /
// SHIPPING_MODE_OPTIONS). Unbekannte Werte fallen bei der Rehydration auf "all".
export const FORM_SERVICE_FILTERS = ["all", "pickup", "dropoff", "pickup_today"];
export const FORM_SHIPPING_MODES = ["all", "standard", "express", "economy"];

// ── kleine, defensive Helfer ────────────────────────────────────────────────
const str = (v) => (typeof v === "string" ? v.trim() : "");
function firstNonEmptyString(...vals) {
  for (const v of vals) {
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return "";
}
// Positive Ganzzahl (Number ODER reiner Ziffern-String ohne führende Null) —
// selbe Strenge wie hasSavableShipmentId für die Shipment-ID.
function isPositiveIntId(v) {
  if (typeof v === "number") return Number.isInteger(v) && v > 0;
  if (typeof v === "string") return /^[1-9][0-9]*$/.test(v.trim());
  return false;
}
function isNonNegativeInt(v) {
  if (typeof v === "number") return Number.isInteger(v) && v >= 0;
  if (typeof v === "string") return /^[0-9]+$/.test(v.trim());
  return false;
}

// ── Normalisierung je Quelle ────────────────────────────────────────────────
export function normalizeFormDraft(raw) {
  if (!raw || typeof raw !== "object") return null;
  return { ...raw, kind: FORM_DRAFT_KIND };
}
// Ergänzt kind:"shipment" NUR clientseitig, falls nicht vorhanden. Alle
// bestehenden Felder (recipientAddress, fromCountry … updatedAt) bleiben
// unangetastet, damit DraftDesktopRow/DraftCard unverändert funktionieren.
export function normalizeShipmentDraft(raw) {
  if (!raw || typeof raw !== "object") return null;
  return raw.kind === SHIPMENT_DRAFT_KIND ? raw : { ...raw, kind: SHIPMENT_DRAFT_KIND };
}

// Kombischlüssel über beide Namensräume hinweg: "form:123" ≠ "shipment:123".
export function combinedDraftKey(item) {
  const kind = item?.kind === FORM_DRAFT_KIND ? FORM_DRAFT_KIND : SHIPMENT_DRAFT_KIND;
  return `${kind}:${item?.id}`;
}

// Gemeinsames Sortier-/Anzeigedatum (absteigend genutzt).
//  • Formularentwurf:   updatedAt → createdAt
//  • Shipment-Draft:    updatedAt → savedDraftUpdatedAt → createdAt
// Begründung (dokumentiert): Der Shipment-Draft-Listenvertrag liefert updatedAt;
// nur falls dieses fehlt, wird auf das belegte createdAt zurückgegriffen — nie
// auf ein erfundenes Feld.
export function displayUpdatedAt(item) {
  if (!item || typeof item !== "object") return "";
  if (item.kind === FORM_DRAFT_KIND) return firstNonEmptyString(item.updatedAt, item.createdAt);
  return firstNonEmptyString(item.updatedAt, item.savedDraftUpdatedAt, item.saved_draft_updated_at, item.createdAt);
}

function dedupeById(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    if (it == null || it.id == null) { if (it != null) out.push(it); continue; }
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  return out;
}

// Deterministischer Vergleich: Anzeigedatum DESC → kind ASC (form vor shipment)
// → id DESC (numerisch, sonst String). Stabil und reproduzierbar.
function compareDrafts(a, b) {
  const ta = displayUpdatedAt(a);
  const tb = displayUpdatedAt(b);
  if (ta !== tb) return ta < tb ? 1 : -1; // DESC (leerer String sortiert nach unten)
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1; // "form" < "shipment"
  const ia = Number(a.id), ib = Number(b.id);
  if (Number.isFinite(ia) && Number.isFinite(ib) && ia !== ib) return ib - ia; // id DESC
  const sa = String(a.id), sb = String(b.id);
  return sa < sb ? 1 : sa > sb ? -1 : 0;
}

// Beide Quellen normalisieren, je Quelle nach id deduplizieren, zusammenführen
// und deterministisch sortieren. Kollisionen gleicher numerischer id über
// verschiedene kinds bleiben erhalten (getrennte Namensräume).
export function mergeDraftSources(formItems, shipmentItems) {
  const forms = dedupeById((formItems || []).map(normalizeFormDraft).filter(Boolean));
  const ships = dedupeById((shipmentItems || []).map(normalizeShipmentDraft).filter(Boolean));
  return [...forms, ...ships].sort(compareDrafts);
}

// Anfügen einer weiteren Seite je Quelle (ohne Duplikate, Reihenfolge erhalten).
export function appendFormDraftPage(existingItems, newItems) {
  const seen = new Set((existingItems || []).map((d) => d?.id));
  const deduped = (newItems || []).filter((d) => d && !seen.has(d.id));
  return [...(existingItems || []), ...deduped];
}

export function removeDraftById(items, id) {
  return (items || []).filter((d) => d && d.id !== id);
}

// ── Anzeige eines Formularentwurfs (arbeitet auf `summary`, NICHT formData) ──
// summary.sender/recipient enthalten laut Vertrag company, city, country.
export function formatFormRecipient(draft) {
  const r = draft?.summary?.recipient;
  const company = str(r?.company);
  if (company) return company;
  const cityCountry = [str(r?.city), str(r?.country)].filter(Boolean).join(", ");
  if (cityCountry) return cityCountry;
  return "Empfänger noch unvollständig";
}
export function formatFormSender(draft) {
  const s = draft?.summary?.sender;
  const company = str(s?.company);
  if (company) return company;
  const cityCountry = [str(s?.city), str(s?.country)].filter(Boolean).join(", ");
  if (cityCountry) return cityCountry;
  return "Absender noch unvollständig";
}
export function formatFormRoute(draft) {
  const from = str(draft?.summary?.sender?.country).toUpperCase();
  const to = str(draft?.summary?.recipient?.country).toUpperCase();
  if (!from && !to) return "Route noch unvollständig";
  return `${from || "–"} → ${to || "–"}`;
}
// { countLabel: "2 Pakete"|null, weightLabel: "8,5 kg"|null } — der Aufrufer
// entscheidet über Fallbacktexte („Gewicht noch offen").
export function formatFormPackage(draft) {
  const p = draft?.summary?.packages;
  const count = Number(p?.packageCount);
  const countLabel = Number.isFinite(count) && count > 0 ? `${count} Paket${count === 1 ? "" : "e"}` : null;
  const weightNum = Number(p?.weight);
  const weightLabel = p?.weight != null && Number.isFinite(weightNum) && weightNum > 0
    ? `${weightNum.toLocaleString("de-DE")} kg` : null;
  return { countLabel, weightLabel };
}
// Versanddatum-Wert (Formatierung via bestehendem fmtDE); null → „noch offen".
export function formFormShippingDate(draft) {
  const v = draft?.summary?.shippingDate;
  return typeof v === "string" && v.trim() ? v : null;
}

// ── Rehydration: Detail-formData → NewShipmentPage-Formularzustand ──────────
// Leeres Basisformular (spiegelt die Feldstruktur von NewShipmentPage; Resume
// umgeht bewusst das Profil-Prefill → Sender startet leer, dann Snapshot).
export function blankNewShipmentForm() {
  return {
    s_company: "", s_fullName: "", s_street: "", s_addition: "", s_zip: "", s_city: "", s_country: "DE", s_phone: "", s_email: "",
    r_company: "", r_fullName: "", r_street: "", r_addition: "", r_zip: "", r_city: "", r_country: "CH", r_phone: "", r_email: "",
    packageCount: "1", weight: "", length: "", width: "", height: "",
    max_price: "", latestDeliveryDate: "",
  };
}

function safeStr(v) {
  return typeof v === "string" ? v : (typeof v === "number" && Number.isFinite(v) ? String(v) : "");
}
function safeCountry(v, fallback) {
  const c = str(v).toUpperCase();
  return /^[A-Z]{2,3}$/.test(c) ? c : fallback;
}
function toCountString(v) {
  if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 99) return String(v);
  if (typeof v === "string" && /^[0-9]{1,2}$/.test(v.trim())) {
    const n = Number(v.trim());
    if (n >= 1 && n <= 99) return String(n);
  }
  return "1";
}
function toNumString(v) {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return String(v);
  if (typeof v === "string") {
    const t = v.trim().replace(",", ".");
    const n = Number(t);
    if (t !== "" && Number.isFinite(n) && n > 0) return t;
  }
  return "";
}
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function mapParty(src, prefix, base) {
  if (!src || typeof src !== "object") return;
  const set = (key, val) => { const s = safeStr(val); if (s) base[`${prefix}_${key}`] = s; };
  set("company", src.company);
  set("fullName", src.fullName);
  set("street", src.streetAndNumber);
  set("addition", src.addressAddition);
  set("zip", src.postalCode);
  set("city", src.city);
  set("phone", src.phone);
  set("email", src.email);
  base[`${prefix}_country`] = safeCountry(src.country, base[`${prefix}_country`]);
}

// Vollständiger Initialzustand für „Neue Sendung" aus einem Formularentwurf-
// Snapshot. `today` (YYYY-MM-DD) klemmt ein in der Vergangenheit liegendes
// Versanddatum auf heute (die Seite lässt keine Vergangenheitsdaten zu). Rein
// defensiv: nur bekannte Felder, keine NaN, unbekannte Enums → Defaults.
export function buildResumeInitialState(formData, { today = null } = {}) {
  const form = blankNewShipmentForm();
  const fd = formData && typeof formData === "object" ? formData : {};

  mapParty(fd.sender, "s", form);
  mapParty(fd.recipient, "r", form);

  const pkg = fd.packages && typeof fd.packages === "object" ? fd.packages : {};
  form.packageCount = toCountString(pkg.packageCount);
  form.weight = toNumString(pkg.weight);
  form.length = toNumString(pkg.length);
  form.width = toNumString(pkg.width);
  form.height = toNumString(pkg.height);

  const opt = fd.shippingOptions && typeof fd.shippingOptions === "object" ? fd.shippingOptions : {};

  let shippingDate = null;
  if (typeof opt.shippingDate === "string" && ISO_DATE_RE.test(opt.shippingDate.trim())) {
    shippingDate = opt.shippingDate.trim();
    if (today && shippingDate < today) shippingDate = today; // Vergangenheit → heute
  }

  const serviceFilter = FORM_SERVICE_FILTERS.includes(opt.serviceFilter) ? opt.serviceFilter : "all";
  const shippingModeFilter = FORM_SHIPPING_MODES.includes(opt.shippingModeFilter) ? opt.shippingModeFilter : "all";
  const selectedPublicCarrierIds = Array.isArray(opt.publicCarrierIds)
    ? opt.publicCarrierIds.map((x) => safeStr(x)).filter((x) => x.length > 0)
    : [];

  return { form, shippingDate, serviceFilter, shippingModeFilter, selectedPublicCarrierIds };
}

// ── Resume-Payload (Frontend-Vertrag) ───────────────────────────────────────
export function isValidResumeDraft(resumeDraft) {
  return (
    !!resumeDraft && typeof resumeDraft === "object" &&
    resumeDraft.kind === FORM_DRAFT_KIND &&
    !!resumeDraft.formData && typeof resumeDraft.formData === "object" &&
    isPositiveIntId(resumeDraft.sourceFormDraftId) &&
    isNonNegativeInt(resumeDraft.sourceFormDraftRevision)
  );
}
// Baut den Resume-Payload aus der Detail-Response (draft-Objekt). Enthält
// bewusst NUR ID, Revision, schemaVersion und formData — keine Preise/Tarife/
// Carrier/Shipment-ID/Tracking/Bestätigungen.
export function buildResumePayload(draft) {
  if (!draft || typeof draft !== "object") return null;
  return {
    kind: FORM_DRAFT_KIND,
    sourceFormDraftId: draft.id,
    sourceFormDraftRevision: draft.revision,
    schemaVersion: draft.schemaVersion ?? null,
    formData: draft.formData,
  };
}
// Nur die Metadaten für den calculate-price-Übergang (ID + Revision). null,
// wenn der Payload nicht gültig ist (dann normaler Neuversand ohne Source-Felder).
export function resumeSourceFromDraft(resumeDraft) {
  if (!isValidResumeDraft(resumeDraft)) return null;
  return {
    id: Number(resumeDraft.sourceFormDraftId),
    revision: Number(resumeDraft.sourceFormDraftRevision),
    schemaVersion: resumeDraft.schemaVersion ?? null,
  };
}

// ── Übergangs-Response nach erfolgreichem calculate-price ───────────────────
export const FORM_DRAFT_TRANSITION_REASON = {
  REVISION_CHANGED: "revision_changed",
  CLEANUP_FAILED: "cleanup_failed",
  SHIPMENT_PERSISTENCE_FAILED: "shipment_persistence_failed",
};
const TRANSITION_NOTICE = {
  revision_changed: "Der Entwurf wurde zwischenzeitlich geändert und bleibt deshalb gespeichert.",
  cleanup_failed: "Die Preise wurden berechnet. Der ursprüngliche Entwurf konnte jedoch nicht automatisch entfernt werden.",
};
export const SHIPMENT_PERSISTENCE_FAILED_MESSAGE =
  "Die Preise konnten berechnet werden, aber es wurde keine verlässliche Sendungsgrundlage erstellt. Bitte berechnen Sie die Preise erneut.";

// Trägt die calculate-price-Antwort einen brauchbaren Sendungsbezug?
//
// `shipmentId` dieser Antwort ist die JUMiNGO-shipment_id — laut autoritativer
// Referenz (docs/jumingo/openapi/jumingo-openapi.yaml, CreateShipmentResult)
// ein STRING der Form "s_fb1bc92aba1c4d70a3eaa44d687ae179". Genau dieser Wert
// ist der Bezug, mit dem anschließend /book, der Label-Abruf, das Abholzeitfenster
// und die Handelsrechnung arbeiten.
//
// AUSDRÜCKLICH NICHT hasSavableShipmentId (draftsView.mjs) verwenden: das ist der
// Validator für die INTERNE numerische Shipment-ID und lehnt JUMiNGO-förmige IDs
// bewusst ab (dort eigens getestet). Auf diese Antwort angewandt ergibt er immer
// `false` und blockiert damit jede fortgesetzte Berechnung.
//
// Ob überhaupt eine verlässliche Sendungsgrundlage entstanden ist, entscheidet
// serverseitig `formDraftTransition.reason = shipment_persistence_failed`
// (classifyFormDraftTransition → blocking). Diese Prüfung hier ergänzt das nur um
// den Fall einer fehlenden/leeren ID.
export function hasUsableShipmentReference(shipmentId) {
  if (typeof shipmentId === "number") return Number.isFinite(shipmentId) && shipmentId > 0;
  if (typeof shipmentId === "string") return shipmentId.trim() !== "";
  return false;
}

// Klassifiziert die Transition in { consumed, reason, blocking, notice }.
//  • consumed:true                         → { consumed:true }  (Entwurf verbraucht)
//  • consumed:false + shipment_persistence → blocking:true      (Weiterleitung sperren)
//  • consumed:false + revision/cleanup     → notice (nicht blockierend)
export function classifyFormDraftTransition(transition) {
  const consumed = transition?.consumed === true;
  const reason = transition && typeof transition.reason === "string" ? transition.reason : null;
  const blocking = !consumed && reason === FORM_DRAFT_TRANSITION_REASON.SHIPMENT_PERSISTENCE_FAILED;
  const notice = !consumed && reason && TRANSITION_NOTICE[reason] ? TRANSITION_NOTICE[reason] : "";
  return { consumed, reason, blocking, notice };
}

// ── Start-Konflikte des calculate-price (nicht-ok Response mit code) ────────
// clearsSource: Source-Metadaten lokal entfernen (nächster Versuch = normal).
// allowsReload: „Aktuelle Version laden"-Aktion anbieten (Detail neu holen).
const FORM_DRAFT_START_ERRORS = {
  FORM_DRAFT_CONFLICT: {
    kind: "conflict", clearsSource: false, allowsReload: true,
    message: "Dieser Entwurf wurde inzwischen geändert. Lade die aktuelle Version neu, bevor du fortfährst.",
  },
  FORM_DRAFT_NOT_FOUND: {
    kind: "notFound", clearsSource: true, allowsReload: false,
    message: "Dieser Entwurf ist nicht mehr verfügbar. Du kannst die aktuellen Angaben als neue Sendung weiterverwenden.",
  },
  FORM_DRAFT_CONVERSION_IN_PROGRESS: {
    kind: "inProgress", clearsSource: false, allowsReload: false,
    message: "Dieser Entwurf wird gerade in einem anderen Vorgang verarbeitet. Versuche es gleich erneut.",
  },
};
export function mapFormDraftStartError(code) {
  return FORM_DRAFT_START_ERRORS[code] || null;
}

// ── Fehlercode-Mapping Löschen ──────────────────────────────────────────────
const GENERIC_FORM_DELETE_ERROR = "Der Entwurf konnte nicht gelöscht werden. Bitte versuchen Sie es erneut.";
export function mapFormDraftDeleteErrorToMessage(code) {
  if (code === "FORM_DRAFT_NOT_FOUND") return "Der Entwurf wurde bereits gelöscht oder ist nicht mehr verfügbar.";
  return GENERIC_FORM_DELETE_ERROR;
}

// ── Empty-State / Teilfehler-Auflösung der kombinierten Liste ───────────────
// „leer" gilt NUR, wenn beide Quellen erfolgreich UND leer sind.
export function resolveCombinedEmpty({ formOk, shipmentOk, formCount, shipmentCount }) {
  return !!formOk && !!shipmentOk && (formCount || 0) === 0 && (shipmentCount || 0) === 0;
}
