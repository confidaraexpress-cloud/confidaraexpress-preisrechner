// Strecke auf der Nachtkarte (Konzept A, öffentlicher Preisrechner): Absender und Empfänger als Punkte im
// Kartenbild, dazwischen ein nach Norden gewölbter Bogen. Rein darstellend: keine Entfernung, kein Preis, keine
// Prüfung der Adresse.
//
// Ein Ortsname erscheint nur, wenn der eingegebene Ort genau bekannt ist. Sonst steht der Punkt ohne Namen an der
// Leitzone der deutschen Postleitzahl bzw. an der Hauptstadt des Landes, damit die Karte nie einen Ort behauptet,
// den es so nicht gibt. Länder ohne Platz auf der Karte (kein eigener Hauptstadtpunkt) bekommen keine Strecke.
import { KARTE_VB, KARTE_ORTE, KARTE_HAUPTSTADT, KARTE_ZONE, KARTE_ALIAS } from "./nachtkarteOrte.mjs";

const norm = (s) => String(s || "").trim().toLowerCase()
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

const PUNKT = new Map();
const NAME = new Map();
for (const [key, name, x, y, land] of KARTE_ORTE) {
  PUNKT.set(key, { key, name, x, y, land });
  NAME.set(norm(name), key);
  NAME.set(norm(key.replace(/-/g, " ")), key);
}

/** Punkt im Kartenbild für Land, PLZ und Ort — oder null. `genau` nur bei bekanntem Ort im selben Land. */
export function kartenPunkt(land, plz, ort) {
  const l = typeof land === "string" ? land.trim().toUpperCase() : "";
  const n = norm(ort);
  const key = n ? (KARTE_ALIAS[n] || NAME.get(n)) : null;
  const bekannt = key ? PUNKT.get(key) : null;
  if (bekannt && bekannt.land === l) return { x: bekannt.x, y: bekannt.y, name: bekannt.name, genau: true };
  const p = String(plz || "").trim();
  if (l === "DE" && /^\d/.test(p)) {
    const zone = PUNKT.get(KARTE_ZONE[Number(p[0])]);
    if (zone) return { x: zone.x, y: zone.y, name: null, genau: false };
  }
  const haupt = PUNKT.get(KARTE_HAUPTSTADT[l]);
  return haupt && haupt.land === l ? { x: haupt.x, y: haupt.y, name: null, genau: false } : null;
}

// Kontrollpunkt des Bogens: senkrecht zur Strecke, immer nach Norden gewölbt.
function kontrollpunkt(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (!(d > 0)) return null;
  let nx = -dy / d, ny = dx / d;
  if (ny > 0) { nx = -nx; ny = -ny; }
  return { x: (a.x + b.x) / 2 + nx * d * 0.24, y: (a.y + b.y) / 2 + ny * d * 0.24 };
}

/** Quadratischer Bogen von a nach b, senkrecht zur Strecke nach Norden gewölbt — oder null bei gleichem Punkt. */
export function routenBogen(a, b) {
  const m = kontrollpunkt(a, b);
  if (!m) return null;
  const f = (v) => String(Math.round(v * 10) / 10);
  return `M${f(a.x)},${f(a.y)} Q${f(m.x)},${f(m.y)} ${f(b.x)},${f(b.y)}`;
}

// CSS-Kurve cubic-bezier(x1, y1, x2, y2) als Funktion der Zeit (0…1): die Zeichnung der Linie nutzt
// --ce-motion-ease-standard = cubic-bezier(0.2, 0.7, 0.3, 1); der Lichtpunkt folgt derselben Kurve.
export function kubischeKurve(x1, y1, x2, y2) {
  const bez = (p1, p2, t) => 3 * p1 * t * (1 - t) ** 2 + 3 * p2 * t * t * (1 - t) + t ** 3;
  return (u) => {
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    let lo = 0, hi = 1, t = u;
    for (let i = 0; i < 40; i += 1) {
      t = (lo + hi) / 2;
      if (bez(x1, x2, t) < u) lo = t; else hi = t;
    }
    return bez(y1, y2, t);
  };
}
const LINIE_KURVE = kubischeKurve(0.2, 0.7, 0.3, 1);

/** Zahl der Stützpunkte des Lichtpunkts (0 bis 12 — dreizehn Schlüsselbilder in public-calculator.css). */
export const LICHTPUNKT_STUETZEN = 13;

/**
 * Stützpunkte des Lichtpunkts entlang des Bogens: zu gleichen Zeitabständen, an der Stelle, die die Linie dann
 * erreicht hat (Bogenlänge, dieselbe Kurve wie die Zeichnung). Ergibt CSS-Schlüsselbilder ohne JavaScript-Animation.
 */
export function lichtpunktStuetzen(a, b, anzahl = LICHTPUNKT_STUETZEN) {
  const m = kontrollpunkt(a, b);
  if (!m) return [];
  const punkt = (t) => ({
    x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * m.x + t * t * b.x,
    y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * m.y + t * t * b.y,
  });
  // Bogenlänge tabellieren, dann zu jedem Anteil das passende t suchen.
  const N = 200;
  const laengen = [0];
  let vorher = punkt(0);
  for (let i = 1; i <= N; i += 1) {
    const p = punkt(i / N);
    laengen.push(laengen[i - 1] + Math.hypot(p.x - vorher.x, p.y - vorher.y));
    vorher = p;
  }
  const gesamt = laengen[N];
  const r1 = (v) => Math.round(v * 10) / 10;
  return Array.from({ length: anzahl }, (_, i) => {
    const ziel = LINIE_KURVE(i / (anzahl - 1)) * gesamt;
    let j = 0;
    while (j < N && laengen[j + 1] < ziel) j += 1;
    const abschnitt = laengen[j + 1] - laengen[j] || 1;
    const t = (j + (ziel - laengen[j]) / abschnitt) / N;
    const p = punkt(Math.min(1, t));
    return { x: r1(p.x), y: r1(p.y) };
  });
}

const lage = (p) => ({
  left: Math.round(((p.x - KARTE_VB.x) / KARTE_VB.w) * 1000) / 10,
  top: Math.round(((p.y - KARTE_VB.y) / KARTE_VB.h) * 1000) / 10,
});

/**
 * Strecke aus den Formularwerten des Preisrechners — oder null, solange eine Seite weder PLZ noch Ort trägt,
 * ein Punkt fehlt oder beide Punkte zusammenfallen. Lagen in Prozent des Kartenbilds.
 */
export function kartenStrecke(form) {
  const f = form || {};
  const hat = (plz, ort) => String(plz || "").trim() !== "" || String(ort || "").trim() !== "";
  if (!hat(f.from_zip, f.from_city) || !hat(f.to_zip, f.to_city)) return null;
  const von = kartenPunkt(f.from_country, f.from_zip, f.from_city);
  const nach = kartenPunkt(f.to_country, f.to_zip, f.to_city);
  if (!von || !nach) return null;
  const pfad = routenBogen(von, nach);
  if (!pfad) return null;
  return {
    pfad,
    von: { ...von, ...lage(von) },
    nach: { ...nach, ...lage(nach) },
    licht: lichtpunktStuetzen(von, nach),
    schluessel: [pfad, von.name || "", nach.name || ""].join("|"),
  };
}

export { KARTE_VB };
