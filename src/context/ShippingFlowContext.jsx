import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { clearShippingFlowStorage } from "../utils/shippingFlowStorage";
import {
  emptyFlow,
  normalizeScope,
  normalizeBooking,
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
// Er hält den Vorgang AUSSCHLIESSLICH im Arbeitsspeicher — tab-lokal,
// kurzlebig, ohne jede Persistenz. Die Zustandsprüfung liegt in
// shippingFlowState.mjs (rein und getestet); hier steht nur die Anbindung an
// React.
//
// ── Warum nichts mehr persistiert wird ──────────────────────────────────────
// Bis zum Paket „leerer Nullzustand" spiegelte der Provider den Vorgang in den
// sessionStorage und stellte ihn beim Mount daraus wieder her. Damit überlebte
// ein halb ausgefülltes Formular jeden Browser-Reload: F5 auf „Neue Sendung"
// holte Absender, Empfänger, Paketdaten und alte Angebote zurück, obwohl der
// Kunde nichts gespeichert hatte.
//
// Der Vorgang lebt seitdem nur noch hier. Das trennt die beiden Fälle sauber:
//   • Wechsel INNERHALB der laufenden SPA-Sitzung (Sidebar, „Zurück" aus der
//     Buchung, Browser-Vorwärts) — der Provider hängt außerhalb von <Routes>
//     und wird dabei nicht abgehängt, der Vorgang bleibt also erhalten.
//   • Browser-Reload — der React-Baum entsteht neu, der Vorgang ist weg, das
//     Formular startet leer.
// Wer Angaben behalten will, speichert einen Entwurf: bewusst, serverseitig,
// geräteübergreifend. Genau dafür gibt es ihn.
//
// ── Was er NICHT tut ────────────────────────────────────────────────────────
// Keine API-Aufrufe. Keine Buchungs-, Preis- oder Zolllogik. Keine Kopplung an
// client.js. Er ersetzt kein Entwurfssystem.

const ShippingFlowContext = createContext(null);

const jetzt = () => Date.now();

export function ShippingFlowProvider({ children }) {
  const [flow, setFlow] = useState(() => emptyFlow(jetzt()));
  // Es gibt keinen Wiederherstellungsweg mehr und damit auch keinen Grund, der
  // gemeldet werden müsste. Der Wert bleibt im Vertrag, damit die Seiten
  // unverändert bleiben — er ist dauerhaft null.
  const [droppedReason, setDroppedReason] = useState(null);

  // Einmalig einen Restwert aus einem älteren Bundle abräumen. Gehashte
  // Bundles gehen mit `immutable` hinaus: ein zum Deploymentzeitpunkt offener
  // Tab kann den Schlüssel noch geschrieben haben, und er lebt sonst bis zum
  // Schließen des Tabs weiter.
  useEffect(() => { clearShippingFlowStorage(); }, []);

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
    clearShippingFlowStorage();
    setFlow(emptyFlow(jetzt()));
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

