import React from "react";
import { createRoot } from "react-dom/client";
import "../styles/public-calculator.css";
import { fetchPublicLaunchScope, preparePublicCalculator } from "../api/publicCalculatorApi.js";
import { createShippingWarmupSignal } from "../utils/shippingWarmup.mjs";
import { availabilityFromPrepare } from "../utils/publicCalculatorView.mjs";
import { ContentErrorBoundary } from "../components/common/ContentErrorBoundary";
import { PublicCalculatorApp } from "./PublicCalculatorApp.jsx";

// ── Öffentlicher Preisrechner: Einstieg der Insel ────────────────────────────
// Die erste Anweisung meldet den Seitenaufruf, damit der Server den Kaltstart der
// Anbieter vorziehen kann, während die Seite noch lädt. Ohne Body und ohne
// Kopfzeilen (kein Preflight), ohne Cookies, keepalive — und nie abgewartet: das
// Formular ist sofort bedienbar, auch wenn diese Anfrage hängt.
const ersteMeldung = preparePublicCalculator("page");

// Jede Aufwärmmeldung sagt nebenbei, ob der Rechner eingeschaltet ist. Ein
// unbekannter Stand (Fehler, Zeitlimit) sperrt nichts.
const verfuegbarkeit = { wert: null, hoerer: new Set() };
function meldeVerfuegbarkeit(antwort) {
  Promise.resolve(antwort)
    .then((r) => (r && r.ok ? r.json() : null))
    .then((body) => {
      const v = availabilityFromPrepare(body);
      if (v === null) return;
      verfuegbarkeit.wert = v;
      verfuegbarkeit.hoerer.forEach((hoerer) => hoerer(v));
    }, () => {});
  return antwort;
}
meldeVerfuegbarkeit(ersteMeldung);

// Dieselbe Länderliste wie im Kundenrechner — erst nach der Aufwärmmeldung angefragt.
const laenderScope = fetchPublicLaunchScope();

// Sichtbar werden und Aktivität nach einer Ruhephase melden — gedrosselt wie im Portal
// (utils/shippingWarmup.mjs). Der Seitenaufruf ist oben bereits gemeldet und startet hier
// nur die Drosselung, ohne zweite Anfrage.
const signal = createShippingWarmupSignal({
  send: (trigger) => (trigger === "page" ? ersteMeldung : meldeVerfuegbarkeit(preparePublicCalculator(trigger))),
});
signal.onPageEnter();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") signal.onVisible();
});
const aktivitaet = () => { signal.onActivity(); };
window.addEventListener("pointerdown", aktivitaet, { capture: true, passive: true });
window.addEventListener("keydown", aktivitaet, { capture: true, passive: true });

const ziel = document.getElementById("pc-calculator");
if (ziel) {
  createRoot(ziel).render(
    <ContentErrorBoundary bereich="preisrechner" wrapperClassName="pc-boundary">
      <PublicCalculatorApp
        availability={verfuegbarkeit}
        launchScope={laenderScope}
        resultsHost={document.getElementById("pc-results")}
      />
    </ContentErrorBoundary>,
  );
}
