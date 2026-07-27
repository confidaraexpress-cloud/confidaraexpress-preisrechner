import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { getAdminUser, anonymizeAdminUser, deleteAdminUser } from "../../api/adminApi";
import { money } from "../../utils/formatters";
import { userStatusMeta, userRoleMeta, paymentTermLabel } from "../../utils/adminUsers";
import { b2bCompletenessHint, missingB2BAccountFields, isAnonymizedAccount } from "../../utils/b2bAccount.mjs";

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
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [summary, setSummary] = useState({});
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
  useEffect(() => {
    setAnonOpen(false); setAnonInput(""); setAnonMsg(null);
    setDelOpen(false); setDelInput(""); setDelMsg(null);
  }, [id]);

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
              ["Ansprechpartner", missingField(u, "name") || dash(nameOf(u))],
              ["Firmenname", missingField(u, "company_name") || dash(companyOf(u))],
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

        {/* 4) Zahlungsdaten — ConfidaraExpress kennt kein Kreditlimit. Die offenen
             Beträge sind reine Debitoreninformation und lösen nichts automatisch aus;
             bei Zahlungsproblemen sperrt der Admin das Konto manuell. */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="card" s={17} /> Zahlung</div>
          <div className="adm-card-body">
            <KV items={[
              ["Zahlungsziel", paymentTermLabel(paymentTermOf(u))],
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

            {/* Harte Löschung — nur ohne abhängige Daten; sonst greift der Backend-Guard (409). */}
            <div className="adm-danger-item adm-danger-item-split">
              <div className="adm-danger-item-text">
                <div className="adm-danger-item-title">Kunde löschen</div>
                <p className="adm-danger-item-desc">
                  Diese Aktion ist nur für Kunden ohne Sendungs- oder Rechnungsdaten möglich.
                  Bei bestehenden Daten muss anonymisiert werden.
                </p>
                <p className="adm-support-hint" style={{ marginTop: 6 }}>Die Aktion wird protokolliert.</p>
              </div>
              <div className="adm-danger-item-action">
                <button
                  type="button"
                  className="btn btn-sm adm-danger-button"
                  onClick={openDel}
                >
                  <Icon n="trash" s={13} /> Kunde löschen
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
