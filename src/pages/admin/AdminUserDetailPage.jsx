import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams, useNavigate } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import {
  getAdminUser,
  anonymizeAdminUser,
  deleteAdminUser,
  getAdminCustomerPriceMarkup,
  updateAdminCustomerPriceMarkup,
  setAdminUserStatus,
} from "../../api/adminApi";
import { money } from "../../utils/formatters";
import { userStatusMeta, userRoleMeta } from "../../utils/adminUsers";
import { b2bCompletenessHint, missingB2BAccountFields, isAnonymizedAccount } from "../../utils/b2bAccount.mjs";
import {
  OVERDUE_NOTE,
  PAYMENT_TERM_TEXT,
  accountStatusCopy,
  activityMetrics,
  customerNumberFromDetail,
  deleteEligibility,
  isSelfAccount,
  BLOCK_DIALOG,
  SELF_ACTION_REASON,
  statusSuccessMessage,
} from "../../utils/adminCustomerView.mjs";
import { useAuth } from "../../context/AuthContext";
import { CustomerMarkupSection } from "../../components/admin/CustomerMarkupSection";
import { CustomerApprovalCard } from "../../components/admin/CustomerApprovalCard";
import {
  APPROVAL_ERRORS,
  MARKUP_SAVE_ERRORS,
  MARKUP_TEXTS,
  approvalError,
  approvalGate,
  isMarkupConfirmed,
  legacyApprovedNotice,
  markupSaveError,
  markupSuccessMessage,
  selectPriceMarkup,
} from "../../utils/customerMarkup.mjs";

const firstDefined = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== "");

const ERROR_MESSAGES = {
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
  500: "Der Kunde konnte nicht geladen werden. Bitte versuchen Sie es erneut.",
};
const GENERIC_ERROR = "Der Kunde konnte nicht geladen werden. Bitte versuchen Sie es erneut.";

// Ladefehler der Aufschlagssektion (GET). 404 wird eigens benannt, weil dort der
// Kunde selbst gemeint ist; alles andere bleibt bewusst unspezifisch (keine
// technischen Details).
const MARKUP_LOAD_ERRORS = {
  404: "Der Kunde wurde nicht gefunden oder ist nicht mehr verfügbar.",
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
  default: "Der Kundenaufschlag konnte nicht geladen werden.",
};

// Fehlertexte für die Anonymisierung (verständlich, kein roher Backend-Body).
const ANON_ERRORS = {
  400: "Bestätigung ungültig oder Aktion nicht erlaubt.",
  404: "Kunde wurde nicht gefunden.",
  409: "Anonymisierung konnte aufgrund eines Konflikts nicht durchgeführt werden.",
  429: "Zu viele Adminaktionen. Bitte später erneut versuchen.",
  500: "Account konnte nicht anonymisiert werden.",
  default: "Account konnte nicht anonymisiert werden.",
};

// Fehlertexte für die harte Löschung. 409 ist kein Fehlerfall, sondern der
// erwartete Delete-Guard (abhängige Sendungs-/Rechnungsdaten) → Anonymisierung.
const DELETE_ERRORS = {
  404: "Kunde wurde nicht gefunden.",
  409: "Kunde kann aufgrund vorhandener Sendungs-/Rechnungsdaten nicht hart gelöscht werden. Bitte Anonymisierung verwenden.",
  429: "Zu viele Adminaktionen. Bitte später erneut versuchen.",
  default: "Kunde konnte nicht gelöscht werden.",
};

// Backend-Vertrag: { user: {...}, summary: {...} }. Defensiv entpacken.
function selectUser(d) {
  if (d && typeof d === "object" && !Array.isArray(d)) {
    if (d.user && typeof d.user === "object") return d.user;
    if (d.data && typeof d.data === "object" && !Array.isArray(d.data)) return d.data;
    return d;
  }
  return null;
}
function selectSummary(d) {
  return d && typeof d.summary === "object" && d.summary ? d.summary : {};
}

// ── Feld-Getter: NUR erlaubte Felder. password/password_hash/token/secret/
// reset_token werden NIE gelesen — kein Object.keys, kein Spread des Objekts.
const idOf = (u) => firstDefined(u.id, u.user_id, u.uuid);
const nameOf = (u) => firstDefined(u.name, u.full_name, u.contact_name);
const emailOf = (u) => firstDefined(u.email, u.e_mail);
const companyOf = (u) => firstDefined(u.company_name, u.company, u.firma);
const statusOf = (u) => firstDefined(u.status, u.state);
const roleOf = (u) => firstDefined(u.role);
const vatOf = (u) => firstDefined(u.vat_id, u.vatId, u.ust_id);
const streetOf = (u) => firstDefined(u.street, u.strasse);
const zipOf = (u) => firstDefined(u.zip, u.postal_code, u.plz);
const cityOf = (u) => firstDefined(u.city, u.stadt, u.ort);
const countryOf = (u) => firstDefined(u.country, u.country_code, u.land);
const paymentTermOf = (u) => firstDefined(u.payment_term, u.paymentTerm);
const createdOf = (u) => firstDefined(u.created_at, u.createdAt, u.created);
const anonymizedAtOf = (u) => firstDefined(u.anonymized_at, u.anonymizedAt);
const anonymizedByOf = (u) => firstDefined(u.anonymized_by, u.anonymizedBy);
const pwChangedAtOf = (u) => firstDefined(u.password_changed_at, u.passwordChangedAt);

