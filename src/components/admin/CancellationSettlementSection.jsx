import React, { useState } from "react";
import { Icon } from "../ui/Icon";
import { money, dateDE } from "../../utils/formatters";
import {
  providerCancellationMeta,
  providerStatusOptions,
  isProviderSectionEnabled,
  creditNoteAction,
  normalizeCreditNote,
} from "../../utils/creditNoteView.mjs";
import {
  setProviderCancellationStatus,
  createCreditNoteForCancellation,
} from "../../api/adminApi";
import { downloadAdminCreditNotePdf } from "../../utils/downloadInvoicePdf";

// ─────────────────────────────────────────────────────────────────────────────
// Abwicklung eines angenommenen Stornos: Providerstorno nachtragen und Gutschrift
// erstellen.
//
// ─── DREI Tatsachen, DREI Aktionen ──────────────────────────────────────────
//   1. „ConfidaraExpress nimmt die Anfrage an"  → Karte „Interne Bearbeitung"
//   2. „Der Dienstleister hat storniert"        → hier, Auswahlfeld
//   3. „Der Kunde bekommt sein Geld zurück"     → hier, EIGENER Knopf
//
// Schritt 2 trägt der Betreiber von HAND nach: es gibt keinen Stornoendpunkt beim
// Dienstleister, und diese Oberfläche stößt dort nichts an. Sie hält fest, wo der
// Betreiber steht.
//
// Schritt 3 ist ausdrücklich ein EIGENER Knopf und kein Seiteneffekt von Schritt 2.
// Eine Gutschrift ist ein Steuerdokument mit eigener Nummer; sie nebenbei entstehen
// zu lassen hieße, sie irgendwann versehentlich auszustellen — und ein ausgestellter
// Beleg lässt sich nicht zurücknehmen, nur durch einen weiteren Beleg ausgleichen.
//
// ─── Das Frontend entscheidet nichts ────────────────────────────────────────
// Es wird KEIN Betrag gesendet und keiner berechnet: der Erstattungsbetrag entsteht
// serverseitig aus dem eingefrorenen Beleg. Die Bedingungen unten spiegeln die
// serverseitige Prüfung, sie ersetzen sie nicht — der Server prüft erneut.
// ─────────────────────────────────────────────────────────────────────────────

export const SETTLEMENT_SECTION_ID = "adm-cancellation-settlement";
export const CREDIT_NOTE_BUTTON_ID = "adm-create-credit-note";
export const PROVIDER_SELECT_ID = "adm-provider-status";

// Fehlercodes des Servers in Klartext. Nie ein Rohcode in der Oberfläche.
const ERROR_TEXT = {
  CANCELLATION_NOT_ACCEPTED: "Die Stornierungsanfrage ist noch nicht angenommen.",
  PROVIDER_CANCELLATION_NOT_CONFIRMED: "Der Storno beim Versanddienstleister ist noch nicht bestätigt.",
  PROVIDER_CANCELLATION_TRANSITION_INVALID: "Dieser Statuswechsel ist nicht zulässig.",
  CREDIT_NOTE_ALREADY_EXISTS: "Zu dieser Sendung besteht bereits eine Gutschrift.",
  CREDIT_NOTE_NO_INVOICE: "Zu dieser Sendung besteht keine Rechnung — es ist nichts zu erstatten.",
  CREDIT_NOTE_TEST_INVOICE: "Zu einer Testrechnung wird keine Gutschrift erstellt.",
  CREDIT_NOTE_ZERO_INVOICE: "Diese Rechnung weist keinen zu erstattenden Betrag aus.",
  CREDIT_NOTE_EXCEEDS_INVOICE: "Die Gutschriften würden den Rechnungsbetrag übersteigen.",
  CREDIT_NOTE_AMOUNT_UNRESOLVED: "Der Erstattungsbetrag ist aus dem Beleg nicht belastbar ableitbar. Bitte prüfen.",
  CREDIT_NOTE_VAT_RATE_MISSING: "Zu dieser Rechnung ist kein Steuersatz hinterlegt.",
  CREDIT_NOTE_REQUIREMENTS_INCOMPLETE: "Die Pflichtangaben für einen Beleg sind unvollständig.",
};
const GENERIC = "Die Aktion konnte nicht ausgeführt werden. Bitte erneut versuchen.";

async function readError(r) {
  let d = {};
  try { d = await r.json(); } catch { d = {}; }
  const code = typeof d.code === "string" ? d.code : null;
  return { text: (code && ERROR_TEXT[code]) || d.error || GENERIC, code, body: d };
}

