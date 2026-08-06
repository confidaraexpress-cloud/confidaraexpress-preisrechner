import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { readShippingFlow, writeShippingFlow, clearShippingFlowStorage } from "../utils/shippingFlowStorage";
import {
  emptyFlow,
  flowFingerprint,
  flowHasContent,
  normalizeScope,
  normalizeBooking,
  parseFlow,
  restoreFlow,
  serializeFlow,
} from "../utils/shippingFlowState.mjs";

// Temporärer Versandvorgang — EIN Zustand für „Neue Sendung", Angebotsvergleich
// und Buchung.
//
// ── Warum genau hier ────────────────────────────────────────────────────────
// `/dashboard` (page-State) und `/booking` (Route in DashboardLayout) liegen in
// getrennten Routen-Teilbäumen. Alles unterhalb von <Routes> wird beim Wechsel
// abgehängt — auch DashboardLayout, auch der NotificationsProvider. Dieser
// Provider MUSS deshalb in App.jsx AUSSERHALB von <Routes> stehen (und
// innerhalb des AuthProviders, damit die Abmeldung ihn leeren kann).
// `interfaceFlowPersistence.test.mjs` prüft genau das.
//
// ── Was er tut ──────────────────────────────────────────────────────────────
// Er hält den Vorgang im Speicher und spiegelt ihn in den sessionStorage —
// tab-lokal, versioniert, ohne jede tabübergreifende Synchronisierung. Die
// gesamte Zustandsprüfung liegt in shippingFlowState.mjs (rein und getestet);
// hier steht nur die Anbindung an React und den Browser.
//
// ── Was er NICHT tut ────────────────────────────────────────────────────────
// Keine API-Aufrufe. Keine Buchungs-, Preis- oder Zolllogik. Keine Kopplung an
// client.js. Er ersetzt kein Entwurfssystem: Entwürfe sind bewusst gespeichert,
// serverseitig und geräteübergreifend — dieser Vorgang ist automatisch,
// tab-lokal und kurzlebig.

const ShippingFlowContext = createContext(null);

const speicherLesen = readShippingFlow;
const speicherLoeschen = clearShippingFlowStorage;
const speicherSchreiben = (text) => (text == null ? (speicherLoeschen(), true) : writeShippingFlow(text));

const jetzt = () => Date.now();
const heuteISO = () => new Date().toISOString().slice(0, 10);

