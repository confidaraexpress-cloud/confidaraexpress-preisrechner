import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { PageHeader } from "../../components/ui/PageHeader";
import { ErrorState, ListSkeleton } from "../../components/ui/StateView";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import {
  getAdminReconciliationAttempt,
  confirmAdminReconciliationBooked,
  confirmAdminReconciliationNotBooked,
  reviewAdminReconciliationAttempt,
  reviewAdminInvoiceDrift,
} from "../../api/adminApi";
import { money } from "../../utils/formatters";
import { resolveCarrierName } from "../../utils/carrierMap";
import { shipmentStatusMeta } from "../../utils/adminShipments";
import {
  AVAILABILITY_TEXT,
  RECONCILIATION_DIALOGS,
  REVIEW_CODE_OPTIONS,
  attemptLabel,
  buildConfirmBookedBody,
  confirmBookedRequirements,
  driftKindLabel,
  finalActionAvailability,
  inventoryStateLabel,
  normalizeReconciliationAttempt,
  providerLabel,
  reconciliationActionError,
  reconciliationActionSuccess,
  reconciliationStateMeta,
  resolutionMeta,
  tooEarlyText,
  validateProviderReferenceInput,
} from "../../utils/adminReconciliation.mjs";

// ── Buchungsklärung: ein Vorgang ─────────────────────────────────────────────
// Die Seite zeigt, was serverseitig über einen Buchungsversuch feststeht, und hält
// die Entscheidung eines Menschen fest. Sie ruft NIE einen Anbieter. Mindestalter,
// neuester Versuch und Evidenz prüft der Server unter der Zeilensperre erneut —
// die Oberfläche sperrt Knöpfe nur, damit ein Klick nicht sinnlos ist, und
// behandelt jede Ablehnung (409) sauber, ohne selbst etwas zu wiederholen.

const LOAD_ERROR = "Der Buchungsvorgang konnte nicht geladen werden.";
const ACTION_FAILED = "Die Aktion ist fehlgeschlagen. Bitte erneut versuchen.";

const INSURANCE_CONFIRMATION = {
  confirmed: "Vom Anbieter bestätigt",
  unconfirmed: "Gebucht, Bestätigung fehlt",
};

function fmtDateTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? String(v)
    : d.toLocaleString("de-DE", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
const dash = (v) => (v != null && String(v).trim() !== "" ? String(v) : "—");
const moneyOrDash = (v) => (Number.isFinite(v) ? money(v) : "—");
const jaNein = (v) => (v ? "Ja" : "Nein");

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

function Badge({ meta }) {
  const [cls, label, roh] = meta;
  return <span className={`badge ${cls}`} title={roh || undefined}>{label}</span>;
}

// Response-Container defensiv entpacken; die Feldnormalisierung übernimmt
// normalizeReconciliationAttempt.
function selectAttempt(d) {
  if (d && typeof d === "object" && !Array.isArray(d)) {
    for (const k of ["attempt", "bookingAttempt", "data"]) {
      if (d[k] && typeof d[k] === "object" && !Array.isArray(d[k])) return d[k];
    }
    return d;
  }
  return null;
}

async function readJson(resp) {
  try { return await resp.json(); } catch { return {}; }
}

export default function AdminReconciliationDetailPage() {
  const { attemptId } = useParams();
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const [attempt, setAttempt] = useState(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notFound, setNotFound] = useState(false);

  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(null); // null | "booked" | "notBooked" | "drift"
  const [message, setMessage] = useState(null); // { type, text }
  const [conflict, setConflict] = useState(null); // null | { text }
  const [providerReference, setProviderReference] = useState("");
  const [referenceTouched, setReferenceTouched] = useState(false);
  // Dreiwertig: true / false / unbeantwortet — nie ein vorbelegter Schalter.
  const [insuranceConfirmed, setInsuranceConfirmed] = useState(null);
  const [reviewCode, setReviewCode] = useState("");

  const load = useCallback(async ({ keepMessage = false } = {}) => {
    setLoading(true);
    setLoadError("");
    setNotFound(false);
    setConflict(null);
    if (!keepMessage) setMessage(null);
    try {
      const r = await getAdminReconciliationAttempt(attemptId);
      if (!mountedRef.current) return;
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return; // zentraler Redirect via apiFetch
        if (r.status === 404) { setNotFound(true); setAttempt(null); return; }
        setLoadError(r.status === 429 ? "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut." : LOAD_ERROR);
        setAttempt(null);
        return;
      }
      const d = await readJson(r);
      if (!mountedRef.current) return;
      const a = normalizeReconciliationAttempt(selectAttempt(d));
      if (!a) { setLoadError(LOAD_ERROR); setAttempt(null); return; }
      const t = Date.now();
      setAttempt(a);
      setLoadedAt(t);
      setNow(t);
    } catch {
      if (mountedRef.current) { setLoadError(LOAD_ERROR); setAttempt(null); }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [attemptId]);

  useEffect(() => { load(); }, [load]);

  // Beim Wechsel auf einen anderen Vorgang beginnt die Eingabe von vorn.
  useEffect(() => {
    setProviderReference("");
    setReferenceTouched(false);
    setInsuranceConfirmed(null);
    setReviewCode("");
    setDialog(null);
  }, [attemptId]);

  // Die Wartezeit läuft ab dem Ladezeitpunkt herunter — mit der Serverangabe als
  // Ausgangswert, nicht mit der Clientuhr als Maß.
  const elapsed = loadedAt ? Math.max(0, (now - loadedAt) / 1000) : 0;
  const availability = finalActionAvailability(attempt, elapsed);
  const tooEarly = availability.reason === "too_early";

  useEffect(() => {
    if (!tooEarly) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [tooEarly]);

  const back = (
    <Link to="/admin/reconciliation" className="adm-back">
      <Icon n="chevronLeft" s={16} /> Zurück zur Übersicht
    </Link>
  );

  if (loading && !attempt) {
    return (
      <div className="adm-page">
        {back}
        <div className="table-card"><ListSkeleton rows={5} label="Buchungsvorgang wird geladen …" /></div>
      </div>
    );
  }
  if (notFound) {
    return (
      <div className="adm-page">
        {back}
        <div className="table-card">
          <div className="empty">
            <div className="empty-icon" aria-hidden="true"><Icon n="search" s={24} /></div>
            <div className="empty-title">Dieser Buchungsvorgang wurde nicht gefunden.</div>
            <Link className="btn btn-outline btn-sm" to="/admin/reconciliation">Zurück zur Übersicht</Link>
          </div>
        </div>
      </div>
    );
  }
  if (loadError || !attempt) {
    return (
      <div className="adm-page">
        {back}
        <div className="ce-card">
          <ErrorState
            title={loadError || LOAD_ERROR}
            action={(
              <button type="button" className="btn btn-primary btn-sm" onClick={() => load()}>
                <Icon n="refresh" s={14} /> Erneut versuchen
              </button>
            )}
          />
        </div>
      </div>
    );
  }

  const a = attempt;
  const req = confirmBookedRequirements(a);
  const refCheck = validateProviderReferenceInput(providerReference);
  const decisionOpen = !a.resolution && (availability.available || tooEarly);
  const bookedReady = availability.available
    && (!req.providerReferenceRequired || refCheck.ok)
    && (!req.insuranceDecisionRequired || insuranceConfirmed === true || insuranceConfirmed === false);
  const drift = a.invoiceDrift;
  const driftReviewed = Boolean(drift && drift.reviewedAt);

  const perform = async (kind) => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    setConflict(null);
    try {
      let resp;
      if (kind === "booked") {
        let body;
        try {
          body = buildConfirmBookedBody({ requirements: req, providerReference, insuranceConfirmed });
        } catch {
          setDialog(null);
          setMessage({ type: "error", text: "Bitte die erforderlichen Angaben vollständig und gültig ausfüllen." });
          return;
        }
        resp = await confirmAdminReconciliationBooked(a.id, body);
      } else if (kind === "notBooked") {
        resp = await confirmAdminReconciliationNotBooked(a.id);
      } else if (kind === "drift") {
        resp = await reviewAdminInvoiceDrift(a.id);
      } else {
        resp = await reviewAdminReconciliationAttempt(a.id, reviewCode || undefined);
      }
      if (!mountedRef.current) return;
      if (resp.status === 401 || resp.status === 403) return; // zentraler Redirect
      const body = await readJson(resp);
      if (!mountedRef.current) return;
      setDialog(null);
      if (resp.ok) {
        setMessage({ type: "success", text: reconciliationActionSuccess(body).message });
        await load({ keepMessage: true });
        return;
      }
      const err = reconciliationActionError(resp.status, body);
      if (err.kind === "too_early") {
        // Der Server nennt die verbleibende Wartezeit — sie ersetzt die angezeigte.
        const t = Date.now();
        setAttempt((prev) => (prev
          ? { ...prev, actionable: false, retryAfterSeconds: err.retryAfterSeconds ?? prev.retryAfterSeconds }
          : prev));
        setLoadedAt(t);
        setNow(t);
        setMessage({ type: "info", text: err.message });
        return;
      }
      if (err.reloadRecommended) {
        setConflict({ text: err.message });
        return;
      }
      const fehlend = err.missingFields.length > 0 ? ` Es fehlen ${err.missingFields.length} Pflichtangaben.` : "";
      setMessage({ type: "error", text: `${err.message}${fehlend}` });
    } catch {
      if (mountedRef.current) { setDialog(null); setMessage({ type: "error", text: ACTION_FAILED }); }
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const alertClass = message
    ? (message.type === "success" ? "alert-success" : message.type === "info" ? "alert-info" : "alert-error")
    : "";
  const alertIcon = message ? (message.type === "success" ? "check" : message.type === "info" ? "info" : "x") : "x";
  const [shipCls, shipLabel] = a.shipmentStatus ? shipmentStatusMeta(a.shipmentStatus) : ["badge-gray", "—"];

  return (
    <div className="adm-page">
      <PageHeader
        variant="admin"
        eyebrow="Buchungsklärung"
        backLink={back}
        title={attemptLabel(a)}
        subtitle={(
          <span className="adm-detail-sub">
            <span>{providerLabel(a.provider)}</span>
            {a.shipmentId != null && <span>Sendung #{a.shipmentId}</span>}
          </span>
        )}
        meta={(
          <>
            <Badge meta={reconciliationStateMeta(a.state)} />
            <Badge meta={resolutionMeta(a.resolution)} />
            <span className="adm-chip"><Icon n="calendar" s={13} /> Begonnen {fmtDateTime(a.createdAt)}</span>
            {!a.isLatest && <span className="adm-chip">Überholt</span>}
          </>
        )}
        actions={(
          <button type="button" className="btn btn-outline btn-sm" onClick={() => load()} disabled={loading || busy}>
            <Icon n="refresh" s={14} /> Aktualisieren
          </button>
        )}
      />

      <div className="adm-scope-note" role="note">
        <Icon n="info" s={18} />
        <div>
          <strong>Hier wird nur festgehalten, was beim Anbieter festgestellt wurde.</strong> Es wird kein
          Anbieter kontaktiert, nichts storniert und nichts erstattet. Jede Entscheidung wird im Admin-Audit
          protokolliert.
        </div>
      </div>

      {message && (
        <div className={`alert ${alertClass}`} id="recon-message" role={message.type === "error" ? "alert" : "status"} aria-live="polite">
          <Icon n={alertIcon} s={16} />{message.text}
        </div>
      )}

      {conflict && (
        <div className="adm-conflict" id="recon-conflict" role="alert" aria-live="assertive">
          <div className="adm-conflict-text">
            <Icon n="refresh" s={16} />
            <span>{conflict.text} Die Aktion wurde <strong>nicht</strong> ausgeführt.</span>
          </div>
          <div className="adm-conflict-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => load()} disabled={busy}>
              <Icon n="refresh" s={14} /> Aktuellen Stand laden
            </button>
          </div>
        </div>
      )}

      <div className="adm-cards">
        {/* 1) Entscheidung — zuerst, weil hier gehandelt wird. */}
        <div className="adm-card" id="recon-decision">
          <div className="adm-card-head"><Icon n="shieldCheck" s={17} /> Entscheidung</div>
          <div className="adm-card-body">
            {a.resolution && (
              <KV items={[
                ["Entscheidung", <Badge meta={resolutionMeta(a.resolution)} />],
                ["Entschieden am", fmtDateTime(a.resolvedAt)],
                ["Entschieden von", a.resolvedBy != null ? `Admin #${a.resolvedBy}` : "—"],
              ]} />
            )}

            {!a.resolution && !availability.available && !tooEarly && (
              <div className="adm-note adm-note--info adm-recon-unavailable" id="recon-unavailable" role="note">
                <Icon n="info" s={16} />
                <span>{AVAILABILITY_TEXT[availability.reason] || AVAILABILITY_TEXT.unknown}</span>
              </div>
            )}

            {tooEarly && (
              <div className="adm-note adm-note--warning adm-recon-wait" id="recon-countdown" role="status" aria-live="polite">
                <Icon n="clockDelay" s={16} />
                <span>{tooEarlyText(availability.remainingSeconds)}</span>
              </div>
            )}

            {decisionOpen && (
              <>
                {req.providerReferenceRequired ? (
                  <div className="adm-edit-field">
                    <label className="adm-edit-label" htmlFor="recon-provider-reference">Auftragsreferenz des Anbieters</label>
                    <input
                      id="recon-provider-reference"
                      className="field-input"
                      type="text"
                      value={providerReference}
                      onChange={(e) => setProviderReference(e.target.value)}
                      onBlur={() => setReferenceTouched(true)}
                      maxLength={64}
                      autoComplete="off"
                      spellCheck={false}
                      disabled={busy}
                      aria-invalid={referenceTouched && !refCheck.ok ? "true" : undefined}
                      aria-describedby="recon-provider-reference-hint"
                    />
                    <span className="adm-edit-hint" id="recon-provider-reference-hint">
                      {referenceTouched && !refCheck.ok
                        ? refCheck.message
                        : "Nur für „Als gebucht bestätigen“: die Referenz, unter der die Buchung beim Anbieter steht."}
                    </span>
                  </div>
                ) : req.storedProviderReference ? (
                  <KV items={[["Gespeicherte Anbieterreferenz", <span className="adm-mono">{req.storedProviderReference}</span>]]} />
                ) : null}

                {req.insuranceDecisionRequired && (
                  <fieldset className="adm-recon-insurance">
                    <legend className="adm-edit-label">Besteht die Zusatzabsicherung beim Anbieter?</legend>
                    <label>
                      <input
                        type="radio" name="recon-insurance" id="recon-insurance-yes"
                        checked={insuranceConfirmed === true} onChange={() => setInsuranceConfirmed(true)} disabled={busy}
                      /> Ja, sie ist beim Anbieter gebucht
                    </label>
                    <label>
                      <input
                        type="radio" name="recon-insurance" id="recon-insurance-no"
                        checked={insuranceConfirmed === false} onChange={() => setInsuranceConfirmed(false)} disabled={busy}
                      /> Nein, sie besteht nicht
                    </label>
                  </fieldset>
                )}

                <div className="adm-recon-actions">
                  <button
                    type="button" id="recon-confirm-booked" className="btn btn-primary btn-sm"
                    disabled={!bookedReady || busy} onClick={() => setDialog("booked")}
                  >
                    <Icon n="check" s={14} /> Als gebucht bestätigen
                  </button>
                  <button
                    type="button" id="recon-confirm-not-booked" className="btn btn-outline btn-sm"
                    disabled={!availability.available || busy} onClick={() => setDialog("notBooked")}
                  >
                    <Icon n="x" s={14} /> Als nicht gebucht bestätigen
                  </button>
                </div>
              </>
            )}

            {!a.resolution && (
              <div className="adm-recon-review">
                <div className="adm-edit-field">
                  <label className="adm-edit-label" htmlFor="recon-review-code">Prüfvermerk — der Vorgang bleibt offen</label>
                  <select
                    id="recon-review-code" className="field-select adm-edit-select"
                    value={reviewCode} onChange={(e) => setReviewCode(e.target.value)} disabled={busy}
                  >
                    <option value="">Ohne Angabe</option>
                    {REVIEW_CODE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <button type="button" id="recon-review" className="btn btn-outline btn-sm" onClick={() => perform("review")} disabled={busy}>
                  <Icon n="clock" s={14} /> Prüfvermerk speichern
                </button>
              </div>
            )}
            {a.lastReviewedAt && <p className="adm-support-hint">Zuletzt geprüft: {fmtDateTime(a.lastReviewedAt)}</p>}
          </div>
        </div>

        {/* 2) Vorgang — was beim Anbieter angefragt wurde und was er gesagt hat. */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="package" s={17} /> Vorgang</div>
          <div className="adm-card-body">
            <KV items={[
              ["Anbieter", providerLabel(a.provider)],
              ["Versuch beim Anbieter", a.attempt != null ? String(a.attempt) : "—"],
              ["Anbieterausgang", <Badge meta={reconciliationStateMeta(a.state)} />],
              ["Technischer Grund", dash(a.ambiguousReason)],
              ["Eigene Referenz", a.yourReference ? <span className="adm-mono">{a.yourReference}</span> : "—"],
              ["Buchungsreferenz des Anbieters", a.providerBookingReference ? <span className="adm-mono">{a.providerBookingReference}</span> : "—"],
              ["Fehlerreferenz des Anbieters", a.providerFailReference ? <span className="adm-mono">{a.providerFailReference}</span> : "—"],
              ["Leistung (Anbieter)", a.providerServiceId ? <span className="adm-mono">{a.providerServiceId}</span> : "—"],
              ["Carrier", a.carrierPublicId ? resolveCarrierName(a.carrierPublicId) : (a.shipmentCarrier ? resolveCarrierName(a.shipmentCarrier) : "—")],
              ["Begonnen", fmtDateTime(a.createdAt)],
              ["Abgeschlossen", fmtDateTime(a.completedAt)],
            ]} />
          </div>
        </div>

        {/* 3) Sendung und lokaler Stand. */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="shieldCheck" s={17} /> Sendung und lokaler Stand</div>
          <div className="adm-card-body">
            <KV items={[
              ["Sendung", a.shipmentId != null
                ? <Link to={`/admin/shipments/${encodeURIComponent(a.shipmentId)}`}>Sendung #{a.shipmentId}</Link>
                : <span className="adm-muted">Nicht mehr vorhanden</span>],
              ["Sendungsstatus", <span className={`badge ${shipCls}`}>{shipLabel}</span>],
              ["Neuester Versuch der Sendung", jaNein(a.isLatest)],
              ["Lager", inventoryStateLabel(a.inventoryState)],
              ["Bestellnummer vergeben", jaNein(a.hasBusinessOrderNumber)],
              ["Rechnung vorhanden", jaNein(a.hasInvoice)],
            ]} />
          </div>
        </div>

        {/* 4) Eingefrorener kaufmännischer Stand. */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="euro" s={17} /> Eingefrorener Stand</div>
          <div className="adm-card-body">
            <KV items={[
              ["Kundenpreis brutto", moneyOrDash(a.customerGross)],
              ["Kundenpreis netto", moneyOrDash(a.customerNet)],
              ["Umsatzsteuer", moneyOrDash(a.customerVat)],
              ["Einkauf netto (revalidiert)", moneyOrDash(a.revalidatedPurchaseNet)],
              ["Preisstand vollständig", jaNein(a.snapshotComplete)],
              ["Abschlussangaben eingefroren", jaNein(a.hasCompletionInputs)],
              ["Vertragsstand eingefroren", jaNein(a.legalFrozen)],
              ...(a.insuranceSelected ? [
                ["Zusatzabsicherung", dash(a.insuranceType)],
                ["Versicherter Betrag", moneyOrDash(a.insuranceCoverValue)],
                ["Absicherung laut Anbieter", INSURANCE_CONFIRMATION[a.insuranceConfirmation] || "Keine Bestätigung"],
              ] : []),
            ]} />
          </div>
        </div>

        {/* 5) Rechnungsabweichung — nur, wenn es einen Befund gibt. */}
        {drift && (
          <div className="adm-card" id="recon-drift">
            <div className="adm-card-head"><Icon n="invoice" s={17} /> Rechnungsabweichung</div>
            <div className="adm-card-body">
              <KV items={[
                ["Befund", driftKindLabel(drift.kind)],
                ["Erwartet netto", moneyOrDash(drift.expectedNet)],
                ["Laut Anbieterrechnung netto", moneyOrDash(drift.actualNet)],
                ["Differenz netto", moneyOrDash(drift.deltaNet)],
                ["Erkannt", fmtDateTime(drift.detectedAt)],
                ["Alarm versendet", fmtDateTime(drift.alertedAt)],
                ["Geprüft", driftReviewed ? fmtDateTime(drift.reviewedAt) : "Noch nicht geprüft"],
                ["Geprüft von", drift.reviewedBy != null ? `Admin #${drift.reviewedBy}` : "—"],
              ]} />
              <div className="adm-recon-drift-actions">
                <button
                  type="button" id="recon-drift-review" className="btn btn-outline btn-sm"
                  onClick={() => setDialog("drift")} disabled={driftReviewed || busy}
                >
                  <Icon n="check" s={14} /> {driftReviewed ? "Bereits als geprüft vermerkt" : "Als geprüft markieren"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {dialog && (
        <ConfirmDialog
          title={RECONCILIATION_DIALOGS[dialog].title}
          text={RECONCILIATION_DIALOGS[dialog].text}
          subline={`${attemptLabel(a)} · ${providerLabel(a.provider)}${a.shipmentId != null ? ` · Sendung #${a.shipmentId}` : ""}`}
          note="Die Entscheidung wird im Admin-Audit protokolliert."
          confirmLabel={RECONCILIATION_DIALOGS[dialog].confirm}
          icon={dialog === "notBooked" ? "x" : "check"}
          confirmIcon={dialog === "notBooked" ? "x" : "check"}
          danger={dialog === "notBooked"}
          irreversible={dialog === "booked"}
          busy={busy}
          busyLabel="Wird ausgeführt…"
          onCancel={() => { if (!busy) setDialog(null); }}
          onConfirm={() => perform(dialog)}
        />
      )}
    </div>
  );
}
