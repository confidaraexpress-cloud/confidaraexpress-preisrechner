import React, { useEffect, useRef, useState } from "react";
import { SettingsSection } from "../dashboard/ProfileCardHead";
import { Field } from "../ui/Field";
import { ErrorState, LoadingState } from "../ui/StateView";
import { PartnerRows } from "./PartnerRows";
import { getPartnerBillingDetails, savePartnerBillingDetails } from "../../api/partnerApi";
import { usePartnerData } from "../../hooks/usePartnerData";
import { normalizeThrownError } from "../../utils/apiError.mjs";
import {
  BILLING_FIELD_LABELS,
  BILLING_TEXTS,
  TAX_STATUS_OPTIONS,
  billingCountryOptions,
  billingFormFrom,
  billingSaveMessage,
  billingStatusMeta,
  billingStatusText,
  billingSubmitLabel,
  buildBillingDetailsPayload,
  hasStoredIban,
  mapBillingDetailsSaveError,
  normalizeBillingResponse,
  partnerBillingRows,
} from "../../utils/salesPartnerBilling.mjs";

const normalisieren = (d) => normalizeBillingResponse(d);

// Fehlerschlüssel → Eingabe, in Formularreihenfolge. Nach einer abgewiesenen
// Eingabe (eigene Prüfung oder 400 des Servers) springt der Fokus auf das erste
// markierte Feld — die Meldung steht dort, nicht nur im Sammelhinweis oben.
const FEHLER_FELDER = [
  ["billingName", "spp-billing-name"], ["street", "spp-billing-street"],
  ["postalCode", "spp-billing-postal-code"], ["city", "spp-billing-city"], ["country", "spp-billing-country"],
  ["taxStatus", "spp-billing-tax-with_vat"], ["taxNumber", "spp-billing-tax-number"],
  ["taxIds", "spp-billing-tax-number"], ["vatId", "spp-billing-vat-id"],
  ["accountHolder", "spp-billing-account-holder"], ["iban", "spp-billing-iban"], ["bic", "spp-billing-bic"],
];
function fokussiereErstenFehler(errors) {
  const treffer = FEHLER_FELDER.find(([k]) => errors && errors[k]);
  // Nach dem nächsten Rendern: während des Sendens sind die Felder gesperrt.
  if (treffer) setTimeout(() => document.getElementById(treffer[1])?.focus(), 0);
}

/* ── Partnerportal · Konto · Abrechnungsdaten ────────────────────────────────
   Name bzw. Firma, Anschrift, Steuerstatus mit Steuernummer und/oder
   USt-IdNr. und die Bankverbindung, mit denen ConfidaraExpress Gutschriften
   ausstellt. Der Status sagt, wo die Angaben stehen (unvollständig, in
   Prüfung, bestätigt, abgelehnt mit Begründung); jede Änderung geht erneut in
   die Prüfung und gilt nur für künftige Gutschriften.

   Die vollständige IBAN kennt diese Fläche nicht: angezeigt wird die maskierte
   IBAN des Servers, das Eingabefeld bleibt leer, und leer gelassen behält der
   Server die hinterlegte IBAN. Steuer- und Bankdaten erscheinen nirgends sonst
   im Portal. Der Body entsteht ausschließlich über buildBillingDetailsPayload;
   ein Feldfehler des Servers (400 BILLING_DETAILS_INVALID) steht am Feld. */
