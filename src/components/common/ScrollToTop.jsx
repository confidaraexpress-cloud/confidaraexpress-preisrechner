import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useShippingFlow } from "../../context/ShippingFlowContext";

// Jeder Seitenwechsel beginnt oben — das bleibt die Regel.
//
// EINE Ausnahme: die Rückkehr in einen laufenden Versandvorgang. Dort stellt die
// Seite selbst die gemerkte Scrollposition wieder her (NewShipmentPage /
// CalculatorPage, jeweils nach dem Rendern der Angebote). Ohne diese Ausnahme
// liefen beide gegeneinander: ScrollToTop setzt auf 0, direkt danach springt die
// Seite zurück — sichtbares Flackern, und bei ungünstigem Timing gewinnt die
// falsche Seite.
//
// Die Ausnahme ist eng gefasst: sie greift nur für den Zielpfad des Vorgangs,
// nur solange tatsächlich ein Vorgang mit gemerkter Position vorliegt, und nur
// beim ersten Wechsel dorthin. Jede andere Navigation — auch eine spätere auf
// dieselbe Seite — verhält sich unverändert.
const FLOW_PFADE = new Set(["/dashboard", "/calculator"]);

export function ScrollToTop() {
  const { pathname } = useLocation();
  const { shipment, calculator } = useShippingFlow();
  // Refs statt State: dieser Wert darf keinen Render auslösen.
  const flowRef = useRef({ shipment, calculator });
  flowRef.current = { shipment, calculator };
  const verbrauchtRef = useRef(false);

  useEffect(() => {
    if (FLOW_PFADE.has(pathname) && !verbrauchtRef.current) {
      const { shipment: s, calculator: c } = flowRef.current;
      const gemerkt = pathname === "/calculator" ? c?.scrollY : s?.scrollY;
      if (gemerkt) { verbrauchtRef.current = true; return; }   // die Seite übernimmt
    }
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
