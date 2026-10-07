import React, { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { DateField } from "./DateField";
import {
  createAdminPreliveShipment,
  createAdminShipmentDispatchEvidence,
  listAdminPreliveShipments,
  markAdminPreliveShipmentPaid,
} from "../../api/adminApi";
import { formatCents, formatCount } from "../../utils/salesPartnerView.mjs";
import { evidenceStatusMeta, formatTimestamp, localIsoDate } from "../../utils/adminSalesPartnerView.mjs";
import {
  MAX_PACKAGES,
  PRELIVE_TEXTS,
  buildMarkPaidBody,
  buildTestDispatchBody,
  buildTestShipmentBody,
  canMarkShipmentPaid,
  canRecordDispatch,
  decisionOutcomeMeta,
  normalizePreliveShipment,
  normalizePreliveShipments,
  paidText,
  preliveErrorOutcome,
  shipmentBasisPreview,
  shipmentListQuery,
  testAccountName,
} from "../../utils/salesPartnerPrelive.mjs";

const PAGE_SIZE = 25;
const LEER = { customerUserId: "", shipDate: "", packageCount: "1", customerNet: "", purchaseNet: "", dispatched: false, paidOn: "" };
// Vertragsfelder der Beträge → Formularfelder (Euro-Eingabe).
const BETRAGSFELDER = Object.freeze({ customerNetCents: "customerNet", purchaseNetCents: "purchaseNet" });

function Badge({ meta }) {
  const [cls, label] = meta;
  return <span className={`badge ${cls}`}>{label}</span>;
}

/* ── Pre-Live · Testsendungen ────────────────────────────────────────────────
   Testsendungen sind reine Datensätze für die Provisionsrechnung: keine
   Buchung, kein Provider, kein Label. Beträge werden in Euro eingegeben und in
   Cent gesendet; die Vorschau zeigt die provisionsfähige Basis
   (Kundenversandnetto − Einkaufsversandnetto), maßgeblich ist die Basis des
   Servers in der Liste. Je Sendung: Versand belegen (bestehender
   Versandnachweis, Nachweisart „Sonstiger Nachweis", Notiz „Pre-Live-Test")
   und „als bezahlt markieren". `refreshKey` lädt die Liste nach Änderungen
   an anderer Stelle (Szenarien, Provisionslauf, Bereinigung) neu. */
export function PreliveShipmentsCard({ accounts, refreshKey = 0, onChanged, onDisabled }) {
  const kunden = accounts?.customers || [];
  const partner = accounts?.partners || [];
  const [filterEntwurf, setFilterEntwurf] = useState({ customerUserId: "", partnerUserId: "" });
  const [filter, setFilter] = useState({ customerUserId: "", partnerUserId: "" });
  const [page, setPage] = useState(1);
  const [liste, setListe] = useState({ loading: true, error: "", items: [], total: null });
  const [form, setForm] = useState(LEER);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [dialog, setDialog] = useState(null);         // { kind: "dispatch"|"paid", shipment, form, errors, error }
  const [dialogBusy, setDialogBusy] = useState(false);
  const inFlight = useRef(false);
  const lauf = useRef(0);
  const heute = localIsoDate();

  const laden = useCallback(async () => {
    const meinLauf = ++lauf.current;
    setListe((l) => ({ ...l, loading: true, error: "" }));
    try {
      const r = await listAdminPreliveShipments(shipmentListQuery({ ...filter, page, pageSize: PAGE_SIZE }));
      if (meinLauf !== lauf.current) return;
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      if (meinLauf !== lauf.current) return;
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        const folge = preliveErrorOutcome(r.status, d);
        if (folge.disabled) onDisabled?.();
        setListe({ loading: false, error: PRELIVE_TEXTS.shipmentsError, items: [], total: null });
        return;
      }
      const n = normalizePreliveShipments(d);
      setListe({ loading: false, error: "", items: n.items, total: n.total });
    } catch {
      if (meinLauf === lauf.current) setListe({ loading: false, error: PRELIVE_TEXTS.shipmentsError, items: [], total: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, page]);

  useEffect(() => { laden(); return () => { lauf.current += 1; }; }, [laden, refreshKey]);

  const setFeld = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  const anlegen = async (e) => {
    e.preventDefault();
    if (inFlight.current) return;
    setMessage(null);
    const gebaut = buildTestShipmentBody(form);
    if (!gebaut.ok) { setErrors(gebaut.errors); return; }
    setErrors({});
    inFlight.current = true;
    setBusy(true);
    try {
      const r = await createAdminPreliveShipment(gebaut.body);
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        const folge = preliveErrorOutcome(r.status, d, { fieldMap: BETRAGSFELDER });
        if (folge.field) setErrors({ [folge.field]: folge.text });
        setMessage({ type: "error", text: folge.text });
        if (folge.disabled) onDisabled?.();
        return;
      }
      const neu = normalizePreliveShipment(d && typeof d === "object" ? d.shipment : null);
      const name = neu ? (neu.reference || `#${neu.id}`) : null;
      setForm((f) => ({ ...LEER, customerUserId: f.customerUserId }));
      setMessage({ type: "success", text: name ? `Testsendung ${name} wurde angelegt.` : "Die Testsendung wurde angelegt." });
      onChanged?.({ accounts: false });
    } catch {
      setMessage({ type: "error", text: "Die Testsendung wurde nicht angelegt. Bitte laden Sie die Liste neu, bevor Sie es erneut versuchen." });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const oeffnen = (kind, shipment) => {
    setMessage(null);
    setDialog({ kind, shipment, form: kind === "dispatch" ? { dispatchDate: shipment.shipDate || "" } : { paidOn: "" }, errors: {}, error: "" });
  };
  const schliessen = () => { if (!dialogBusy) setDialog(null); };
  const setDialogFeld = (k, v) => setDialog((x) => (x ? { ...x, form: { ...x.form, [k]: v }, errors: { ...x.errors, [k]: undefined } } : x));

  const bestaetigen = async () => {
    if (!dialog || inFlight.current) return;
    const { kind, shipment } = dialog;
    const gebaut = kind === "dispatch" ? buildTestDispatchBody(dialog.form, { today: heute }) : buildMarkPaidBody(dialog.form, { today: heute });
    if (!gebaut.ok) { setDialog((x) => (x ? { ...x, errors: gebaut.errors } : x)); return; }
    inFlight.current = true;
    setDialogBusy(true);
    try {
      const r = kind === "dispatch"
        ? await createAdminShipmentDispatchEvidence(shipment.id, gebaut.body)
        : await markAdminPreliveShipmentPaid(shipment.id, gebaut.body);
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        const folge = preliveErrorOutcome(r.status, d);
        if (folge.disabled || folge.reload) {
          setDialog(null);
          setMessage({ type: "error", text: folge.text });
          if (folge.disabled) onDisabled?.(); else laden();
          return;
        }
        setDialog((x) => (x ? { ...x, error: folge.text, errors: folge.field ? { [folge.field]: folge.text } : x.errors } : x));
        return;
      }
      setDialog(null);
      const name = shipment.reference || `#${shipment.id}`;
      setMessage({ type: "success", text: kind === "dispatch" ? `Der Versand von ${name} ist belegt.` : `${name} ist als bezahlt markiert.` });
      onChanged?.({ accounts: false });
    } catch {
      setDialog((x) => (x ? { ...x, error: "Die Aktion wurde nicht ausgeführt. Bitte laden Sie die Liste neu und prüfen Sie den Stand, bevor Sie es erneut versuchen." } : x));
    } finally {
      inFlight.current = false;
      setDialogBusy(false);
    }
  };

  const fehler = (k) => (errors[k] ? <span className="field-error">{errors[k]}</span> : null);
  const dFehler = (k) => (dialog?.errors?.[k] ? <span className="field-error">{dialog.errors[k]}</span> : null);
  const basis = shipmentBasisPreview(form);
  const hatWeiter = Number.isInteger(liste.total) ? page * PAGE_SIZE < liste.total : liste.items.length === PAGE_SIZE;

  let tabelle;
  if (liste.loading && liste.items.length === 0) {
    tabelle = <div className="loading-center" role="status"><span className="spinner spinner-dark" /> Testsendungen werden geladen…</div>;
  } else if (liste.error) {
    tabelle = (
      <>
        <div className="alert alert-error" role="alert">{liste.error}</div>
        <button type="button" className="btn btn-outline btn-sm" onClick={laden}>Erneut versuchen</button>
      </>
    );
  } else if (liste.items.length === 0) {
    tabelle = <p className="adm-support-hint" id="adm-pl-shipments-empty">Keine Testsendungen für diese Auswahl.</p>;
  } else {
    tabelle = (
      <div className="table-scroll adm-sp-mini-table" id="adm-pl-shipments" aria-busy={liste.loading ? "true" : undefined}>
        <table>
          <caption className="sr-only">
            Testsendungen: Sendung, Kunde, Versandtag, Pakete, Kundenversand netto, Einkauf netto, provisionsfähige Basis, Versand, Zahlung, Provision, Aktionen.
          </caption>
          <thead>
            <tr>
              <th scope="col">Sendung</th>
              <th scope="col">Testkunde</th>
              <th scope="col">Versandtag</th>
              <th scope="col" className="adm-num">Pakete</th>
              <th scope="col" className="adm-num">Kunde netto</th>
              <th scope="col" className="adm-num">Einkauf netto</th>
              <th scope="col" className="adm-num">Basis</th>
              <th scope="col">Versand</th>
              <th scope="col">Zahlung</th>
              <th scope="col">Provision</th>
              <th scope="col">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {liste.items.map((s) => (
              <tr key={s.id} data-shipment-id={s.id}>
                <td><span className="adm-mono">{s.reference || `#${s.id}`}</span></td>
                <td>{s.customerCompanyName || (s.customerUserId !== null ? `Testkunde #${s.customerUserId}` : "—")}</td>
                <td>{formatTimestamp(s.shipDate)}</td>
                <td className="adm-num">{formatCount(s.packageCount)}</td>
                <td className="adm-num">{formatCents(s.customerNetCents)}</td>
                <td className="adm-num">{formatCents(s.purchaseNetCents)}</td>
                <td className="adm-num">{formatCents(s.basisCents)}</td>
                <td>
                  <Badge meta={evidenceStatusMeta(s.evidence ? s.evidence.status : null)} />
                  {s.evidence?.dispatchDate && <span className="adm-sp-sub adm-sp-block">{formatTimestamp(s.evidence.dispatchDate)}</span>}
                </td>
                <td>{paidText(s)}</td>
                <td><Badge meta={decisionOutcomeMeta(s.decision)} /></td>
                <td>
                  <div className="adm-sp-row-actions">
                    {canRecordDispatch(s) && (
                      <button type="button" className="btn btn-outline btn-sm" id={`adm-pl-dispatch-${s.id}`}
                        onClick={() => oeffnen("dispatch", s)} disabled={dialogBusy}>Versand belegen</button>
                    )}
                    {canMarkShipmentPaid(s) && (
                      <button type="button" className="btn btn-outline btn-sm" id={`adm-pl-paid-${s.id}`}
                        onClick={() => oeffnen("paid", s)} disabled={dialogBusy}>Als bezahlt markieren</button>
                    )}
                    {!canRecordDispatch(s) && !canMarkShipmentPaid(s) && <span className="adm-muted">—</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="adm-card" id="adm-pl-shipments-card">
      <div className="adm-card-head">Testsendungen</div>
      <div className="adm-card-body">
        <div className="adm-note adm-note--info" role="note" id="adm-pl-shipment-note"><span>{PRELIVE_TEXTS.shipmentNote}</span></div>

        <form className="adm-sp-toolbar adm-pl-toolbar" role="search" aria-label="Testsendungen filtern"
          onSubmit={(e) => { e.preventDefault(); setPage(1); setFilter({ ...filterEntwurf }); }}>
          <div className="adm-filter-field">
            <label htmlFor="adm-pl-filter-customer">Testkunde</label>
            <select id="adm-pl-filter-customer" value={filterEntwurf.customerUserId}
              onChange={(e) => setFilterEntwurf((f) => ({ ...f, customerUserId: e.target.value }))}>
              <option value="">Alle</option>
              {kunden.map((k) => <option key={k.id} value={String(k.id)}>{testAccountName(k, "Testkunde")}</option>)}
            </select>
          </div>
          <div className="adm-filter-field">
            <label htmlFor="adm-pl-filter-partner">Testpartner</label>
            <select id="adm-pl-filter-partner" value={filterEntwurf.partnerUserId}
              onChange={(e) => setFilterEntwurf((f) => ({ ...f, partnerUserId: e.target.value }))}>
              <option value="">Alle</option>
              {partner.map((p) => <option key={p.id} value={String(p.id)}>{testAccountName(p, "Testpartner")}</option>)}
            </select>
          </div>
          <div className="adm-filter-actions">
            <button type="submit" className="btn btn-outline btn-sm" id="adm-pl-filter-apply" disabled={liste.loading}>Anwenden</button>
          </div>
        </form>

        {message && (
          <div className={`alert ${message.type === "success" ? "alert-success" : "alert-error"}`}
            role={message.type === "success" ? "status" : "alert"} id="adm-pl-shipment-message">
            <span>{message.text}</span>
          </div>
        )}
        {tabelle}
        {!liste.error && (liste.items.length > 0 || page > 1) && (
          <div className="adm-pagination">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={liste.loading || page <= 1}>Zurück</button>
            <span className="adm-page-ind">Seite {page}{Number.isInteger(liste.total) ? ` · ${liste.total} gesamt` : ""}</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setPage((p) => p + 1)} disabled={liste.loading || !hatWeiter}>Weiter</button>
          </div>
        )}

        <h3 className="adm-sp-subtitle">Testsendung anlegen</h3>
        <form className="adm-sp-form" onSubmit={anlegen} noValidate id="adm-pl-shipment-form">
          <div className="adm-edit-field">
            <label className="adm-edit-label" htmlFor="adm-pl-shipment-customer">Testkunde (Pflicht)</label>
            <select id="adm-pl-shipment-customer" className="field-select adm-edit-select" value={form.customerUserId}
              onChange={(e) => setFeld("customerUserId", e.target.value)} disabled={busy}
              aria-required="true" aria-invalid={errors.customerUserId ? "true" : undefined}>
              <option value="">Bitte wählen</option>
              {kunden.map((k) => <option key={k.id} value={String(k.id)}>{testAccountName(k, "Testkunde")}</option>)}
            </select>
            {fehler("customerUserId")}
          </div>
          <div className="adm-sp-datefield">
            <DateField id="adm-pl-shipment-date" label="Versandtag (Pflicht, darf zurückliegen)" value={form.shipDate}
              invalid={!!errors.shipDate} disabled={busy} onChange={(v) => setFeld("shipDate", v)} />
            {fehler("shipDate")}
          </div>
          <div className="adm-edit-field">
            <label className="adm-edit-label" htmlFor="adm-pl-shipment-packages">Pakete</label>
            <input id="adm-pl-shipment-packages" className="field-input" type="text" inputMode="numeric" autoComplete="off"
              value={form.packageCount} onChange={(e) => setFeld("packageCount", e.target.value)} disabled={busy}
              aria-describedby="adm-pl-shipment-packages-hint" aria-invalid={errors.packageCount ? "true" : undefined} />
            <span className="adm-edit-hint" id="adm-pl-shipment-packages-hint">{`1 bis ${MAX_PACKAGES}`}</span>
            {fehler("packageCount")}
          </div>
          <div className="adm-edit-field">
            <label className="adm-edit-label" htmlFor="adm-pl-shipment-customer-net">Kundenversand netto in €</label>
            <input id="adm-pl-shipment-customer-net" className="field-input" type="text" inputMode="decimal" autoComplete="off"
              value={form.customerNet} onChange={(e) => setFeld("customerNet", e.target.value)} disabled={busy}
              aria-invalid={errors.customerNet ? "true" : undefined} />
            {fehler("customerNet")}
          </div>
          <div className="adm-edit-field">
            <label className="adm-edit-label" htmlFor="adm-pl-shipment-purchase-net">Einkaufsversand netto in €</label>
            <input id="adm-pl-shipment-purchase-net" className="field-input" type="text" inputMode="decimal" autoComplete="off"
              value={form.purchaseNet} onChange={(e) => setFeld("purchaseNet", e.target.value)} disabled={busy}
              aria-invalid={errors.purchaseNet ? "true" : undefined} />
            {fehler("purchaseNet")}
          </div>
          <div className="adm-edit-field">
            <span className="adm-edit-label">Provisionsfähige Basis</span>
            <span className="adm-pl-basis" id="adm-pl-shipment-basis" aria-live="polite">{basis || "—"}</span>
            <span className="adm-edit-hint">Kundenversand netto − Einkaufsversand netto</span>
          </div>
          <div className="adm-sp-datefield">
            <DateField id="adm-pl-shipment-paid-on" label="Bezahlt am (optional)" value={form.paidOn}
              invalid={!!errors.paidOn} disabled={busy} onChange={(v) => setFeld("paidOn", v)} />
            {fehler("paidOn")}
          </div>
          <label className="adm-sp-choice adm-sp-form-wide">
            <input type="checkbox" id="adm-pl-shipment-dispatched" checked={form.dispatched === true} disabled={busy}
              onChange={(e) => setFeld("dispatched", e.target.checked)} />
            Versand gleich belegen
          </label>
          <div className="adm-sp-form-actions">
            <button type="submit" className="btn btn-primary btn-sm" id="adm-pl-shipment-submit" disabled={busy}>
              {busy ? "Wird angelegt…" : "Testsendung anlegen"}
            </button>
          </div>
        </form>
      </div>

      {dialog && (
        <ConfirmDialog
          title={dialog.kind === "dispatch" ? "Versand belegen (Testsendung)" : "Als bezahlt markieren (Testsendung)"}
          subline={dialog.shipment.reference || `Testsendung #${dialog.shipment.id}`}
          text={dialog.kind === "dispatch"
            ? "Hält den Versandnachweis „Versendet“ mit der Nachweisart „Sonstiger Nachweis“ und der Notiz „Pre-Live-Test“ fest."
            : "Hält fest, ab welchem Tag die Testsendung als bezahlt gilt. Es fließt kein Geld."}
          note="Nur Testdaten. Die Aktion wird protokolliert."
          confirmLabel={dialog.kind === "dispatch" ? "Versand belegen" : "Als bezahlt markieren"}
          busy={dialogBusy}
          confirmId={dialog.kind === "dispatch" ? "adm-pl-dispatch-confirm" : "adm-pl-paid-confirm"}
          onCancel={schliessen}
          onConfirm={bestaetigen}
        >
          {dialog.error && <div className="alert alert-error" role="alert">{dialog.error}</div>}
          {dialog.kind === "dispatch" ? (
            <div className="adm-sp-datefield">
              <DateField id="adm-pl-dispatch-date" label="Versanddatum (Pflicht)" value={dialog.form.dispatchDate} max={heute}
                invalid={!!dialog.errors.dispatchDate} disabled={dialogBusy} onChange={(v) => setDialogFeld("dispatchDate", v)} />
              {dFehler("dispatchDate")}
            </div>
          ) : (
            <div className="adm-sp-datefield">
              <DateField id="adm-pl-paid-date" label="Bezahlt am (Pflicht)" value={dialog.form.paidOn} max={heute}
                invalid={!!dialog.errors.paidOn} disabled={dialogBusy} onChange={(v) => setDialogFeld("paidOn", v)} />
              {dFehler("paidOn")}
            </div>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}

export default PreliveShipmentsCard;