export function PartnerBillingDetailsSection() {
  const geladen = usePartnerData((opts) => getPartnerBillingDetails(opts), normalisieren, [], BILLING_TEXTS.loadError);
  const [stand, setStand] = useState(null);           // Serverstand nach dem Speichern
  const [form, setForm] = useState(null);             // null = Anzeige, Objekt = Bearbeitung
  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const ausloeserRef = useRef(null);
  const fokusZurueck = useRef(false);

  const data = stand || geladen.data;
  const details = data?.billingDetails || null;
  const offen = form !== null;

  // Fokus folgt der Handlung: beim Öffnen ins erste Feld, beim Schließen zurück
  // auf den auslösenden Knopf — nie beim ersten Rendern.
  useEffect(() => {
    if (offen) { document.getElementById("spp-billing-name")?.focus(); return; }
    if (fokusZurueck.current) { ausloeserRef.current?.focus(); fokusZurueck.current = false; }
  }, [offen]);

  const oeffnen = () => {
    setForm(billingFormFrom(details));
    setFieldErrors({});
    setGeneralError("");
    setMessage("");
  };
  const schliessen = () => {
    if (saving) return;
    fokusZurueck.current = true;
    setForm(null);
    setFieldErrors({});
    setGeneralError("");
  };
  const setFeld = (k, v) => {
    setForm((f) => (f ? { ...f, [k]: v } : f));
    setFieldErrors((e) => {
      const gruppe = k === "taxNumber" || k === "vatId";
      if (!e[k] && !(gruppe && e.taxIds)) return e;
      const n = { ...e };
      delete n[k];
      if (gruppe) delete n.taxIds;
      return n;
    });
  };

  const speichern = async (e) => {
    e.preventDefault();
    if (!form || inFlight.current) return;
    const gebaut = buildBillingDetailsPayload(form, { hasStoredIban: hasStoredIban(details) });
    if (!gebaut.ok) {
      setFieldErrors(gebaut.errors);
      setGeneralError(BILLING_TEXTS.checkMarked);
      fokussiereErstenFehler(gebaut.errors);
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setFieldErrors({});
    setGeneralError("");
    try {
      const r = await savePartnerBillingDetails(gebaut.body);
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;   // zentrale Abmeldung
        const fehler = mapBillingDetailsSaveError(r.status, d);
        setFieldErrors(fehler.fieldErrors);
        setGeneralError(fehler.generalError);
        fokussiereErstenFehler(fehler.fieldErrors);
        return;
      }
      if (d && typeof d === "object") setStand(normalizeBillingResponse(d));
      else { setStand(null); geladen.reload(); }
      fokusZurueck.current = true;
      setForm(null);
      setMessage(billingSaveMessage(d));
    } catch (err) {
      setGeneralError(normalizeThrownError(err).message);
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  const [statusCls, statusLabel] = billingStatusMeta(data?.status);
  const statusText = billingStatusText(data?.status);

  const bearbeiten = data && !offen && details ? (
    <button type="button" ref={ausloeserRef} className="btn btn-ghost btn-sm profile-card-edit-action"
      id="spp-billing-edit" onClick={oeffnen} aria-label="Abrechnungsdaten bearbeiten">
      Bearbeiten
    </button>
  ) : null;

  let inhalt;
  if (geladen.loading && !data) {
    inhalt = <LoadingState text="Abrechnungsdaten werden geladen …" />;
  } else if (!data) {
    inhalt = (
      <ErrorState
        title={geladen.error || BILLING_TEXTS.loadError}
        action={<button type="button" className="btn btn-primary btn-sm" onClick={geladen.reload}>Erneut versuchen</button>}
      />
    );
  } else if (offen) {
    const ibanHinterlegt = hasStoredIban(details);
    const steuerGruppe = fieldErrors.taxIds ? { "aria-invalid": "true", "aria-describedby": "spp-billing-taxids-error" } : {};
    inhalt = (
      <form className="profile-form-body profile-inline-form spp-billing-form" id="spp-billing-form" noValidate onSubmit={speichern}>
        {generalError && <div className="alert alert-error" role="alert" id="spp-billing-error">{generalError}</div>}
        {/* Nach einer Ablehnung bleibt die Begründung beim Bearbeiten sichtbar;
            auch unverändert abgesendet ist es eine erneute Einreichung. */}
        {data.status === "rejected" && (
          <div className="alert alert-info" role="note" id="spp-billing-form-review">
            <span>
              {BILLING_TEXTS.rejectedFormHint}
              {details?.reviewNote ? ` Begründung: ${details.reviewNote}` : ""}
            </span>
          </div>
        )}
        <p className="profile-required-hint">{BILLING_TEXTS.futureOnly}</p>

        <Field id="spp-billing-name" label={BILLING_FIELD_LABELS.billingName} required autoComplete="organization"
          value={form.billingName} onChange={(v) => setFeld("billingName", v)} error={fieldErrors.billingName}
          disabled={saving} />
        <Field id="spp-billing-street" label={BILLING_FIELD_LABELS.street} required autoComplete="street-address"
          value={form.street} onChange={(v) => setFeld("street", v)} error={fieldErrors.street} disabled={saving} />
        <div className="field-row field-row-2">
          <Field id="spp-billing-postal-code" label={BILLING_FIELD_LABELS.postalCode} required autoComplete="postal-code"
            value={form.postalCode} onChange={(v) => setFeld("postalCode", v)} error={fieldErrors.postalCode} disabled={saving} />
          <Field id="spp-billing-city" label={BILLING_FIELD_LABELS.city} required autoComplete="address-level2"
            value={form.city} onChange={(v) => setFeld("city", v)} error={fieldErrors.city} disabled={saving} />
        </div>
        <Field as="select" id="spp-billing-country" label={BILLING_FIELD_LABELS.country} required autoComplete="country"
          value={form.country} onChange={(v) => setFeld("country", v)} error={fieldErrors.country} disabled={saving}>
          <option value="">Bitte wählen</option>
          {billingCountryOptions(form.country).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Field>

        <fieldset className="dn-mode-fieldset spp-billing-taxstatus" disabled={saving}>
          <legend className="field-label">{BILLING_FIELD_LABELS.taxStatus}<span aria-hidden="true"> *</span></legend>
          {TAX_STATUS_OPTIONS.map((o) => (
            <label key={o.value} className={`dn-mode-option${form.taxStatus === o.value ? " selected" : ""}`}>
              <input type="radio" name="spp-billing-taxstatus" id={`spp-billing-tax-${o.value}`} value={o.value}
                checked={form.taxStatus === o.value} onChange={() => setFeld("taxStatus", o.value)} required
                aria-invalid={fieldErrors.taxStatus ? "true" : undefined}
                aria-describedby={fieldErrors.taxStatus ? "spp-billing-taxstatus-error" : undefined} />
              <span className="dn-mode-text"><span className="dn-mode-label">{o.label}</span></span>
            </label>
          ))}
          {fieldErrors.taxStatus && <span className="field-error" id="spp-billing-taxstatus-error">{fieldErrors.taxStatus}</span>}
        </fieldset>

        <div className="field-row field-row-2">
          <Field id="spp-billing-tax-number" label={BILLING_FIELD_LABELS.taxNumber} autoComplete="off"
            value={form.taxNumber} onChange={(v) => setFeld("taxNumber", v)} error={fieldErrors.taxNumber}
            disabled={saving} {...(fieldErrors.taxNumber ? {} : steuerGruppe)} />
          <Field id="spp-billing-vat-id" label={BILLING_FIELD_LABELS.vatId} autoComplete="off"
            value={form.vatId} onChange={(v) => setFeld("vatId", v)} error={fieldErrors.vatId}
            disabled={saving} {...(fieldErrors.vatId ? {} : steuerGruppe)} />
        </div>
        {fieldErrors.taxIds && <span className="field-error spp-billing-group-error" id="spp-billing-taxids-error">{fieldErrors.taxIds}</span>}

        <Field id="spp-billing-account-holder" label={BILLING_FIELD_LABELS.accountHolder} required autoComplete="name"
          value={form.accountHolder} onChange={(v) => setFeld("accountHolder", v)} error={fieldErrors.accountHolder}
          disabled={saving} />
        <Field id="spp-billing-iban" label={BILLING_FIELD_LABELS.iban} required={!ibanHinterlegt} autoComplete="off"
          spellCheck={false} value={form.iban} onChange={(v) => setFeld("iban", v)} error={fieldErrors.iban} disabled={saving}
          hint={ibanHinterlegt ? `Hinterlegt: ${details.ibanMasked || "IBAN"}. ${BILLING_TEXTS.ibanKeep}` : undefined} />
        <Field id="spp-billing-bic" label={BILLING_FIELD_LABELS.bic} optional autoComplete="off" spellCheck={false}
          value={form.bic} onChange={(v) => setFeld("bic", v)} error={fieldErrors.bic} disabled={saving} />

        <div className="profile-form-actions">
          <button type="button" className="btn btn-outline" onClick={schliessen} disabled={saving} id="spp-billing-cancel">Abbrechen</button>
          <button type="submit" className="btn btn-primary" disabled={saving} id="spp-billing-submit">
            {saving ? <><span className="spinner" /> Wird gesendet…</> : billingSubmitLabel(data.status)}
          </button>
        </div>
      </form>
    );
  } else {
    inhalt = (
      <>
        {message && <div className="alert alert-success" role="status" id="spp-billing-message">{message}</div>}
        <div className="spp-billing-status" id="spp-billing-status">
          <span className={`badge ${statusCls}`} id="spp-billing-status-badge">{statusLabel}</span>
          {statusText && <p className="spp-billing-status-text">{statusText}</p>}
          {data.status === "rejected" && details?.reviewNote && (
            <p className="spp-billing-status-text" id="spp-billing-review-note">Begründung: {details.reviewNote}</p>
          )}
        </div>
        {details ? (
          <PartnerRows items={partnerBillingRows(details)} idPrefix="spp-billing-row" />
        ) : (
          <div className="spp-section-actions">
            <button type="button" ref={ausloeserRef} className="btn btn-primary btn-sm" id="spp-billing-start" onClick={oeffnen}>
              Abrechnungsdaten hinterlegen
            </button>
          </div>
        )}
        <div className="profile-hint">
          <div className="profile-hint-text"><p>{BILLING_TEXTS.futureOnly}</p></div>
        </div>
      </>
    );
  }

  return (
    <SettingsSection title={BILLING_TEXTS.title} subtitle={BILLING_TEXTS.subtitle} action={bearbeiten}>
      <div className="profile-section-body" id="spp-billing">{inhalt}</div>
    </SettingsSection>
  );
}

export default PartnerBillingDetailsSection;