const num = (v) => (v != null && v !== "" && Number.isFinite(Number(v)) ? String(Number(v)) : "—");

// Fehlendes B2B-Pflichtfeld sichtbar benennen statt nur „—" anzuzeigen.
// Rückgabe: JSX-Hinweis, oder null wenn das Feld gepflegt ist.
function missingField(user, field) {
  const hit = missingB2BAccountFields(user).find((f) => f.field === field);
  if (!hit || isAnonymizedAccount(user)) return null;
  return <span className="adm-b2b-missing">{hit.missingText}</span>;
}
const moneyOrDash = (v) => (v != null && v !== "" && Number.isFinite(Number(v)) ? money(v) : "—");
const dash = (v) => (v != null && String(v).trim() !== "" ? String(v) : "—");

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("de-DE");
}
function fmtDateTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("de-DE");
}

function KV({ items }) {
  return (
    <dl className="adm-kv">
      {items.map(([k, v]) => (
        <div className="adm-kv-item" key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// `text` kennzeichnet Textwerte (z. B. „7 Kalendertage") — sie werden etwas
// kleiner gesetzt und brechen an Wortgrenzen statt mitten im Wort.
function Stat({ label, value, text = false }) {
  return (
    <div className="adm-stat">
      <div className="adm-stat-label">{label}</div>
      <div className={`adm-stat-value${text ? " adm-stat-value-text" : ""}`}>{value}</div>
    </div>
  );
}

export default function AdminUserDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user: authUser } = useAuth();
  const currentAdminId = authUser?.id ?? null;
  const [user, setUser] = useState(null);
  const [summary, setSummary] = useState({});
  // Rohe Detailantwort — ausschließlich, um die Kundennummer auch dann zu finden,
  // wenn der Endpunkt sie neben `user` in der Hülle führt (siehe
  // customerNumberFromDetail). Es wird nichts anderes daraus gerendert.
  const [detailPayload, setDetailPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [anonOpen, setAnonOpen] = useState(false);   // Type-to-confirm-Modal
  const [anonInput, setAnonInput] = useState("");    // getippter Bestätigungstext
  const [anonBusy, setAnonBusy] = useState(false);   // Anonymisierung läuft
  const [anonMsg, setAnonMsg] = useState(null);      // { type, text }
  const [delOpen, setDelOpen] = useState(false);     // Type-to-confirm-Modal (Löschen)
  const [delInput, setDelInput] = useState("");      // getippter Bestätigungstext
  const [delBusy, setDelBusy] = useState(false);     // Löschung läuft
  const [delMsg, setDelMsg] = useState(null);        // { type, text }

  // ── Individueller Kundenaufschlag ─────────────────────────────────────────
  const [pricing, setPricing] = useState(null);          // normalisierte GET-Daten
  const [pricingLoading, setPricingLoading] = useState(true);
  const [pricingError, setPricingError] = useState("");  // Ladefehler (GET)
  const [saveBusy, setSaveBusy] = useState(false);       // PUT läuft
  const [saveError, setSaveError] = useState(null);      // { field, text }
  const [saveSuccess, setSaveSuccess] = useState("");
  // ── Freischaltung (bestehender Statusendpunkt) ────────────────────────────
  const [approveOpen, setApproveOpen] = useState(false);
  const [approveBusy, setApproveBusy] = useState(false);
  const [approveMsg, setApproveMsg] = useState(null);    // { type, text }
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);

  const markupInputRef = useRef(null);
  const markupSectionRef = useRef(null);
  // Verhindert eine zweite Übermittlung, bevor React den Busy-State gerendert hat
  // (Doppelklick, Enter+Klick): der Guard greift synchron.
  const saveInFlight = useRef(false);
  const approveInFlight = useRef(false);
  const blockInFlight = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotFound(false);
    try {
      const r = await getAdminUser(id);
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return; // zentraler Redirect
        if (r.status === 404) { setNotFound(true); setUser(null); return; }
        setError(ERROR_MESSAGES[r.status] || GENERIC_ERROR);
        setUser(null);
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      setDetailPayload(d);
      setUser(selectUser(d));
      setSummary(selectSummary(d));
    } catch {
      setError(GENERIC_ERROR);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Aufschlag laden. Eigener Request-Pfad, eigener Ladezustand: solange er läuft,
  // gilt der Bestätigungsstatus als unbekannt — die Freischaltung erscheint in
  // dieser Zeit bewusst NICHT als möglich (siehe approvalGate).
  const loadPricing = useCallback(async (signal) => {
    setPricingLoading(true);
    setPricingError("");
    try {
      const r = await getAdminCustomerPriceMarkup(id, { signal });
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return; // zentraler Redirect
        setPricing(null);
        setPricingError(MARKUP_LOAD_ERRORS[r.status] || MARKUP_LOAD_ERRORS.default);
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      const next = selectPriceMarkup(d);
      if (!next) {
        setPricing(null);
        setPricingError(MARKUP_LOAD_ERRORS.default);
        return;
      }
      setPricing(next);
    } catch (e) {
      if (e && e.name === "AbortError") return; // Seitenwechsel — kein Fehlerzustand
      setPricing(null);
      setPricingError(MARKUP_LOAD_ERRORS.default);
    } finally {
      if (!signal || !signal.aborted) setPricingLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    loadPricing(ctrl?.signal);
    return () => ctrl?.abort();
  }, [loadPricing]);

  // Beim Wechsel auf einen anderen Kunden Modal/Meldung zurücksetzen (nicht bei
  // manuellem Reload nach Erfolg — dort bleibt der Erfolgshinweis sichtbar).
  useEffect(() => {
    setAnonOpen(false); setAnonInput(""); setAnonMsg(null);
    setDelOpen(false); setDelInput(""); setDelMsg(null);
    setPricing(null); setSaveError(null); setSaveSuccess("");
    setApproveOpen(false); setApproveMsg(null);
    setBlockOpen(false);
  }, [id]);

  // Sprung in die Aufschlagssektion — genutzt vom CTA „Aufschlag festlegen" und
  // vom Freischaltungsdialog der Kundenliste (Router-State, KEIN Query-Parameter:
  // es landen keine Pricing-Daten in der URL).
  const focusMarkup = useCallback(() => {
    markupSectionRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    markupInputRef.current?.focus?.();
  }, []);

  useEffect(() => {
    if (!location.state || !location.state.focusPricing) return;
    if (loading || pricingLoading) return; // erst fokussieren, wenn das Feld auch da ist
    focusMarkup();
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, loading, pricingLoading]);

  const back = (
    <Link to="/admin/users" className="adm-back">
      <Icon n="chevronLeft" s={16} /> Zurück zur Kundenliste
    </Link>
  );

  if (loading) {
    return (
      <div className="adm-page">
        {back}
        <div className="table-card"><div className="loading-center"><span className="spinner spinner-dark" /> Wird geladen…</div></div>
      </div>
    );
  }
  if (notFound) {
    return (
      <div className="adm-page">
        {back}
        <div className="table-card"><div className="empty"><div className="empty-icon">🔎</div><div className="empty-title">Kunde nicht gefunden</div></div></div>
      </div>
    );
  }
  if (error || !user) {
    return (
      <div className="adm-page">
        {back}
        <div className="alert alert-error"><Icon n="x" s={16} />{error || GENERIC_ERROR}</div>
      </div>
    );
  }

  const u = user;
  const [statusCls, statusLabel] = userStatusMeta(statusOf(u));
  const [roleCls, roleLabel] = userRoleMeta(roleOf(u));
  const anonAt = anonymizedAtOf(u);

  const isAnonymized = statusOf(u) === "anonymized" || !!anonAt;
  // Bewertet ausschließlich die ohnehin gelieferten Felder company_name/name.
  // Anonymisierte Konten sind ausgenommen (Tombstone ist kein Datenpflegefall).
  const b2bHint = b2bCompletenessHint(u);
  // Minimale Ziel-Identität im Modal — maximal ID/Firma/Name, KEINE Adresse.
  const targetLabel = `#${dash(idOf(u))} · ${companyOf(u) || nameOf(u) || "Kunde"}`;
  const confirmed = anonInput.trim() === "ANONYMIZE_USER";

  const openAnon = () => { setAnonMsg(null); setAnonInput(""); setAnonOpen(true); };
  const closeAnon = () => { if (!anonBusy) { setAnonOpen(false); setAnonInput(""); } };
  const confirmAnon = async () => {
    const confirmation = anonInput.trim();
    if (confirmation !== "ANONYMIZE_USER") return; // ohne exakte Eingabe kein Request
    setAnonBusy(true);
    setAnonMsg(null);
    try {
      const r = await anonymizeAdminUser(id, confirmation);
      if (!r.ok) {
        // 401/403 → zentraler Logout/Redirect via apiFetch; hier nichts anzeigen.
        if (r.status !== 401 && r.status !== 403) {
          setAnonMsg({ type: "error", text: ANON_ERRORS[r.status] || ANON_ERRORS.default });
        }
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      const noOp = !!(d && (d.no_op === true || d.noop === true || d.already_anonymized === true || d.changed === false));
      setAnonMsg({ type: "success", text: noOp ? "Account war bereits anonymisiert." : "Account wurde anonymisiert." });
      load(); // Detail neu laden — Backend-Realität, kein lokales Raten
    } catch {
      setAnonMsg({ type: "error", text: ANON_ERRORS.default });
    } finally {
      setAnonBusy(false);
      setAnonOpen(false);
      setAnonInput("");
    }
  };

  const delConfirmed = delInput.trim() === "DELETE_USER";

  const openDel = () => { setDelMsg(null); setDelInput(""); setDelOpen(true); };
  const closeDel = () => { if (!delBusy) { setDelOpen(false); setDelInput(""); } };
  const confirmDelete = async () => {
    if (delInput.trim() !== "DELETE_USER") return; // ohne exakte Eingabe kein Request
    setDelBusy(true);
    setDelMsg(null);
    try {
      const r = await deleteAdminUser(id);
      if (r.ok) {
        // Erfolg: Der Kunde existiert nicht mehr — zurück zur Liste, Erfolgshinweis
        // dort als Flash. Kein Nachladen dieser (nun toten) Detailseite.
        navigate("/admin/users", { replace: true, state: { flash: "Kunde wurde gelöscht." } });
        return;
      }
      // 401/403 → zentraler Logout/Redirect via apiFetch; hier nichts anzeigen.
      if (r.status === 401 || r.status === 403) return;
      // 409 ist der erwartete Delete-Guard (Hinweis auf Anonymisierung), kein Fehler.
      setDelMsg({
        type: r.status === 409 ? "info" : "error",
        text: DELETE_ERRORS[r.status] || DELETE_ERRORS.default,
      });
    } catch {
      setDelMsg({ type: "error", text: DELETE_ERRORS.default });
    } finally {
      // Modal in jedem Fall schließen: Bei 409 würde ein erneuter Versuch dieselbe
      // Guard-Antwort liefern — der Hinweis (Anonymisierung) steht sichtbar auf der
      // Detailseite, der Anonymisieren-Button ist direkt daneben.
      setDelBusy(false);
      setDelOpen(false);
      setDelInput("");
    }
  };

  // Kundennummer: identische Feldlesung wie in der Liste, zusätzlich tolerant
  // gegenüber der Hülle des Detailendpunkts. Nie aus der internen ID abgeleitet.
  const customerNumber = customerNumberFromDetail(detailPayload, u);
  const statusCopy = accountStatusCopy(statusOf(u));
  const metrics = activityMetrics(summary);
  const deleteGate = deleteEligibility(summary);
  const selfAccount = isSelfAccount(u, currentAdminId);

  // Fachliches Freischaltungs-Gate: verbindet den Kundenstatus mit dem
  // Bestätigungsstatus des Aufschlags. Reine Bedienbarkeit — das serverseitige
  // Gate bleibt die verbindliche Instanz.
  const gate = approvalGate({
    currentStatus: statusOf(u),
    targetStatus: "approved",
    pricing,
    loading: pricingLoading,
    error: !!pricingError,
  });
  const legacyNotice = legacyApprovedNotice({
    currentStatus: statusOf(u),
    pricing,
    loading: pricingLoading,
    error: !!pricingError,
  });
  const markupNotice = legacyNotice.show
    ? { headline: legacyNotice.headline, text: legacyNotice.text }
    : { headline: "", text: MARKUP_TEXTS.confirmRequired };

  // ── Aufschlag bestätigen / aktualisieren ──────────────────────────────────
  // Ein PUT mit ausschließlich { priceMarkupPercent }; die Kunden-ID stammt allein
  // aus der Adminroute (useParams), nie aus einer Eingabe. Die Bestätigung des
  // Aufschlags und die Freischaltung bleiben zwei getrennte Requests.
  const saveMarkup = async (percent) => {
    if (saveInFlight.current) return; // Doppelübermittlung ausgeschlossen
    saveInFlight.current = true;
    const wasConfirmed = isMarkupConfirmed(pricing);
    setSaveBusy(true);
    setSaveError(null);
    setSaveSuccess("");
    setApproveMsg(null);
    try {
      const r = await updateAdminCustomerPriceMarkup(id, percent);
      if (!r.ok) {
        let body = null;
        try { body = await r.json(); } catch { body = null; }
        const err = markupSaveError(r.status, body); // null bei 401/403 (zentral)
        if (err) setSaveError(err);
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      // Bestätigte Antwort übernehmen, wenn sie verwertbar ist — sonst die
      // Backend-Realität frisch nachladen. Kein Raten, kein Zwischenzustand mit
      // falscher Bestätigungsanzeige.
      const next = selectPriceMarkup(d);
      if (next && next.confirmed === true && next.priceMarkupPercent !== null) setPricing(next);
      else await loadPricing();
      setSaveSuccess(markupSuccessMessage(wasConfirmed));
    } catch {
      setSaveError({ field: false, text: MARKUP_SAVE_ERRORS.default });
    } finally {
      saveInFlight.current = false;
      setSaveBusy(false);
    }
  };

  // ── Freischaltung / Reaktivierung ─────────────────────────────────────────
  // Nutzt weiterhin den bestehenden Statusendpunkt (PATCH /admin/users/:id/status)
  // mit ausschließlich { status: "approved" }. Der Request wird nur abgesetzt,
  // wenn das Frontend nicht sicher weiß, dass die Bestätigung fehlt — das
  // serverseitige Gate bleibt trotzdem verbindlich (409 wird behandelt).
  const confirmApprove = async () => {
    if (approveInFlight.current) return;
    if (!gate.allowed) return;
    approveInFlight.current = true;
    setApproveBusy(true);
    setApproveMsg(null);
    try {
      const r = await setAdminUserStatus(id, "approved");
      if (!r.ok) {
        let body = null;
        try { body = await r.json(); } catch { body = null; }
        const err = approvalError(r.status, body); // null bei 401/403 (zentral)
        if (err) {
          setApproveMsg({ type: "error", text: err.text });
          // Parallele Änderung: Pricing-Daten frisch holen, damit die Ansicht
          // nicht veraltet weiter „freischaltbar" zeigt.
          if (err.reloadPricing) await loadPricing();
        }
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      const noOp = !!(d && (d.no_op === true || d.noop === true || d.changed === false || d.unchanged === true));
      setApproveMsg({
        type: "success",
        text: noOp ? "Status war bereits gesetzt." : "Der Kunde wurde freigeschaltet.",
      });
      setSaveSuccess("");
      load(); // Backend-Realität neu laden (kein optimistisches Raten)
    } catch {
      setApproveMsg({ type: "error", text: APPROVAL_ERRORS.default });
    } finally {
      approveInFlight.current = false;
      setApproveBusy(false);
      setApproveOpen(false);
    }
  };

  // ── Blockieren ────────────────────────────────────────────────────────────
  // Erreichbar, aber bewusst nicht die visuelle Hauptaktion der Seite. Immer mit
  // Bestätigungsdialog, immer nur ein Request, Erfolgsmeldung erst nach Erfolg.
  const confirmBlock = async () => {
    if (blockInFlight.current) return;
    if (selfAccount) return; // eigenes Adminkonto nicht blockieren
    blockInFlight.current = true;
    setBlockBusy(true);
    setApproveMsg(null);
    try {
      const r = await setAdminUserStatus(id, "blocked");
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return; // zentraler Redirect
        let body = null;
        try { body = await r.json(); } catch { body = null; }
        const serverText = body && typeof body.error === "string" && body.error.trim() ? body.error.trim() : "";
        setApproveMsg({
          type: "error",
          text: serverText || "Der Kunde wurde nicht blockiert. Es wurden keine Änderungen gespeichert.",
        });
        return;
      }
      setApproveMsg({ type: "success", text: statusSuccessMessage("blocked") });
      load(); // Backend-Realität neu laden
    } catch {
      setApproveMsg({ type: "error", text: "Der Kunde wurde nicht blockiert. Es wurden keine Änderungen gespeichert." });
    } finally {
      blockInFlight.current = false;
      setBlockBusy(false);
      setBlockOpen(false);
    }
  };

  return (
    <div className="adm-page">
      {back}

      {/* Fehlende B2B-Stammdaten: bei Alt-Konten aus der Zeit, in der Firmenname und
          Ansprechpartner optional waren. Die Freischaltung wird serverseitig blockiert,
          solange die Angaben fehlen — der Hinweis macht das vor dem Klick sichtbar. */}
      {b2bHint.show && (
        <div className="adm-b2b-warn" role="status">
          <Icon n="shield" s={16} />
          <span>
            <strong>{b2bHint.headline}</strong>
            <span className="adm-b2b-warn-text">{b2bHint.text}</span>
          </span>
        </div>
      )}

      {anonMsg && (
        <div className={`alert ${anonMsg.type === "success" ? "alert-success" : "alert-error"}`}>
          <Icon n={anonMsg.type === "success" ? "check" : "x"} s={16} />{anonMsg.text}
        </div>
      )}

      {delMsg && (
        <div className={`alert ${delMsg.type === "info" ? "alert-info" : "alert-error"}`}>
          <Icon n={delMsg.type === "info" ? "info" : "x"} s={16} />{delMsg.text}
        </div>
      )}

      {/* 1) Kopfbereich — kompakt: Identität, Status und die statusabhängige
             Hauptaktion. Gefährliche Aktionen sind hier bewusst NICHT die
             Hauptaktion der Seite. */}
      <div className="adm-card adm-detail-header">
        <div className="adm-card-body">
          <div className="adm-detail-head">
            <div className="adm-detail-ident">
              <h1 className="adm-detail-id">{companyOf(u) || nameOf(u) || `Kunde #${dash(idOf(u))}`}</h1>
              <p className="adm-detail-sub">
                {nameOf(u) && <span>{nameOf(u)}</span>}
                {emailOf(u) && <span className="adm-detail-mail">{emailOf(u)}</span>}
              </p>
              <span className="adm-detail-badges">
                <span className={`badge ${statusCls}`}>{statusLabel}</span>
                {customerNumber
                  ? <span className="adm-chip adm-mono">{customerNumber}</span>
                  : <span className="adm-chip adm-chip-muted">Kundennummer nicht hinterlegt</span>}
                {/* Rolle nur bei Sonderkonten — normale Kunden tragen keine Rollenangabe. */}
                {roleOf(u) === "admin" && <span className={`badge ${roleCls}`}>{roleLabel}</span>}
                <span className="adm-chip"><Icon n="calendar" s={13} /> Registriert {fmtDate(createdOf(u))}</span>
                {anonAt && <span className="adm-chip"><Icon n="lock" s={13} /> Anonymisiert {fmtDate(anonAt)}</span>}
              </span>
            </div>
            {/* Statusabhängige Hauptaktion: freischalten bzw. reaktivieren.
                Für freigeschaltete Konten steht hier bewusst keine rote Aktion —
                Blockieren liegt zurückhaltend im Kontostatus-Bereich. */}
            {statusCopy.actionKind === "approve" && (
              <div className="adm-detail-action">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => { setApproveMsg(null); setApproveOpen(true); }}
                  disabled={approveBusy || !gate.allowed}
                  aria-describedby={!gate.allowed ? "adm-approve-gate" : undefined}
                >
                  <Icon n="check" s={14} /> {statusCopy.actionLabel}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="adm-cards">
        {/* 2) Unternehmen und Kontakt */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="building" s={17} /> Unternehmen und Kontakt</div>
          <div className="adm-card-body">
            <KV items={[
              ["Firmenname", missingField(u, "company_name") || dash(companyOf(u))],
              ["Ansprechpartner", missingField(u, "name") || dash(nameOf(u))],
              ["E-Mail", dash(emailOf(u))],
              ["Straße", dash(streetOf(u))],
              ["PLZ", dash(zipOf(u))],
              ["Stadt", dash(cityOf(u))],
              ["Land", dash(countryOf(u))],
              ["USt-ID", dash(vatOf(u))],
              // Kundennummer = fachliche Kundenkennung (CE-K-…). Die interne
              // User-ID bleibt technischer Schlüssel und steht weiter unten.
              ["Kundennummer", customerNumber || "—"],
            ]} />
          </div>
        </div>

        {/* 3) Kontostatus und Konditionen — Status, Rolle, individueller
             Aufschlag und die zugehörige Statusaktion an einer Stelle. */}
        <CustomerMarkupSection
          pricing={pricing}
          loading={pricingLoading}
          loadError={pricingError}
          busy={saveBusy}
          saveError={saveError}
          notice={markupNotice}
          successText={saveSuccess}
          onSave={saveMarkup}
          onReload={() => loadPricing()}
          onApproveNow={gate.allowed ? () => { setApproveMsg(null); setApproveOpen(true); } : undefined}
          inputRef={markupInputRef}
          sectionRef={markupSectionRef}
        />

        <CustomerApprovalCard
          gate={gate}
          pricing={pricing}
          targetLabel={targetLabel}
          busy={approveBusy}
          message={approveMsg}
          dialogOpen={approveOpen}
          onOpenDialog={() => { setApproveMsg(null); setApproveOpen(true); }}
          onCloseDialog={() => { if (!approveBusy) setApproveOpen(false); }}
          onConfirm={confirmApprove}
          onJumpToMarkup={focusMarkup}
          blockable={statusCopy.actionKind === "block"}
          blockDisabled={selfAccount}
          blockDisabledReason={selfAccount ? SELF_ACTION_REASON : ""}
          onBlock={() => { setApproveMsg(null); setBlockOpen(true); }}
        />

        {/* 4) Aktivität und Zahlung — EINE Quelle für die Debitorenwerte (früher
             doppelt in „Zahlung" und „Aggregierte Kennzahlen"). ConfidaraExpress
             kennt kein Kreditlimit; überfällige Rechnungen lösen NICHTS aus. */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="card" s={17} /> Aktivität und Zahlung</div>
          <div className="adm-card-body">
            <div className="adm-summary">
              <Stat label="Sendungen gesamt" value={num(metrics.shipmentsTotal)} />
              <Stat label="Rechnungen gesamt" value={num(metrics.invoicesTotal)} />
              <Stat label="Offene Rechnungen" value={num(metrics.invoicesUnpaid)} />
              <Stat label="Überfällige Rechnungen" value={num(metrics.invoicesOverdue)} />
              <Stat label="Offener Betrag" value={moneyOrDash(metrics.openAmount)} />
              <Stat label="Zahlungsziel" value={PAYMENT_TERM_TEXT} text />
            </div>
            {metrics.hasOverdue && (
              <p className="adm-overdue-note" role="status">
                <Icon n="info" s={15} /> {OVERDUE_NOTE}
              </p>
            )}
          </div>
        </div>

        {/* 5) Technische Informationen — bewusst eingeklappt: für den Alltag
             nicht nötig, für Support und Nachweis aber verfügbar. */}
        <details className="adm-card adm-tech">
          <summary className="adm-card-head adm-tech-summary">
            <Icon n="settings" s={17} /> Technische Informationen
          </summary>
          <div className="adm-card-body">
            <KV items={[
              ["Interne ID", dash(idOf(u))],
              ["Rolle", <span className={`badge ${roleCls}`}>{roleLabel}</span>],
              ["Erstellt am", fmtDateTime(createdOf(u))],
              ["Passwort zuletzt geändert", fmtDateTime(pwChangedAtOf(u))],
              ["Aufschlag zuletzt bestätigt", fmtDateTime(pricing?.confirmedAt)],
              ["Aufschlag bestätigt von", dash(pricing?.confirmedBy)],
              ["Aufschlag zuletzt geändert", fmtDateTime(pricing?.updatedAt)],
              ["Anonymisiert am", fmtDateTime(anonymizedAtOf(u))],
              ["Anonymisiert von", dash(anonymizedByOf(u))],
            ]} />
          </div>
        </details>

        {/* 6) Gefahrenzone — DSGVO-Anonymisierung (irreversibel) und harte Löschung */}
        <div className="adm-card adm-danger-zone">
          <div className="adm-card-head adm-danger-head"><Icon n="shield" s={17} /> Gefahrenzone</div>
          <div className="adm-card-body">
            <div className="adm-danger-item">
              <div className="adm-danger-item-text">
                <div className="adm-danger-item-title">Account anonymisieren</div>
                <p className="adm-danger-item-desc">
                  Diese Aktion entfernt personenbezogene Kontodaten dauerhaft. Sendungen und Rechnungen bleiben
                  aus Nachweis- und Abrechnungsgründen erhalten. Diese Aktion kann nicht rückgängig gemacht werden.
                </p>
                <p className="adm-support-hint" style={{ marginTop: 6 }}>Die Aktion wird protokolliert.</p>
              </div>
              <div className="adm-danger-item-action">
                <button
                  type="button"
                  className="btn btn-sm adm-danger-button"
                  onClick={openAnon}
                  disabled={isAnonymized || selfAccount}
                  aria-describedby={selfAccount ? "adm-self-note" : undefined}
                >
                  <Icon n="user" s={13} /> Account anonymisieren
                </button>
              </div>
            </div>
            {isAnonymized && <p className="adm-danger-note">Dieser Account ist bereits anonymisiert.</p>}
            {selfAccount && <p className="adm-danger-note" id="adm-self-note">{SELF_ACTION_REASON}</p>}

            {/* Harte Löschung — NUR ohne abhängige Sendungs-/Rechnungsdaten. Sind
                solche Daten bereits bekannt, wird die Aktion nicht als zulässig
                dargestellt. Der serverseitige Guard (409) bleibt maßgeblich. */}
            <div className="adm-danger-item adm-danger-item-split">
              <div className="adm-danger-item-text">
                <div className="adm-danger-item-title">Kunde löschen</div>
                <p className="adm-danger-item-desc">
                  Diese Aktion ist nur für Kunden ohne Sendungs- oder Rechnungsdaten möglich.
                  Bei bestehenden Daten muss anonymisiert werden.
                </p>
                {!deleteGate.allowed && (
                  <p className="adm-danger-note" id="adm-delete-note">{deleteGate.reason}</p>
                )}
                <p className="adm-support-hint" style={{ marginTop: 6 }}>Die Aktion wird protokolliert.</p>
              </div>
              <div className="adm-danger-item-action">
                <button
                  type="button"
                  className="btn btn-sm adm-danger-button"
                  onClick={openDel}
                  disabled={!deleteGate.allowed || selfAccount}
                  aria-describedby={!deleteGate.allowed ? "adm-delete-note" : (selfAccount ? "adm-self-note" : undefined)}
                >
                  <Icon n="trash" s={13} /> Kunde löschen
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Blockieren — Bestätigungsdialog, kein Statuswechsel durch einen Klick. */}
      {blockOpen && (
        <BlockConfirmDialog
          name={targetLabel}
          busy={blockBusy}
          onCancel={() => { if (!blockBusy) setBlockOpen(false); }}
          onConfirm={confirmBlock}
        />
      )}

      {/* Type-to-confirm-Modal — irreversibel, exakt „ANONYMIZE_USER" nötig. */}
      {anonOpen && (
        <div className="adm-modal-overlay" role="presentation" onClick={closeAnon}>
          <div
            className="adm-modal adm-modal-danger"
            role="dialog"
            aria-modal="true"
            aria-labelledby="adm-anon-title"
            aria-describedby="adm-anon-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="adm-modal-icon adm-modal-icon-danger" aria-hidden="true"><Icon n="shield" s={22} /></div>
            <h2 id="adm-anon-title" className="adm-modal-title">Account wirklich anonymisieren?</h2>
            <p id="adm-anon-desc" className="adm-modal-text">
              Diese Aktion ist irreversibel. Der Kunde kann sich danach nicht mehr anmelden. Personenbezogene Kontodaten werden entfernt.
            </p>
            <p className="adm-modal-sub">{targetLabel}</p>
            <label className="adm-modal-label" htmlFor="adm-anon-input">Tippe ANONYMIZE_USER ein, um fortzufahren.</label>
            <input
              id="adm-anon-input"
              className="adm-modal-input"
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              placeholder="ANONYMIZE_USER"
              value={anonInput}
              onChange={(e) => setAnonInput(e.target.value)}
              disabled={anonBusy}
            />
            <div className="adm-modal-actions">
              <button type="button" className="btn btn-outline btn-sm" onClick={closeAnon} disabled={anonBusy}>Abbrechen</button>
              <button
                type="button"
                className="btn btn-sm adm-danger-button"
                onClick={confirmAnon}
                disabled={anonBusy || !confirmed}
              >
                {anonBusy
                  ? <><span className="spinner spinner-dark" /> Anonymisiere…</>
                  : <><Icon n="shield" s={14} /> Anonymisierung bestätigen</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Type-to-confirm-Modal (Löschen) — hart & irreversibel, exakt „DELETE_USER" nötig. */}
      {delOpen && (
        <div className="adm-modal-overlay" role="presentation" onClick={closeDel}>
          <div
            className="adm-modal adm-modal-danger"
            role="dialog"
            aria-modal="true"
            aria-labelledby="adm-del-title"
            aria-describedby="adm-del-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="adm-modal-icon adm-modal-icon-danger" aria-hidden="true"><Icon n="trash" s={22} /></div>
            <h2 id="adm-del-title" className="adm-modal-title">Kunde wirklich löschen?</h2>
            <p id="adm-del-desc" className="adm-modal-text">
              Diese Aktion löscht den Kunden hart, sofern keine abhängigen Sendungs- oder Rechnungsdaten
              existieren. Die Aktion wird protokolliert.
            </p>
            <p className="adm-modal-sub">{targetLabel}</p>
            <label className="adm-modal-label" htmlFor="adm-del-input">Tippe DELETE_USER ein, um fortzufahren.</label>
            <input
              id="adm-del-input"
              className="adm-modal-input"
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              placeholder="DELETE_USER"
              value={delInput}
              onChange={(e) => setDelInput(e.target.value)}
              disabled={delBusy}
            />
            <div className="adm-modal-actions">
              <button type="button" className="btn btn-outline btn-sm" onClick={closeDel} disabled={delBusy}>Abbrechen</button>
              <button
                type="button"
                className="btn btn-sm adm-danger-button"
                onClick={confirmDelete}
                disabled={delBusy || !delConfirmed}
              >
                {delBusy
                  ? <><span className="spinner spinner-dark" /> Lösche…</>
                  : <><Icon n="trash" s={14} /> Löschung bestätigen</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Bestätigungsdialog für das Blockieren. Fokus beim Öffnen auf „Abbrechen",
// Escape schließt (außer während des Requests), der Fokus kehrt danach zum
// auslösenden Element zurück. Der Request läuft genau einmal.
function BlockConfirmDialog({ name, busy, onCancel, onConfirm }) {
  const cancelRef = useRef(null);
  const openerRef = useRef(typeof document !== "undefined" ? document.activeElement : null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape" && !busy) onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      openerRef.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="adm-modal-overlay"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}
    >
      <div
        className="adm-modal adm-modal-danger"
        role="dialog"
        aria-modal="true"
        aria-labelledby="adm-block-title"
        aria-describedby="adm-block-desc"
      >
        <div className="adm-modal-icon adm-modal-icon-danger" aria-hidden="true"><Icon n="lock" s={22} /></div>
        <h2 id="adm-block-title" className="adm-modal-title">{BLOCK_DIALOG.title}</h2>
        <p className="adm-modal-sub">{name}</p>
        <p id="adm-block-desc" className="adm-modal-text">{BLOCK_DIALOG.text}</p>
        <div className="adm-modal-actions">
          <button type="button" ref={cancelRef} className="btn btn-outline btn-sm" onClick={onCancel} disabled={busy}>
            {BLOCK_DIALOG.cancel}
          </button>
          <button
            type="button"
            className="btn btn-sm adm-btn-danger"
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy ? "true" : undefined}
          >
            {busy
              ? <><span className="spinner spinner-dark" /> Wird gespeichert…</>
              : <><Icon n="lock" s={14} /> {BLOCK_DIALOG.confirm}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