export function ShippingFlowProvider({ children }) {
  // Einmalig beim Mount aus dem Speicher lesen. Danach ist der React-State die
  // führende Quelle und der Speicher nur noch Spiegel — es wird NIE wieder
  // gelesen, damit kein Lese-/Schreibkreis entstehen kann.
  const startRef = useRef(undefined);
  if (startRef.current === undefined) {
    const { flow, dropped } = restoreFlow(parseFlow(speicherLesen()), { now: jetzt(), today: heuteISO() });
    startRef.current = { flow: flow || emptyFlow(jetzt()), dropped };
  }

  const [flow, setFlow] = useState(startRef.current.flow);
  // Grund, warum beim Wiederherstellen Angebote verworfen wurden. Die Seiten
  // holen ihn EINMAL ab und zeigen ihn als normalen Hinweis; danach ist er weg.
  const [droppedReason, setDroppedReason] = useState(startRef.current.dropped);

  // Spiegel. Geschrieben wird ausschließlich, wenn sich der fachliche Inhalt
  // geändert hat — der Fingerabdruck lässt Zeitstempel bewusst außen vor, sonst
  // schriebe jeder Render.
  const letzterFingerRef = useRef(flowFingerprint(startRef.current.flow));
  useEffect(() => {
    const finger = flowFingerprint(flow);
    if (finger === letzterFingerRef.current) return;
    letzterFingerRef.current = finger;
    if (!flowHasContent(flow)) { speicherLoeschen(); return; }
    speicherSchreiben(serializeFlow(flow));
  }, [flow]);

  /* ── Schreibzugriffe ──────────────────────────────────────────────────── */

  // Aktualisiert genau einen Bereich („shipment" oder „calculator"). Der Patch
  // wird über normalizeScope geführt: nur bekannte Felder, nur gültige Werte.
  const setScope = useCallback((scope, patch) => {
    setFlow((prev) => {
      const t = jetzt();
      const zusammen = normalizeScope({ ...(prev[scope] || {}), ...patch }, scope);
      if (!zusammen) return prev;
      return { ...prev, [scope]: { ...zusammen, updatedAt: t }, updatedAt: t };
    });
  }, []);

  const setBooking = useCallback((patch) => {
    setFlow((prev) => {
      const t = jetzt();
      const zusammen = normalizeBooking({ ...(prev.booking || {}), ...patch });
      if (!zusammen) return prev;
      return { ...prev, booking: { ...zusammen, updatedAt: t }, updatedAt: t };
    });
  }, []);

  const setStep = useCallback((step) => {
    setFlow((prev) => (prev.step === step ? prev : { ...prev, step, updatedAt: jetzt() }));
  }, []);

  // Vollständiges Löschen — Abmeldung, erfolgreiche Buchung, bewusster Neustart.
  const clearFlow = useCallback(() => {
    const leer = emptyFlow(jetzt());
    letzterFingerRef.current = flowFingerprint(leer);
    speicherLoeschen();
    setFlow(leer);
    setDroppedReason(null);
  }, []);

  // Einen einzelnen Bereich zurücksetzen (z. B. „Eingaben zurücksetzen" in
  // „Neue Sendung"), ohne den jeweils anderen anzufassen.
  const clearScope = useCallback((scope) => {
    setFlow((prev) => ({ ...prev, [scope]: null, booking: scope === "shipment" ? null : prev.booking, updatedAt: jetzt() }));
    setDroppedReason(null);
  }, []);

  // Der Hinweis wird genau einmal ausgeliefert.
  const consumeDroppedReason = useCallback(() => {
    setDroppedReason((r) => (r == null ? r : null));
  }, []);

  /* ── Abmeldung ────────────────────────────────────────────────────────────
     Der Provider liegt INNERHALB des AuthProviders und wird bei einer Abmeldung
     NICHT neu gemountet — ohne diese Bereinigung sähe der nächste Login im
     selben Tab den Vorgang des vorherigen Kontos. Ein einziger Wächter deckt
     alle Wege ab: „Abmelden", abgelaufene Sitzung und der zentrale
     401/403-Handler setzen sämtlich `authed` auf false.

     Der erste Lauf (Mount) darf nichts löschen — sonst verlöre ein Reload den
     Vorgang, bevor die Sitzungsprüfung überhaupt geantwortet hat. */
  const { authed } = useAuth();
  const warAngemeldetRef = useRef(authed);
  useEffect(() => {
    if (warAngemeldetRef.current && !authed) clearFlow();
    warAngemeldetRef.current = authed;
  }, [authed, clearFlow]);

  const wert = useMemo(() => ({
    flow,
    shipment: flow.shipment,
    calculator: flow.calculator,
    booking: flow.booking,
    step: flow.step,
    droppedReason,
    setScope,
    setBooking,
    setStep,
    clearFlow,
    clearScope,
    consumeDroppedReason,
  }), [flow, droppedReason, setScope, setBooking, setStep, clearFlow, clearScope, consumeDroppedReason]);

  return <ShippingFlowContext.Provider value={wert}>{children}</ShippingFlowContext.Provider>;
}

// Der Hook ist bewusst tolerant: außerhalb des Providers (z. B. in einem
// isolierten Test-Mount) liefert er einen neutralen, funktionslosen Zustand
// statt zu werfen. Keine Seite darf daran scheitern, dass die Persistenz
// nicht verfügbar ist.
const NEUTRAL = Object.freeze({
  flow: null, shipment: null, calculator: null, booking: null, step: "form",
  droppedReason: null,
  setScope: () => {}, setBooking: () => {}, setStep: () => {},
  clearFlow: () => {}, clearScope: () => {}, consumeDroppedReason: () => {},
});

export function useShippingFlow() {
  return useContext(ShippingFlowContext) || NEUTRAL;
}

