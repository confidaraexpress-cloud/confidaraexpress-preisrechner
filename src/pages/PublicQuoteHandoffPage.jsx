import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useShippingFlow } from "../context/ShippingFlowContext";
import { verifyPriceQuoteHandoff } from "../api/publicCalculatorApi";
import { EmptyState, ErrorState, LoadingState } from "../components/ui/StateView";
import {
  HANDOFF_CAPTURE, HANDOFF_PATH, clearPendingHandoff, handoffCaptureState, peekPendingHandoff, takePendingHandoff,
} from "../utils/publicQuoteHandoffStore.mjs";
import { publicQuoteToShipmentTransfer } from "../utils/calculatorShipmentHandoff.mjs";
import { publicCarrierDisplay, publicServiceName } from "../utils/carrierMap";
import { carrierServiceLabel } from "../utils/carrierServiceLabel.mjs";
import {
  HANDOFF_PAGE_TEXT, HANDOFF_STATE, PUBLIC_CALCULATOR_URL, handoffVerifyOutcome, isCustomerAccount, ownHomeFor,
} from "../utils/publicQuoteHandoffView.mjs";

/* ── /preisrechner-uebernahme — Übernahme aus dem öffentlichen Preisrechner ─────
   Das Übergabetoken hat main.jsx schon vor dem ersten Rendern aus dem Fragment
   gelesen und aus der Adresse entfernt (utils/publicQuoteHandoffStore.mjs). Diese
   Seite entscheidet nur noch:
     • nicht angemeldet → direkt die Registrierung (Betreiberentscheidung 2026-10-16); wer
                          schon ein Konto hat, wechselt dort zur Anmeldung und kommt danach
                          hierher zurück (safeReturnTarget),
     • Kundenkonto      → Prüfung beim Server, dann „Neue Sendung" vorbelegt; der Preis
                          wird dort mit den Konditionen des Kontos neu berechnet,
     • Admin / Partner  → Hinweis und die eigene Startseite, ohne Kundenendpunkt,
     • abgelaufen/ungültig → Hinweis ohne Vorbelegung.
   Gebucht wird hier nichts, und kein Preis wird übernommen. */
export default function PublicQuoteHandoffPage() {
  const { user, authed, loadingUser } = useAuth();
  const { setScope, clearScope } = useShippingFlow();
  const navigate = useNavigate();
  const [zustand, setZustand] = useState(HANDOFF_STATE.CHECKING);
  const laeuft = useRef(false);

  const pruefe = useCallback(async (token) => {
    if (laeuft.current) return;
    laeuft.current = true;
    setZustand(HANDOFF_STATE.CHECKING);
    let antwort;
    try {
      antwort = await verifyPriceQuoteHandoff(token);
    } catch {
      laeuft.current = false;
      setZustand(HANDOFF_STATE.ERROR);
      return;
    }
    let daten = null;
    try { daten = await antwort.json(); } catch { daten = null; }
    const naechster = handoffVerifyOutcome(antwort.status, daten);
    laeuft.current = false;
    // 401: die zentrale Abmeldung führt zur Anmeldung und mit dem Rücksprung hierher zurück —
    // das Token bleibt bis dahin im Modulspeicher.
    if (naechster.kind === "relogin") return;
    if (naechster.kind === "transfer") {
      takePendingHandoff();
      const auswahl = naechster.selection;
      const label = carrierServiceLabel(publicCarrierDisplay(auswahl).name, publicServiceName(auswahl));
      clearScope("shipment");
      setScope("shipment", publicQuoteToShipmentTransfer({ input: naechster.input, selection: auswahl, label }));
      navigate("/dashboard?page=new", { replace: true });
      return;
    }
    if (naechster.consume) takePendingHandoff();
    setZustand(naechster.state);
  }, [clearScope, navigate, setScope]);

  useEffect(() => {
    // Entschieden wird genau einmal je Prüfung: ein späterer Render (etwa ein aktualisiertes Konto)
    // überschreibt keinen bereits gezeigten Ausgang.
    if (loadingUser || zustand !== HANDOFF_STATE.CHECKING) return;
    const token = peekPendingHandoff();
    if (!token) {
      setZustand(handoffCaptureState() === HANDOFF_CAPTURE.INVALID ? HANDOFF_STATE.INVALID : HANDOFF_STATE.EMPTY);
      return;
    }
    if (!authed) {
      navigate("/register", { replace: true, state: { from: HANDOFF_PATH } });
      return;
    }
    if (!isCustomerAccount(user)) {
      // Kein Kundenendpunkt für Admin- und Partnerkonten: Hinweis und eigene Startseite.
      clearPendingHandoff();
      setZustand(HANDOFF_STATE.ROLE);
      return;
    }
    pruefe(token);
  }, [authed, loadingUser, navigate, pruefe, user, zustand]);

  const ziele = (
    <>
      {authed && isCustomerAccount(user) && <Link className="btn btn-primary" to="/dashboard?page=new">{HANDOFF_PAGE_TEXT.newShipment}</Link>}
      <a className="btn btn-outline" href={PUBLIC_CALCULATOR_URL}>{HANDOFF_PAGE_TEXT.calculator}</a>
    </>
  );

  let inhalt;
  if (zustand === HANDOFF_STATE.CHECKING) {
    inhalt = <LoadingState text={HANDOFF_PAGE_TEXT.checking} />;
  } else if (zustand === HANDOFF_STATE.ROLE) {
    const t = HANDOFF_PAGE_TEXT[HANDOFF_STATE.ROLE];
    inhalt = <EmptyState title={t.title} text={t.text}
      action={<Link className="btn btn-primary" id="handoff-own-home" to={ownHomeFor(user)}>{HANDOFF_PAGE_TEXT.ownHome}</Link>} />;
  } else if (zustand === HANDOFF_STATE.ERROR) {
    const t = HANDOFF_PAGE_TEXT[HANDOFF_STATE.ERROR];
    const token = peekPendingHandoff();
    inhalt = <ErrorState title={t.title} text={t.text}
      action={token ? <button type="button" className="btn btn-primary" id="handoff-retry" onClick={() => pruefe(token)}>{HANDOFF_PAGE_TEXT.retry}</button> : null} />;
  } else {
    const t = HANDOFF_PAGE_TEXT[zustand];
    inhalt = <EmptyState title={t.title} text={t.text} action={ziele} />;
  }

  return (
    <div className="page-with-navbar">
      <div className="legal-wrap" id="handoff-page" data-state={zustand}>
        <header className="legal-head">
          <h1 className="legal-title">{HANDOFF_PAGE_TEXT.title}</h1>
        </header>
        {inhalt}
      </div>
    </div>
  );
}
