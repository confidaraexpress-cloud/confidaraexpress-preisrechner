import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { getSupportRequest, replySupportRequest, confirmSupportViewed } from "../../api/supportApi";
import { newIdempotencyKey } from "../../utils/idempotencyKey.mjs";
import { useNotifications } from "../../context/NotificationsContext";
import {
  supportReplyState, supportAuthorLabel, SUPPORT_REPLY_MAX,
  SUPPORT_REPLY_PLACEHOLDER, SUPPORT_REPLY_SUBMIT, SUPPORT_REPLY_ERROR,
  SUPPORT_DETAIL_ERROR, SUPPORT_REOPEN_HINT, supportCategoryLabel,
} from "../../utils/supportRequest.mjs";

// ── Nachrichtenverlauf eines Supportvorgangs (Kundensicht) ───────────────────
// Dialogartige Darstellung eines ASYNCHRONEN Ticketsystems — kein Live-Chat:
// keine Onlineanzeige, keine Tippanzeige, keine Lesebestätigung, keine Anhänge.
// Der Verlauf wird beim Öffnen geladen, nicht laufend nachgeführt.
//
// Der Verlauf enthält ausschließlich ÖFFENTLICHE Nachrichten — interne Vermerke
// des Supports liefert der Kundenendpunkt gar nicht erst aus. Alle Texte werden
// als reiner Text gerendert (React escaped); kein dangerouslySetInnerHTML.
//
// Erledigung der Glockenmeldung: NICHT durch das Laden (ein GET verändert nichts),
// sondern durch die anschließende ausdrückliche Bestätigung mit der zuletzt
// gesehenen Nachrichten-ID. Trifft parallel eine neuere Antwort ein, bleibt deren
// Meldung dadurch aktiv.

const STATUS_META = {
  open: ["badge-yellow", "Offen"],
  in_progress: ["badge-blue", "In Bearbeitung"],
  resolved: ["badge-green", "Erledigt"],
  closed: ["badge-gray", "Geschlossen"],
};

