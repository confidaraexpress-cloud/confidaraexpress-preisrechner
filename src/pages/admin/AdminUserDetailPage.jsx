import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { getAdminUser, anonymizeAdminUser } from "../../api/adminApi";
import { money } from "../../utils/formatters";
import { userStatusMeta, userRoleMeta, paymentTermLabel } from "../../utils/adminUsers";

const firstDefined = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== "");

const ERROR_MESSAGES = {
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
  500: "Der Kunde konnte nicht geladen werden. Bitte versuchen Sie es erneut.",
};
const GENERIC_ERROR = "Der Kunde konnte nicht geladen werden. Bitte versuchen Sie es erneut.";

// Fehlertexte für die Anonymisierung (verständlich, kein roher Backend-Body).
const ANON_ERRORS = {
  400: "Bestätigung ungültig oder Aktion nicht erlaubt.",
  404: "Kunde wurde nicht gefunden.",
  409: "Anonymisierung konnte aufgrund eines Konflikts nicht durchgeführt werden.",
  429: "Zu viele Adminaktionen. Bitte später erneut versuchen.",
  500: "Account konnte nicht anonymisiert werden.",
  default: "Account konnte nicht anonymisiert werden.",
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
const creditUsedOf = (u) => firstDefined(u.credit_used, u.creditUsed);
const creditLimitOf = (u) => firstDefined(u.credit_limit, u.creditLimit);
const paymentTermOf = (u) => firstDefined(u.payment_term, u.paymentTerm);
const createdOf = (u) => firstDefined(u.created_at, u.createdAt, u.created);
const anonymizedAtOf = (u) => firstDefined(u.anonymized_at, u.anonymizedAt);
const anonymizedByOf = (u) => firstDefined(u.anonymized_by, u.anonymizedBy);
const pwChangedAtOf = (u) => firstDefined(u.password_changed_at, u.passwordChangedAt);

const num = (v) => (v != null && v !== "" && Number.isFinite(Number(v)) ? String(Number(v)) : "—");
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

function Stat({ label, value }) {
  return (
    <div className="adm-stat">
      <div className="adm-stat-label">{label}</div>
      <div className="adm-stat-value">{value}</div>
    </div>
  );
}

export default function AdminUserDetailPage() {
  const { id } = useParams();
  const [user, setUser] = useState(null);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [anonOpen, setAnonOpen] = useState(false);   // Type-to-confirm-Modal
  const [anonInput, setAnonInput] = useState("");    // getippter Bestätigungstext
  const [anonBusy, setAnonBusy] = useState(false);   // Anonymisierung läuft
  const [anonMsg, setAnonMsg] = useState(null);      // { type, text }

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

  // Beim Wechsel auf einen anderen Kunden Modal/Meldung zurücksetzen (nicht bei
  // manuellem Reload nach Erfolg — dort bleibt der Erfolgshinweis sichtbar).
  useEffect(() => { setAnonOpen(false); setAnonInput(""); setAnonMsg(null); }, [id]);

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

  return (
    <div className="adm-page">
      {back}

      {anonMsg && (
        <div className={`alert ${anonMsg.type === "success" ? "alert-success" : "alert-error"}`}>
          <Icon n={anonMsg.type === "success" ? "check" : "x"} s={16} />{anonMsg.text}
        </div>
      )}

      {/* 1) Kopfbereich */}
      <div className="adm-card">
        <div className="adm-card-body">
          <div className="adm-detail-head">
            <span className="adm-detail-id">{companyOf(u) || nameOf(u) || `Kunde #${dash(idOf(u))}`}</span>
            <span className="adm-detail-badges">
              <span className="adm-chip">#{dash(idOf(u))}</span>
              <span className={`badge ${statusCls}`}>{statusLabel}</span>
              <span className={`badge ${roleCls}`}>{roleLabel}</span>
              <span className="adm-chip"><Icon n="calendar" s={13} /> Erstellt {fmtDate(createdOf(u))}</span>
              {anonAt && <span className="adm-chip"><Icon n="lock" s={13} /> Anonymisiert {fmtDate(anonAt)}</span>}
            </span>
          </div>
        </div>
      </div>

      <div className="adm-cards">
        {/* 2) Stammdaten */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="idcard" s={17} /> Stammdaten</div>
          <div className="adm-card-body">
            <KV items={[
              ["Name", dash(nameOf(u))],
              ["Firma", dash(companyOf(u))],
              ["E-Mail", dash(emailOf(u))],
              ["USt-ID", dash(vatOf(u))],
              ["Straße", dash(streetOf(u))],
              ["PLZ", dash(zipOf(u))],
              ["Stadt", dash(cityOf(u))],
              ["Land", dash(countryOf(u))],
            ]} />
          </div>
        </div>

        {/* 3) Konto / Sicherheit */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="shieldCheck" s={17} /> Konto &amp; Sicherheit</div>
          <div className="adm-card-body">
            <KV items={[
              ["Rolle", <span className={`badge ${roleCls}`}>{roleLabel}</span>],
              ["Status", <span className={`badge ${statusCls}`}>{statusLabel}</span>],
              ["Passwort zuletzt geändert", fmtDateTime(pwChangedAtOf(u))],
              ["Anonymisiert am", fmtDateTime(anonymizedAtOf(u))],
              ["Anonymisiert von", dash(anonymizedByOf(u))],
            ]} />
          </div>
        </div>

        {/* 4) Zahlungs-/Kreditdaten */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="card" s={17} /> Zahlung &amp; Kredit</div>
          <div className="adm-card-body">
            <KV items={[
              ["Zahlungsziel", paymentTermLabel(paymentTermOf(u))],
              ["Kredit genutzt", moneyOrDash(creditUsedOf(u))],
              ["Kreditlimit", moneyOrDash(creditLimitOf(u))],
              ["Offener Betrag", moneyOrDash(firstDefined(summary.open_amount, summary.openAmount))],
              ["Unbezahlte Rechnungen", num(firstDefined(summary.invoices_unpaid, summary.invoicesUnpaid))],
              ["Überfällige Rechnungen", num(firstDefined(summary.invoices_overdue, summary.invoicesOverdue))],
            ]} />
          </div>
        </div>

        {/* 5) Summary-Kacheln (nur Aggregate) */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="dashboard" s={17} /> Aggregierte Kennzahlen</div>
          <div className="adm-card-body">
            <div className="adm-summary">
              <Stat label="Sendungen gesamt" value={num(firstDefined(summary.shipments_total, summary.shipmentsTotal))} />
              <Stat label="Rechnungen gesamt" value={num(firstDefined(summary.invoices_total, summary.invoicesTotal))} />
              <Stat label="Unbezahlte Rechnungen" value={num(firstDefined(summary.invoices_unpaid, summary.invoicesUnpaid))} />
              <Stat label="Überfällige Rechnungen" value={num(firstDefined(summary.invoices_overdue, summary.invoicesOverdue))} />
              <Stat label="Offener Betrag" value={moneyOrDash(firstDefined(summary.open_amount, summary.openAmount))} />
            </div>
          </div>
        </div>

        {/* 6) Gefahrenzone — DSGVO-Anonymisierung (irreversibel) */}
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
                  disabled={isAnonymized}
                >
                  <Icon n="user" s={13} /> Account anonymisieren
                </button>
              </div>
            </div>
            {isAnonymized && <p className="adm-danger-note">Dieser Account ist bereits anonymisiert.</p>}

            {/* Löschen bleibt Platzhalter — folgt in einem separaten Schritt. */}
            <div className="adm-danger-item adm-danger-item-soon">
              <div className="adm-danger-item-text">
                <div className="adm-danger-item-title">Account löschen</div>
                <p className="adm-danger-item-desc">Endgültiges Löschen folgt in einem separaten, abgesicherten Schritt.</p>
              </div>
              <div className="adm-danger-item-action">
                <button type="button" className="btn btn-outline btn-sm" disabled title="Folgt in einem späteren Schritt">
                  <Icon n="x" s={13} /> Löschen — folgt
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

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
    </div>
  );
}
