import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DateField } from "./DateField";
import { CopyableNumber } from "../ui/CopyableNumber";
import {
  createAdminPreliveCustomer,
  createAdminPrelivePartner,
  createAdminPrelivePasswordLink,
} from "../../api/adminApi";
import { adminPartnerStatusMeta, formatTimestamp, loginStatusMeta } from "../../utils/adminSalesPartnerView.mjs";
import {
  CUSTOMER_ASSIGNMENT_OPTIONS,
  MAX_EMAIL_LENGTH,
  MAX_TEXT_LENGTH,
  PRELIVE_TEXTS,
  buildTestCustomerBody,
  buildTestPartnerBody,
  normalizePasswordLink,
  preliveErrorOutcome,
  prelivePositiveId,
  testAccountName,
  testPartnerNameById,
} from "../../utils/salesPartnerPrelive.mjs";

const LEER_PARTNER = { name: "", email: "", companyName: "", sponsorUserId: "" };
const LEER_KUNDE = { companyName: "", email: "", name: "", assignment: "none", partnerUserId: "", referralCode: "", assignedSince: "" };

function Badge({ meta }) {
  const [cls, label] = meta;
  return <span className={`badge ${cls}`}>{label}</span>;
}

/* ── Pre-Live · Testkonten ───────────────────────────────────────────────────
   Testpartner und Testkunden (nur Konten mit Testkennzeichnung des Servers),
   je mit „Passwort-Link": der Server erzeugt einen einmaligen Link (15
   Minuten), die Seite zeigt ihn genau einmal mit Kopierknopf — nur im
   Komponentenzustand, nie in localStorage, nie in einem Log; „Ausblenden"
   verwirft ihn. Ein neuer Testpartner ist „In Prüfung" und wird über die
   NORMALE Partnerseite freigegeben (Link nach dem Anlegen). Ein Testkunde
   wird optional einem Testpartner zugeordnet — über die Auswahl oder den
   Empfehlungscode eines Testpartners; „zugeordnet seit" darf zurückliegen. */