export function CancellationSettlementSection({
  requestId,
  cancellationStatus,
  providerCancellation,
  creditNote,
  onChanged,
}) {
  const provider = providerCancellation || { status: "not_started" };
  const enabled = isProviderSectionEnabled(cancellationStatus);
  const [providerStatus, setProviderStatus] = useState(provider.status || "not_started");
  const [note, setNote] = useState(provider.note || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { type: "ok"|"error", text }

  const cn = creditNote ? normalizeCreditNote(creditNote) : null;
  const action = creditNoteAction({
    cancellationStatus,
    providerStatus: provider.status,
    existingCreditNote: cn,
  });
  const [cls, label] = providerCancellationMeta(provider.status || "not_started");
  const options = providerStatusOptions(provider.status || "not_started");
  const dirty = providerStatus !== (provider.status || "not_started") || note !== (provider.note || "");

  const saveProvider = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await setProviderCancellationStatus(requestId, providerStatus, note);
      if (!r.ok) { setMsg({ type: "error", text: (await readError(r)).text }); return; }
      setMsg({ type: "ok", text: "Der Stand beim Versanddienstleister wurde gespeichert." });
      if (onChanged) await onChanged();
    } catch {
      setMsg({ type: "error", text: GENERIC });
    } finally { setBusy(false); }
  };

  const createCreditNote = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await createCreditNoteForCancellation(requestId);
      if (!r.ok) { setMsg({ type: "error", text: (await readError(r)).text }); return; }
      setMsg({ type: "ok", text: "Die Gutschrift wurde erstellt und dem Kunden bereitgestellt." });
      if (onChanged) await onChanged();
    } catch {
      setMsg({ type: "error", text: GENERIC });
    } finally { setBusy(false); }
  };

  return (
    <div className="adm-card" id={SETTLEMENT_SECTION_ID}>
      <div className="adm-card-head">
        <Icon n="invoice" s={17} /> Abwicklung
        <span className={`badge ${cls}`} style={{ marginInlineStart: "auto" }}>
          <span className="badge-dot" />{label}
        </span>
      </div>
      <div className="adm-card-body">
        {/* Sagt ausdrücklich, was diese Karte NICHT tut — sonst nimmt ein Admin an,
            das Auswahlfeld storniere beim Dienstleister. */}
        <div className="adm-note">
          <Icon n="info" s={16} />
          <span>
            Der Storno beim Versanddienstleister wird außerhalb dieses Portals durchgeführt.
            Hier wird nur festgehalten, wo er steht — es wird nichts beim Dienstleister ausgelöst.
          </span>
        </div>

        {!enabled && (
          <p className="field-hint mt-8">
            Der Stand beim Versanddienstleister lässt sich nachtragen, sobald die Anfrage angenommen ist.
          </p>
        )}

        {enabled && options.length > 0 && (
          <>
            <label className="field-label mt-8" htmlFor={PROVIDER_SELECT_ID}>Stand beim Versanddienstleister</label>
            <select
              id={PROVIDER_SELECT_ID}
              className="field-select"
              value={providerStatus}
              disabled={busy}
              onChange={(e) => setProviderStatus(e.target.value)}
            >
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <label className="field-label mt-8" htmlFor="adm-provider-note">Interner Vermerk (optional)</label>
            <input
              id="adm-provider-note"
              className="field-input"
              value={note}
              disabled={busy}
              maxLength={2000}
              placeholder="z. B. Referenz aus dem Portal des Dienstleisters"
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="mt-8">
              <button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={saveProvider}>
                Stand speichern
              </button>
            </div>
          </>
        )}

        {enabled && options.length === 0 && (
          <p className="field-hint mt-8">
            Der Storno ist beim Versanddienstleister bestätigt. Dieser Stand wird nicht mehr geändert.
          </p>
        )}

        {/* ── Gutschrift ────────────────────────────────────────────────── */}
        <div className="mt-8" />
        {cn ? (
          <div>
            <p className="field-label">Gutschrift</p>
            <p>
              <strong>{cn.creditNoteNumber}</strong>
              {" · "}{money(cn.grossAmount)}
              {cn.creditDate ? ` · ${dateDE(cn.creditDate)}` : ""}
            </p>
            <p className="field-hint">
              Die zugehörige Rechnung{cn.invoiceNumber ? ` ${cn.invoiceNumber}` : ""} bleibt unverändert bestehen.
            </p>
            <div className="mt-8">
              <button
                type="button"
                className="btn btn-outline"
                disabled={busy}
                onClick={() => downloadAdminCreditNotePdf(cn.id, cn.creditNoteNumber).catch(() =>
                  setMsg({ type: "error", text: "Das Dokument konnte nicht geladen werden." }))}
              >
                <Icon n="download" s={16} /> Gutschrift herunterladen
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="field-label">Gutschrift</p>
            <p className="field-hint">
              {action.canCreate
                ? "Der Erstattungsbetrag wird aus der ausgestellten Rechnung übernommen. Die Rechnung selbst bleibt unverändert."
                : action.hint}
            </p>
            <div className="mt-8">
              <button
                type="button"
                id={CREDIT_NOTE_BUTTON_ID}
                className="btn btn-primary"
                disabled={busy || !action.canCreate}
                onClick={createCreditNote}
              >
                Gutschrift erstellen
              </button>
            </div>
          </div>
        )}

        {msg && (
          <div className={`adm-note mt-8${msg.type === "error" ? " adm-note--error" : ""}`} role={msg.type === "error" ? "alert" : "status"}>
            <Icon n={msg.type === "error" ? "alert" : "check"} s={16} /><span>{msg.text}</span>
          </div>
        )}
      </div>
    </div>
  );
}