function fmt(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function SupportThread({ requestId, onBack }) {
  const { refresh: refreshNotifications } = useNotifications();
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [reopened, setReopened] = useState(false);
  // Doppelklickschutz ohne State-Abhängigkeit (Muster des Supportdialogs).
  const inFlight = useRef(false);
  // Schlüssel der laufenden Absendeaktion (siehe submit unten). Bewusst ein Ref
  // und kein State: er darf kein Rendern auslösen.
  const idemKey = useRef(null);
  const endRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await getSupportRequest(requestId);
      if (!mountedRef.current) return;
      if (!r.ok) {
        if (r.status !== 401 && r.status !== 403) setError(SUPPORT_DETAIL_ERROR);
        setData(null);
        return;
      }
      const d = await r.json().catch(() => null);
      if (!mountedRef.current || !d) return;
      setData(d);

      // Erst NACH erfolgreichem Laden bestätigen — und nur, wenn es überhaupt eine
      // gespeicherte Nachricht gibt (die Erstanfrage ist keine).
      const through = Number(d.latestMessageId);
      if (Number.isInteger(through) && through > 0) {
        confirmSupportViewed(requestId, through)
          .then(() => { if (mountedRef.current) refreshNotifications(); })
          .catch(() => { /* die Meldung bleibt dann aktiv — das ist der sichere Ausgang */ });
      }
    } catch {
      if (mountedRef.current) setError(SUPPORT_DETAIL_ERROR);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [requestId, refreshNotifications]);

  useEffect(() => { load(); }, [load]);

  // Nach dem Laden und nach einer eigenen Antwort ans Ende des Verlaufs springen.
  useEffect(() => {
    if (endRef.current && data) endRef.current.scrollIntoView({ block: "nearest" });
  }, [data]);

  const state = supportReplyState(reply);

  const submit = async (e) => {
    e.preventDefault();
    if (inFlight.current || !state.valid) return;
    inFlight.current = true;
    setSending(true);
    setSendError("");
    // Schlüssel der ANGEFANGENEN Absendeaktion. Er entsteht einmal und bleibt
    // über Fehlversuche hinweg erhalten: schlägt der Aufruf mit einem
    // Netzwerkfehler fehl, ist nicht erkennbar, ob der Server die Antwort
    // bereits gespeichert hat. Ein zweiter Versuch mit DEMSELBEN Schlüssel kann
    // deshalb nie eine zweite Nachricht erzeugen. Erst nach Erfolg (oder nach
    // einer Textänderung, siehe onChange) wird er verworfen — die nächste
    // bewusste Antwort bekommt einen neuen.
    if (!idemKey.current) idemKey.current = newIdempotencyKey();
    try {
      const r = await replySupportRequest(requestId, reply.trim(), idemKey.current);
      if (!mountedRef.current) return;
      if (!r.ok) {
        if (r.status !== 401 && r.status !== 403) setSendError(SUPPORT_REPLY_ERROR);
        return;
      }
      const d = await r.json().catch(() => null);
      idemKey.current = null;
      setReply("");
      if (d && d.reopened) setReopened(true);
      await load();
    } catch {
      if (mountedRef.current) setSendError(SUPPORT_REPLY_ERROR);
    } finally {
      inFlight.current = false;
      if (mountedRef.current) setSending(false);
    }
  };

  // Eine geänderte Antwort ist eine ANDERE Absendeaktion — sie darf nicht unter
  // dem Schlüssel des vorigen Versuchs als Wiederholung gelten und dadurch
  // stillschweigend verworfen werden.
  const onReplyChange = (value) => {
    if (idemKey.current) idemKey.current = null;
    setReply(value);
  };

  if (loading && !data) {
    return (
      <div className="loading-center" role="status" aria-live="polite">
        <span className="spinner spinner-dark" /> Vorgang wird geladen …
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="sup-thread">
        <button type="button" className="btn btn-outline btn-sm sup-back" onClick={onBack}>
          <Icon n="chevron" s={14} /> Zurück zur Übersicht
        </button>
        <div className="alert alert-error" role="alert">
          <Icon n="x" s={16} />{error || SUPPORT_DETAIL_ERROR}
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={load}>
          <Icon n="refresh" s={14} /> Erneut versuchen
        </button>
      </div>
    );
  }

  const req = data.supportRequest || {};
  const [badgeClass, statusLabel] = STATUS_META[req.status] || ["badge-gray", req.status || "—"];
  const messages = Array.isArray(data.messages) ? data.messages : [];

  return (
    <div className="sup-thread">
      <button type="button" className="btn btn-outline btn-sm sup-back" onClick={onBack}>
        <Icon n="chevron" s={14} /> Zurück zur Übersicht
      </button>

      <div className="sup-thread-head">
        <div className="sup-thread-title">
          <span className="sup-ticket">{req.ticketNumber}</span>
          <span className={`badge ${badgeClass}`}>{req.statusLabel || statusLabel}</span>
        </div>
        <h2 className="sup-subject">{req.subject}</h2>
        <p className="sup-thread-meta">
          {supportCategoryLabel(req.category) || req.category} · Eingegangen am {fmt(req.createdAt)}
        </p>
      </div>

      {reopened && (
        <div className="alert alert-success" role="status">
          <Icon n="shield" s={16} />{SUPPORT_REOPEN_HINT}
        </div>
      )}

      {/* Dialogartige Darstellung: Kundenbeiträge rechts, Supportantworten links.
          Die Zuordnung ist zusätzlich als Text ausgewiesen (nicht nur über die
          Ausrichtung), damit sie ohne Farb-/Layoutwahrnehmung eindeutig bleibt. */}
      <ol className="sup-msgs">
        {messages.map((m, i) => (
          <li
            key={m.id != null ? `m${m.id}` : `original-${i}`}
            className={`sup-msg sup-msg-${m.authorRole === "admin" ? "support" : "customer"}`}
          >
            <div className="sup-msg-head">
              <span className="sup-msg-author">{supportAuthorLabel(m.authorRole)}</span>
              <span className="sup-msg-time">{fmt(m.createdAt)}</span>
            </div>
            <p className="sup-msg-body">{m.message}</p>
          </li>
        ))}
        <li ref={endRef} aria-hidden="true" />
      </ol>

      <form className="sup-reply" onSubmit={submit}>
        <label className="sup-reply-label" htmlFor="sup-reply-field">Antworten</label>
        <textarea
          id="sup-reply-field"
          className="sup-reply-field"
          rows={4}
          value={reply}
          maxLength={SUPPORT_REPLY_MAX}
          placeholder={SUPPORT_REPLY_PLACEHOLDER}
          onChange={(e) => onReplyChange(e.target.value)}
          disabled={sending}
        />
        {sendError && (
          <div className="alert alert-error" role="alert"><Icon n="x" s={16} />{sendError}</div>
        )}
        <div className="sup-reply-actions">
          <span className="sup-reply-hint">
            {req.status === "closed"
              ? "Ihre Antwort öffnet diesen Vorgang wieder."
              : "Ihre Antwort erreicht unser Supportteam direkt."}
          </span>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!state.valid || sending}>
            {sending ? <><span className="spinner" /> Wird gesendet …</> : <><Icon n="mail" s={14} /> {SUPPORT_REPLY_SUBMIT}</>}
          </button>
        </div>
      </form>
    </div>
  );
}