export function PreliveAccountsCard({ accounts, loading = false, error = "", onReload, onChanged, onDisabled }) {
  const partner = accounts?.partners || [];
  const kunden = accounts?.customers || [];

  const [pForm, setPForm] = useState(LEER_PARTNER);
  const [pErrors, setPErrors] = useState({});
  const [pBusy, setPBusy] = useState(false);
  const [pMessage, setPMessage] = useState(null);        // { type, text, id }
  const [kForm, setKForm] = useState(LEER_KUNDE);
  const [kErrors, setKErrors] = useState({});
  const [kBusy, setKBusy] = useState(false);
  const [kMessage, setKMessage] = useState(null);        // { type, text, id }
  const [link, setLink] = useState(null);                // { name, resetUrl, expiresAt }
  const [linkBusy, setLinkBusy] = useState(null);        // Kennung während der Anfrage
  const [linkError, setLinkError] = useState("");
  const linkBox = useRef(null);
  const ausloeser = useRef(null);                        // Knopf, der den Link angefordert hat
  const inFlight = useRef(false);

  // Der Link erscheint einmal; der Fokus springt auf den Kasten, damit
  // Tastatur- und Screenreadernutzer ihn sofort erreichen.
  useEffect(() => { if (link && linkBox.current) linkBox.current.focus(); }, [link]);

  const setP = (k, v) => { setPForm((f) => ({ ...f, [k]: v })); setPErrors((e) => ({ ...e, [k]: undefined })); };
  const setK = (k, v) => { setKForm((f) => ({ ...f, [k]: v })); setKErrors((e) => ({ ...e, [k]: undefined })); };

  const antwortLesen = async (r) => { try { return await r.json(); } catch { return null; } };

  const partnerAnlegen = async (e) => {
    e.preventDefault();
    if (inFlight.current) return;
    setPMessage(null);
    const gebaut = buildTestPartnerBody(pForm);
    if (!gebaut.ok) { setPErrors(gebaut.errors); return; }
    setPErrors({});
    inFlight.current = true;
    setPBusy(true);
    try {
      const r = await createAdminPrelivePartner(gebaut.body);
      const d = await antwortLesen(r);
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        const folge = preliveErrorOutcome(r.status, d);
        if (folge.field) setPErrors({ [folge.field]: folge.text });
        setPMessage({ type: "error", text: folge.text });
        if (folge.disabled) onDisabled?.();
        return;
      }
      const neu = d && typeof d === "object" ? d.partner : null;
      const id = prelivePositiveId(neu?.id);
      setPForm(LEER_PARTNER);
      setPMessage({
        type: "success",
        text: `Testpartner „${testAccountName({ ...neu, id }, "Testpartner")}“ wurde angelegt (In Prüfung). Freigabe und Sätze laufen über die normale Partnerseite.`,
        id,
      });
      onChanged?.();
    } catch {
      setPMessage({ type: "error", text: "Der Testpartner wurde nicht angelegt. Bitte laden Sie die Testkonten neu, bevor Sie es erneut versuchen." });
    } finally {
      inFlight.current = false;
      setPBusy(false);
    }
  };

  const kundeAnlegen = async (e) => {
    e.preventDefault();
    if (inFlight.current) return;
    setKMessage(null);
    const gebaut = buildTestCustomerBody(kForm);
    if (!gebaut.ok) { setKErrors(gebaut.errors); return; }
    setKErrors({});
    inFlight.current = true;
    setKBusy(true);
    try {
      const r = await createAdminPreliveCustomer(gebaut.body);
      const d = await antwortLesen(r);
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        const folge = preliveErrorOutcome(r.status, d);
        if (folge.field) setKErrors({ [folge.field]: folge.text });
        setKMessage({ type: "error", text: folge.text });
        if (folge.disabled) onDisabled?.();
        return;
      }
      const neu = d && typeof d === "object" ? d.customer : null;
      const zuordnung = d && typeof d === "object" && d.attribution && typeof d.attribution === "object" ? d.attribution : null;
      const id = prelivePositiveId(neu?.id);
      const seit = zuordnung ? formatTimestamp(zuordnung.validFrom) : "—";
      setKForm(LEER_KUNDE);
      setKMessage({
        type: "success",
        text: `Testkunde „${testAccountName({ ...neu, id }, "Testkunde")}“ wurde angelegt.${zuordnung
          ? ` Zugeordnet zu ${testPartnerNameById(partner, zuordnung.partnerUserId) || "dem Testpartner"}${seit !== "—" ? ` ab ${seit}` : ""}.`
          : " Ohne Partnerzuordnung."}`,
        id,
      });
      onChanged?.();
    } catch {
      setKMessage({ type: "error", text: "Der Testkunde wurde nicht angelegt. Bitte laden Sie die Testkonten neu, bevor Sie es erneut versuchen." });
    } finally {
      inFlight.current = false;
      setKBusy(false);
    }
  };

  const passwortLink = async (konto, art, knopf) => {
    if (inFlight.current) return;
    inFlight.current = true;
    ausloeser.current = knopf || null;
    setLinkBusy(konto.id);
    setLinkError("");
    setLink(null);
    try {
      const r = await createAdminPrelivePasswordLink(konto.id);
      const d = await antwortLesen(r);
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        const folge = preliveErrorOutcome(r.status, d);
        setLinkError(folge.text);
        if (folge.disabled) onDisabled?.();
        return;
      }
      const gelesen = normalizePasswordLink(d);
      if (!gelesen) { setLinkError(PRELIVE_TEXTS.passwordLinkError); return; }
      setLink({ name: testAccountName(konto, art), ...gelesen });
    } catch {
      setLinkError(PRELIVE_TEXTS.passwordLinkError);
    } finally {
      inFlight.current = false;
      setLinkBusy(null);
    }
  };

  const pFehler = (k) => (pErrors[k] ? <span className="field-error">{pErrors[k]}</span> : null);
  const kFehler = (k) => (kErrors[k] ? <span className="field-error">{kErrors[k]}</span> : null);
  const meldung = (m, id) => (m ? (
    <div className={`alert ${m.type === "success" ? "alert-success" : "alert-error"}`} role={m.type === "success" ? "status" : "alert"} id={id}>
      <span>{m.text}</span>
    </div>
  ) : null);

  let listen;
  if (loading && !accounts) {
    listen = <div className="loading-center" role="status"><span className="spinner spinner-dark" /> Testkonten werden geladen…</div>;
  } else if (error || !accounts) {
    listen = (
      <>
        <div className="alert alert-error" role="alert">{error || PRELIVE_TEXTS.accountsError}</div>
        <button type="button" className="btn btn-outline btn-sm" onClick={onReload}>Erneut versuchen</button>
      </>
    );
  } else {
    listen = (
      <>
        <h3 className="adm-sp-subtitle">Testpartner</h3>
        {partner.length === 0 ? (
          <p className="adm-support-hint" id="adm-pl-partners-empty">Noch keine Testpartner.</p>
        ) : (
          <div className="table-scroll adm-sp-mini-table" id="adm-pl-partners">
            <table>
              <caption className="sr-only">Testpartner: Partner, Status, Login, Sponsor, Empfehlungscode, Aktionen.</caption>
              <thead>
                <tr>
                  <th scope="col">Testpartner</th>
                  <th scope="col">Status</th>
                  <th scope="col">Login</th>
                  <th scope="col">Sponsor</th>
                  <th scope="col">Empfehlungscode</th>
                  <th scope="col">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {partner.map((p) => (
                  <tr key={p.id} data-partner-id={p.id}>
                    <td>
                      <div className="adm-sp-partner">
                        <Link className="adm-sp-name" to={`/admin/partners/${encodeURIComponent(p.id)}`}>{testAccountName(p, "Testpartner")}</Link>
                        {p.companyName && p.name && <span className="adm-sp-sub">{p.name}</span>}
                        {p.email && <span className="adm-sp-sub adm-sp-mail">{p.email}</span>}
                      </div>
                    </td>
                    <td><Badge meta={adminPartnerStatusMeta(p.status)} /></td>
                    <td><Badge meta={loginStatusMeta(p.loginStatus)} /></td>
                    <td>{p.sponsorUserId !== null ? (testPartnerNameById(partner, p.sponsorUserId) || `Testpartner #${p.sponsorUserId}`) : "—"}</td>
                    <td>{p.referralCode ? <span className="adm-mono">{p.referralCode}</span> : "—"}</td>
                    <td>
                      <div className="adm-sp-row-actions">
                        <button type="button" className="btn btn-outline btn-sm" id={`adm-pl-pwlink-${p.id}`}
                          onClick={(e) => passwortLink(p, "Testpartner", e.currentTarget)} disabled={linkBusy !== null}
                          aria-busy={linkBusy === p.id ? "true" : undefined}
                          aria-label={`Passwort-Link erzeugen: ${testAccountName(p, "Testpartner")}`}>
                          Passwort-Link
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h3 className="adm-sp-subtitle">Testkunden</h3>
        {kunden.length === 0 ? (
          <p className="adm-support-hint" id="adm-pl-customers-empty">Noch keine Testkunden.</p>
        ) : (
          <div className="table-scroll adm-sp-mini-table" id="adm-pl-customers">
            <table>
              <caption className="sr-only">Testkunden: Kunde, zugeordneter Testpartner, Aktionen.</caption>
              <thead>
                <tr>
                  <th scope="col">Testkunde</th>
                  <th scope="col">Testpartner</th>
                  <th scope="col">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {kunden.map((k) => (
                  <tr key={k.id} data-customer-id={k.id}>
                    <td>
                      <div className="adm-sp-partner">
                        <Link className="adm-sp-name" to={`/admin/users/${encodeURIComponent(k.id)}`}>{testAccountName(k, "Testkunde")}</Link>
                        {k.companyName && k.name && <span className="adm-sp-sub">{k.name}</span>}
                        {k.email && <span className="adm-sp-sub adm-sp-mail">{k.email}</span>}
                      </div>
                    </td>
                    <td>{k.partnerUserId !== null ? (testPartnerNameById(partner, k.partnerUserId) || `Testpartner #${k.partnerUserId}`) : "—"}</td>
                    <td>
                      <div className="adm-sp-row-actions">
                        <button type="button" className="btn btn-outline btn-sm" id={`adm-pl-pwlink-${k.id}`}
                          onClick={(e) => passwortLink(k, "Testkunde", e.currentTarget)} disabled={linkBusy !== null}
                          aria-busy={linkBusy === k.id ? "true" : undefined}
                          aria-label={`Passwort-Link erzeugen: ${testAccountName(k, "Testkunde")}`}>
                          Passwort-Link
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="adm-card" id="adm-pl-accounts-card">
      <div className="adm-card-head">Testkonten</div>
      <div className="adm-card-body">
        {linkError && <div className="alert alert-error" role="alert" id="adm-pl-pwlink-error">{linkError}</div>}
        {link && (
          <div className="adm-pl-linkbox" id="adm-pl-pwlink-box" ref={linkBox} tabIndex={-1} aria-labelledby="adm-pl-pwlink-title">
            <p className="adm-pl-linkbox-title" id="adm-pl-pwlink-title">Passwort-Link für {link.name}</p>
            <CopyableNumber value={link.resetUrl} label="Passwort-Link" />
            {link.expiresAt && <p className="adm-support-hint">Gültig bis {formatTimestamp(link.expiresAt, { withTime: true })}</p>}
            <p className="adm-support-hint" id="adm-pl-pwlink-hint">{PRELIVE_TEXTS.passwordLinkHint}</p>
            <div className="adm-sp-row-actions">
              <button type="button" className="btn btn-outline btn-sm" id="adm-pl-pwlink-hide"
                onClick={() => { setLink(null); ausloeser.current?.focus(); }}>Ausblenden</button>
            </div>
          </div>
        )}

        {listen}

        <h3 className="adm-sp-subtitle">Testpartner anlegen</h3>
        {meldung(pMessage, "adm-pl-partner-message")}
        {pMessage?.type === "success" && pMessage.id !== null && (
          <p className="adm-support-hint">
            <Link to={`/admin/partners/${encodeURIComponent(pMessage.id)}`} id="adm-pl-partner-created-link">Zum Testpartner (Freigabe)</Link>
          </p>
        )}
        <form className="adm-sp-form" onSubmit={partnerAnlegen} noValidate id="adm-pl-partner-form">
          <div className="adm-edit-field">
            <label className="adm-edit-label" htmlFor="adm-pl-partner-name">Name (Pflicht)</label>
            <input id="adm-pl-partner-name" className="field-input" type="text" autoComplete="off" maxLength={MAX_TEXT_LENGTH}
              value={pForm.name} onChange={(e) => setP("name", e.target.value)} disabled={pBusy}
              aria-required="true" aria-invalid={pErrors.name ? "true" : undefined} />
            {pFehler("name")}
          </div>
          <div className="adm-edit-field">
            <label className="adm-edit-label" htmlFor="adm-pl-partner-email">E-Mail (Pflicht)</label>
            <input id="adm-pl-partner-email" className="field-input" type="email" autoComplete="off" maxLength={MAX_EMAIL_LENGTH}
              value={pForm.email} onChange={(e) => setP("email", e.target.value)} disabled={pBusy}
              aria-required="true" aria-invalid={pErrors.email ? "true" : undefined} />
            {pFehler("email")}
          </div>
          <div className="adm-edit-field">
            <label className="adm-edit-label" htmlFor="adm-pl-partner-company">Firma (optional)</label>
            <input id="adm-pl-partner-company" className="field-input" type="text" autoComplete="off" maxLength={MAX_TEXT_LENGTH}
              value={pForm.companyName} onChange={(e) => setP("companyName", e.target.value)} disabled={pBusy}
              aria-invalid={pErrors.companyName ? "true" : undefined} />
            {pFehler("companyName")}
          </div>
          <div className="adm-edit-field">
            <label className="adm-edit-label" htmlFor="adm-pl-partner-sponsor">Sponsor (nur Testpartner, optional)</label>
            <select id="adm-pl-partner-sponsor" className="field-select adm-edit-select" value={pForm.sponsorUserId}
              onChange={(e) => setP("sponsorUserId", e.target.value)} disabled={pBusy}
              aria-invalid={pErrors.sponsorUserId ? "true" : undefined}>
              <option value="">Kein Sponsor</option>
              {partner.map((p) => <option key={p.id} value={String(p.id)}>{testAccountName(p, "Testpartner")}</option>)}
            </select>
            {pFehler("sponsorUserId")}
          </div>
          <div className="adm-sp-form-actions">
            <button type="submit" className="btn btn-primary btn-sm" id="adm-pl-partner-submit" disabled={pBusy}>
              {pBusy ? "Wird angelegt…" : "Testpartner anlegen"}
            </button>
          </div>
        </form>

        <h3 className="adm-sp-subtitle">Testkunde anlegen</h3>
        {meldung(kMessage, "adm-pl-customer-message")}
        {kMessage?.type === "success" && kMessage.id !== null && (
          <p className="adm-support-hint">
            <Link to={`/admin/users/${encodeURIComponent(kMessage.id)}`} id="adm-pl-customer-created-link">Zum Testkunden</Link>
          </p>
        )}
        <form className="adm-sp-form" onSubmit={kundeAnlegen} noValidate id="adm-pl-customer-form">
          <div className="adm-edit-field">
            <label className="adm-edit-label" htmlFor="adm-pl-customer-company">Firma (Pflicht)</label>
            <input id="adm-pl-customer-company" className="field-input" type="text" autoComplete="off" maxLength={MAX_TEXT_LENGTH}
              value={kForm.companyName} onChange={(e) => setK("companyName", e.target.value)} disabled={kBusy}
              aria-required="true" aria-invalid={kErrors.companyName ? "true" : undefined} />
            {kFehler("companyName")}
          </div>
          <div className="adm-edit-field">
            <label className="adm-edit-label" htmlFor="adm-pl-customer-email">E-Mail (Pflicht)</label>
            <input id="adm-pl-customer-email" className="field-input" type="email" autoComplete="off" maxLength={MAX_EMAIL_LENGTH}
              value={kForm.email} onChange={(e) => setK("email", e.target.value)} disabled={kBusy}
              aria-required="true" aria-invalid={kErrors.email ? "true" : undefined} />
            {kFehler("email")}
          </div>
          <div className="adm-edit-field">
            <label className="adm-edit-label" htmlFor="adm-pl-customer-name">Ansprechpartner (optional)</label>
            <input id="adm-pl-customer-name" className="field-input" type="text" autoComplete="off" maxLength={MAX_TEXT_LENGTH}
              value={kForm.name} onChange={(e) => setK("name", e.target.value)} disabled={kBusy}
              aria-invalid={kErrors.name ? "true" : undefined} />
            {kFehler("name")}
          </div>
          <fieldset className="adm-sp-fieldset adm-sp-form-wide">
            <legend className="adm-edit-label">Zuordnung</legend>
            {CUSTOMER_ASSIGNMENT_OPTIONS.map((o) => (
              <label className="adm-sp-choice" key={o.value}>
                <input type="radio" name="adm-pl-customer-assign" id={`adm-pl-customer-assign-${o.value}`}
                  checked={kForm.assignment === o.value} onChange={() => setK("assignment", o.value)} disabled={kBusy} />
                {o.label}
              </label>
            ))}
          </fieldset>
          {kForm.assignment === "partner" && (
            <div className="adm-edit-field">
              <label className="adm-edit-label" htmlFor="adm-pl-customer-partner">Testpartner</label>
              <select id="adm-pl-customer-partner" className="field-select adm-edit-select" value={kForm.partnerUserId}
                onChange={(e) => setK("partnerUserId", e.target.value)} disabled={kBusy}
                aria-invalid={kErrors.partnerUserId ? "true" : undefined}>
                <option value="">Bitte wählen</option>
                {partner.map((p) => <option key={p.id} value={String(p.id)}>{testAccountName(p, "Testpartner")}</option>)}
              </select>
              {kFehler("partnerUserId")}
            </div>
          )}
          {kForm.assignment === "code" && (
            <div className="adm-edit-field">
              <label className="adm-edit-label" htmlFor="adm-pl-customer-code">Empfehlungscode des Testpartners</label>
              <input id="adm-pl-customer-code" className="field-input" type="text" autoComplete="off" maxLength={8}
                value={kForm.referralCode} onChange={(e) => setK("referralCode", e.target.value)} disabled={kBusy}
                aria-invalid={kErrors.referralCode ? "true" : undefined} />
              {kFehler("referralCode")}
            </div>
          )}
          {kForm.assignment !== "none" && (
            <div className="adm-sp-datefield">
              <DateField id="adm-pl-customer-since" label="Zugeordnet seit (optional, darf zurückliegen)" value={kForm.assignedSince}
                invalid={!!kErrors.assignedSince} disabled={kBusy} onChange={(v) => setK("assignedSince", v)} />
              {kFehler("assignedSince")}
            </div>
          )}
          <div className="adm-sp-form-actions">
            <button type="submit" className="btn btn-primary btn-sm" id="adm-pl-customer-submit" disabled={kBusy}>
              {kBusy ? "Wird angelegt…" : "Testkunde anlegen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PreliveAccountsCard;
