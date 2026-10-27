// Die Lichter der Nachtkarte (Premium-Redesign, Konzept A, Betreiberentscheidung 2026-10-27): ausgewählte Städte
// leuchten abwechselnd leicht auf — warm, langsam, nie gleichzeitig. Das Kartenbild (assets/illustrations/
// nachtkarte-eu.svg) bleibt unverändert; darüber liegen kleine Lichthöfe genau auf den Stadtlichtern.
//
// Rein und deterministisch: dieselbe Liste bei jedem Aufruf (kein Zufall zur Laufzeit), damit Seite, Tests und
// Bildvergleich übereinstimmen. Jedes Licht trägt seine eigene Dauer und seinen Einsatz; der erste Einsatz folgt
// der Einstiegswelle ab Stuttgart (Sitz von ConfidaraExpress), danach laufen die Lichter frei gegeneinander.
import { KARTE_VB, KARTE_ORTE, KARTE_HAUPTSTADT } from "./nachtkarteOrte.mjs";

/** Ursprung der Einstiegswelle. */
export const WELLE_URSPRUNG = "stuttgart";
/** Dauer der Einstiegswelle über die ganze Karte (ms) — dieselbe Zahl steht in styles/nachtkarte.css. */
export const WELLE_DAUER_MS = 1400;

// Große Städte jenseits der Hauptstädte: dort, wo die Karte ohnehin am hellsten ist.
const WEITERE = Object.freeze([
  "hamburg", "muenchen", "koeln", "frankfurt", "stuttgart", "leipzig", "dresden", "hannover", "nuernberg",
  "lyon", "marseille", "toulouse", "bordeaux", "mailand", "turin", "neapel", "barcelona", "valencia", "sevilla",
  "porto", "rotterdam", "antwerpen", "goeteborg", "krakau", "danzig", "breslau", "thessaloniki", "bruenn",
]);

// Gesäter Zufall (mulberry32): dieselbe Folge bei jedem Aufruf.
function folge(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ORT = new Map(KARTE_ORTE.map(([key, name, x, y, land]) => [key, { key, name, x, y, land }]));
const prozent = (v) => Math.round(v * 1000) / 10;

/**
 * Die Lichter: { key, left, top (Prozent des Kartenbilds), groesse (px), dauer, einsatz (ms), welle (ms), ton (0 | 1) }.
 * `welle` ist der Zeitpunkt, an dem die Einstiegswelle den Ort erreicht (Lichtwelle der Anmeldung).
 * Hauptstädte etwas größer; jedes Licht hat eine eigene Periode (6–11 s), damit nie ein Takt entsteht.
 */
export function nachtkartenLichter() {
  const hauptstaedte = [...new Set(Object.values(KARTE_HAUPTSTADT))];
  const schluessel = [...new Set([...hauptstaedte, ...WEITERE])].filter((k) => ORT.has(k));
  const ursprung = ORT.get(WELLE_URSPRUNG);
  const zufall = folge(20261027);
  const weiteste = Math.max(...schluessel.map((k) => Math.hypot(ORT.get(k).x - ursprung.x, ORT.get(k).y - ursprung.y)));
  return schluessel.map((key, i) => {
    const o = ORT.get(key);
    const abstand = Math.hypot(o.x - ursprung.x, o.y - ursprung.y);
    const dauer = Math.round(6000 + zufall() * 5000);
    // Erster Einsatz: wenn die Welle den Ort erreicht hat, plus ein eigener Versatz innerhalb der Periode.
    const welle = Math.round((abstand / weiteste) * WELLE_DAUER_MS);
    const einsatz = welle + Math.round(zufall() * dauer * 0.9);
    const haupt = hauptstaedte.includes(key);
    return {
      key,
      left: prozent((o.x - KARTE_VB.x) / KARTE_VB.w),
      top: prozent((o.y - KARTE_VB.y) / KARTE_VB.h),
      groesse: Math.round((haupt ? 22 : 15) + zufall() * 6),
      dauer,
      einsatz,
      welle,
      ton: i % 3 === 0 ? 1 : 0,
    };
  });
}

/** Ursprung der Welle in Prozent des Kartenbilds (für die CSS-Maske der Einstiegswelle). */
export function wellenUrsprung() {
  const o = ORT.get(WELLE_URSPRUNG);
  return { left: prozent((o.x - KARTE_VB.x) / KARTE_VB.w), top: prozent((o.y - KARTE_VB.y) / KARTE_VB.h) };
}
