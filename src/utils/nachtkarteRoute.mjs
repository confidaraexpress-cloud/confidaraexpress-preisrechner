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

/** Quadratischer Bogen von a nach b, senkrecht zur Strecke nach Norden gewölbt — oder null bei gleichem Punkt. */
export function routenBogen(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (!(d > 0)) return null;
  let nx = -dy / d, ny = dx / d;
  if (ny > 0) { nx = -nx; ny = -ny; }
  const mx = (a.x + b.x) / 2 + nx * d * 0.24;
  const my = (a.y + b.y) / 2 + ny * d * 0.24;
  const f = (v) => String(Math.round(v * 10) / 10);
  return `M${f(a.x)},${f(a.y)} Q${f(mx)},${f(my)} ${f(b.x)},${f(b.y)}`;
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
    schluessel: [pfad, von.name || "", nach.name || ""].join("|"),
  };
}

export { KARTE_VB };
