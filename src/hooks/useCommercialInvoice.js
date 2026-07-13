import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCommercialInvoiceStatus,
  uploadCommercialInvoice,
  deleteCommercialInvoice,
} from "../api/client";
import {
  validateCommercialInvoiceFile,
  commercialInvoiceErrorMessage,
  pickErrorCode,
} from "../utils/commercialInvoice";

// Kleiner, nachvollziehbarer Statusautomat für die Zoll-Handelsrechnung (keine
// State-Machine-Library). Status: idle | checking | absent | uploading | present
// | deleting | error. Sequence-Ref verhindert, dass veraltete Antworten einen
// neueren Zustand überschreiben; mountedRef verhindert State-Updates nach Unmount;
// busyRef verhindert einen zweiten POST/DELETE durch Doppelklick/Re-Render.
// KEINE Persistenz (kein localStorage/sessionStorage), KEIN Datei-/Body-Logging,
// KEINE Base64 — die PDF verlässt den Browser ausschließlich über das Gateway.
export function useCommercialInvoice({ shipmentId, enabled }) {
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState(null); // "error" | "info" | null
  // Herkunft des letzten Status-„error": "status" (Status-GET), "upload" oder
  // "delete". Erlaubt der UI, den optionalen Dokumentfehler nicht-blockierend und
  // korrekt zu formulieren (Statusprüfung vs. optionaler Upload). Kein Fachgate.
  const [errorScope, setErrorScope] = useState(null); // "status" | "upload" | "delete" | null

  const mountedRef = useRef(true);
  const seqRef = useRef(0);
  const busyRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; seqRef.current++; };
  }, []);

  const live = (seq) => mountedRef.current && seq === seqRef.current;
  const applyError = (code, scope = "status") => { setStatus("error"); setMessageType("error"); setMessage(commercialInvoiceErrorMessage(code)); setErrorScope(scope); };
  const clearMsg = () => { setMessageType(null); setMessage(""); setErrorScope(null); };

  // GET-Status laden. `notice` (optional) wird nach erfolgreichem Sync als
  // Info-Meldung gesetzt (z. B. „bereits hinterlegt" nach 409).
  const readStatus = useCallback(async (opts = {}) => {
    if (!enabled || !shipmentId) return;
    const seq = ++seqRef.current;
    setStatus("checking"); clearMsg();
    let r;
    try { r = await getCommercialInvoiceStatus(shipmentId); }
    catch { if (live(seq)) applyError("UPSTREAM_ERROR", "status"); return; }
    if (!live(seq)) return;
    if (r.status === 401 || r.status === 403) return; // zentraler Auth-Redirect
    let d = {}; try { d = await r.json(); } catch { d = {}; }
    if (!live(seq)) return;
    if (!r.ok) { applyError(pickErrorCode(d), "status"); return; }
    setStatus(d?.present === true ? "present" : "absent");
    if (opts.notice) { setMessageType("info"); setMessage(opts.notice); }
    else clearMsg();
  }, [enabled, shipmentId]);

  // Einmaliger GET beim Eintritt / shipmentId-Wechsel.
  useEffect(() => {
    if (enabled && shipmentId) readStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, shipmentId]);

  const upload = useCallback(async (file) => {
    if (busyRef.current) return; // kein zweiter POST durch Doppelklick/Re-Render
    const pre = validateCommercialInvoiceFile(file); // Client-Vorprüfung (Backend bleibt autoritativ)
    if (!pre.ok) {
      // Reine Client-Vorprüfung: nur Meldung, KEIN Status-„error" (der Dokument-
      // status bleibt geklärt, z. B. absent → Nutzer wählt einfach neu aus).
      setMessageType("error"); setMessage(commercialInvoiceErrorMessage(pre.code));
      return;
    }
    busyRef.current = true;
    const seq = ++seqRef.current;
    setStatus("uploading"); clearMsg();
    let r;
    try { r = await uploadCommercialInvoice(shipmentId, file); }
    catch { busyRef.current = false; if (live(seq)) applyError("UPSTREAM_ERROR", "upload"); return; }
    busyRef.current = false;
    if (!live(seq)) return;
    if (r.status === 401 || r.status === 403) return;
    let d = {}; try { d = await r.json(); } catch { d = {}; }
    if (!live(seq)) return;
    if (r.status === 409) {
      const code = pickErrorCode(d);
      if (code && code !== "COMMERCIAL_INVOICE_EXISTS") {
        // z. B. COMMERCIAL_INVOICE_LOCKED → klarer, retry-fähiger Fehler, KEIN
        // Auto-Retry, KEIN „present"-Vortäuschen.
        applyError(code, "upload");
        return;
      }
      // bereits vorhanden → per GET synchronisieren + verständliche Info anzeigen.
      readStatus({ notice: commercialInvoiceErrorMessage("COMMERCIAL_INVOICE_EXISTS") });
      return;
    }
    if (!r.ok) { applyError(pickErrorCode(d), "upload"); return; }
    // Erfolg erst nach bestätigendem Backend-Readback → present.
    setStatus("present"); clearMsg();
  }, [shipmentId, readStatus]);

  const remove = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    const seq = ++seqRef.current;
    setStatus("deleting"); clearMsg();
    let r;
    try { r = await deleteCommercialInvoice(shipmentId); }
    catch { busyRef.current = false; if (live(seq)) applyError("UPSTREAM_ERROR", "delete"); return; }
    busyRef.current = false;
    if (!live(seq)) return;
    if (r.status === 401 || r.status === 403) return;
    let d = {}; try { d = await r.json(); } catch { d = {}; }
    if (!live(seq)) return;
    if (!r.ok) {
      // keine optimistische Falschdarstellung → harten Fehler zeigen und Status
      // autoritativ per GET nachziehen.
      applyError(pickErrorCode(d), "delete");
      readStatus();
      return;
    }
    // Erfolg erst nach bestätigendem Readback → absent.
    setStatus("absent"); clearMsg();
  }, [shipmentId, readStatus]);

  // refreshStatus: kontrollierter, einmaliger GET (Status → checking → present/
  // absent/error). Keine Timer, kein Polling, kein Auto-Upload/-Delete; die
  // Sequence-/Mounted-Ref-Absicherung greift unverändert.
  return { status, message, messageType, errorScope, upload, remove, refreshStatus: readStatus };
}
