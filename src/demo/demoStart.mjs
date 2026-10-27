// Startet die Demo-Welt — als ERSTER Import von main.jsx, also bevor irgendein anderes Modul Speicher oder Netz
// berührt. Außerhalb von /demo tut dieses Modul nichts.
//
// Drei Schutzwände, jede für sich ausreichend, zusammen unabhängig voneinander:
//   1. Speicher: localStorage und sessionStorage werden durch Arbeitsspeicher ersetzt (demoSpeicher.mjs). Gelingt
//      das nicht, startet die Demo nicht (sie schriebe sonst in die echte Sitzung dieses Browsers).
//   2. Daten: apiFetch beantwortet jede Anfrage aus der Demo-Datenquelle (demoBackend.mjs) — es ruft fetch nie auf.
//   3. Netz: fetch selbst lehnt jede Anfrage an die API und an fremde Hosts ab (demoNetz.mjs).
import { demoEinschalten, istDemoPfad } from "./demoModus.mjs";
import { speicherAbschirmen } from "./demoSpeicher.mjs";
import { netzSperren } from "./demoNetz.mjs";
import { setzeDemoTransport } from "../api/client.js";

/** Zustand dieser Seitenladung: läuft sie als Demo, und sind Speicher und Netz abgeschirmt? */
export const DEMO_ZUSTAND = { aktiv: false, abgeschirmt: false };

if (typeof window !== "undefined" && istDemoPfad(window.location.pathname)) {
  DEMO_ZUSTAND.aktiv = true;
  DEMO_ZUSTAND.abgeschirmt = speicherAbschirmen(window);
  if (DEMO_ZUSTAND.abgeschirmt) {
    demoEinschalten();
    netzSperren(window);
    // Ein Platzhalter im Ersatzspeicher: der echte AuthProvider fragt damit „/kundenbereich" — und bekommt die Antwort
    // der Demo-Datenquelle. Es ist kein Token und erreicht nie einen Server.
    window.localStorage.setItem("ce_token", "demo");
    setzeDemoTransport((pfad, optionen) => import("./demoBackend.mjs").then((m) => m.demoAntwort(pfad, optionen)));
  }
}
