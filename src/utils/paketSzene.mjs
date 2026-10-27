// Paketbühne: die isometrische Zeichnung eines Pakets aus den eingegebenen Maßen (Premium-Redesign, Konzept B,
// Betreiberentscheidung 2026-10-27). Rein darstellend: kein Preis, keine Prüfung, kein Wert geht an den Server.
//
// ── Was die Zeichnung behauptet ──────────────────────────────────────────────────────────────────────────────
// Die Proportionen: Länge, Breite und Höhe werden mit DEMSELBEN Faktor gezeichnet. Einen Maßstab behauptet sie
// nicht — kleine Pakete wachsen bis zu einer Bezugsgröße mit, große werden in die Bühne eingepasst. Die Zahlen an
// den Kanten sind die eingegebenen Werte, nicht gemessen.
//
// ── Warum Matrizen ───────────────────────────────────────────────────────────────────────────────────────────
// Jede Fläche ist ein Einheitsquadrat mit einer 2D-Matrix (CSS `transform: matrix()`). Zwischen zwei Maßen ändern
// sich nur Längen und Lage; Drehung und Scherung jeder Fläche bleiben gleich. Der Browser interpoliert eine
// CSS-Transition dann linear in genau diesen Größen — gemeinsame Kanten bleiben in jedem Bild deckungsgleich, und
// die Bewegung braucht kein JavaScript (Canonical §15: Animationen nur per CSS). Bei reduzierter Bewegung entfällt
// der Übergang (Stylesheet).

const C = Math.cos(Math.PI / 6);
const S = 0.5;

/** Bühnenmaße in Einheiten der viewBox. */
export const PAKET_BUEHNE = Object.freeze({ breite: 320, hoehe: 232, rand: 22, oben: 22, boden: 196 });

/** Das Beispielpaket, solange Maße fehlen (cm). */
export const BEISPIEL_MASSE = Object.freeze({ laenge: 40, breite: 30, hoehe: 24 });

// Bezugspaket: bis zu dieser Größe wird nicht vergrößert — ein kleines Paket bleibt sichtbar kleiner.
const BEZUG = Object.freeze({ laenge: 46, breite: 34, hoehe: 30 });
// Ein sehr kleines Paket soll noch als Paket lesbar sein: mindestens dieser Anteil der Bühnenbreite.
const MIN_ANTEIL = 0.3;
// Etikett in fester Größe (cm): auf großen Kartons wirkt es klein, auf kleinen groß — es ist der Bezug.
const ETIKETT = Object.freeze({ breite: 16, hoehe: 11 });
const MAX_ZEILEN = 3;
const MAX_STAPEL = 2;
const GRENZE_CM = 300;

const istObjekt = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/** Eine Eingabe als positive Zahl in cm/kg — oder null. Komma wie im Formular. */
export function paketZahl(raw) {
  const t = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim().replace(",", ".") : "";
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const menge = (raw) => {
  const n = paketZahl(raw);
  return n !== null && Number.isInteger(n) ? Math.min(n, 99) : 1;
};

const r = (v) => Math.round(v * 100) / 100;

/** CSS-Matrix aus den sechs Werten, auf zwei Nachkommastellen. */
export function matrixText(m) {
  return `matrix(${m.map(r).join(", ")})`;
}

// Die isometrische Projektion (Kabinett ohne Verkürzung): x nach rechts unten, y nach links unten, z nach oben.
const projektion = (x, y, z) => [(x - y) * C, (x + y) * S - z];

/**
 * Die Szene für eine Liste von Paketzeilen (packageLines.mjs) — höchstens drei Zeilen nebeneinander, je Zeile
 * höchstens zwei Kartons gestapelt. Fehlt ein Maß, gilt dafür das Beispielmaß, und die Zeile ist „vorläufig“.
 *
 * @param {Array<object>} zeilen  Paketzeilen mit packageCount, weight, length, width, height (Text oder Zahl)
 * @returns {{
 *   beispiel: boolean, vollstaendig: boolean, zeilenGesamt: number, paketeGesamt: number,
 *   kartons: Array<object>, masse: Array<object>, schatten: Array<object>, faktor: number
 * }}
 */
export function paketSzene(zeilen) {
  const liste = Array.isArray(zeilen) ? zeilen.filter(istObjekt) : [];
  const gelesen = liste.map((z) => ({
    laenge: paketZahl(z.length), breite: paketZahl(z.width), hoehe: paketZahl(z.height),
    gewicht: paketZahl(z.weight), anzahl: menge(z.packageCount), key: typeof z.key === "string" ? z.key : null,
  }));
  const mitMass = gelesen.filter((z) => z.laenge !== null || z.breite !== null || z.hoehe !== null);
  const beispiel = mitMass.length === 0;
  const quelle = beispiel ? [{ ...BEISPIEL_MASSE, gewicht: null, anzahl: 1, key: null }] : mitMass.slice(0, MAX_ZEILEN);
  const vollstaendig = !beispiel && mitMass.every((z) => z.laenge !== null && z.breite !== null && z.hoehe !== null);

  // Kartons in cm: nebeneinander entlang x, gestapelt entlang z.
  const kartons = [];
  let versatz = 0;
  quelle.forEach((z, zeile) => {
    const L = Math.min(z.laenge ?? BEISPIEL_MASSE.laenge, GRENZE_CM);
    const B = Math.min(z.breite ?? BEISPIEL_MASSE.breite, GRENZE_CM);
    const H = Math.min(z.hoehe ?? BEISPIEL_MASSE.hoehe, GRENZE_CM);
    const stapel = Math.min(z.anzahl, MAX_STAPEL);
    for (let s = 0; s < stapel; s += 1) {
      kartons.push({
        id: `z${zeile}-s${s}`, zeile, stapel: s, L, B, H,
        ox: versatz + s * Math.min(L * 0.06, 3), oy: s * -Math.min(B * 0.06, 2), oz: s * H,
        oben: s === stapel - 1,
      });
    }
    versatz += L + Math.max(10, L * 0.2);
  });

  // Einpassen: gemeinsamer Faktor für alle Kartons.
  const ecken = [];
  for (const k of kartons) {
    for (const [x, y, z] of [[0, 0, 0], [k.L, 0, 0], [k.L, k.B, 0], [0, k.B, 0], [0, 0, k.H], [k.L, 0, k.H], [k.L, k.B, k.H], [0, k.B, k.H]]) {
      ecken.push(projektion(x + k.ox, y + k.oy, z + k.oz));
    }
  }
  const xs = ecken.map((p) => p[0]);
  const ys = ecken.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const { breite: W, rand, oben, boden } = PAKET_BUEHNE;
  const nutzB = W - 2 * rand, nutzH = boden - oben;
  const passt = (bx, by) => Math.min(nutzB / bx, nutzH / by);
  const bezugB = (BEZUG.laenge + BEZUG.breite) * C;
  const bezugH = (BEZUG.laenge + BEZUG.breite) * S + BEZUG.hoehe;
  const kEinpassen = passt(maxX - minX, maxY - minY);
  const kBezug = passt(bezugB, bezugH);
  const kMin = (MIN_ANTEIL * W) / Math.max(maxX - minX, 1e-6);
  const faktor = Math.min(kEinpassen, Math.max(kBezug, Math.min(kMin, kEinpassen)));
  const ex = W / 2 - faktor * ((minX + maxX) / 2);
  const ey = boden - faktor * maxY;
  const Q = (x, y, z) => { const [px, py] = projektion(x, y, z); return [ex + faktor * px, ey + faktor * py]; };
  const k = faktor;

  const flaechen = kartons.map((kt) => {
    const { L, B, H, ox, oy, oz } = kt;
    const oben0 = Q(ox, oy, oz + H);
    const rechts0 = Q(ox + L, oy, oz);
    const links0 = Q(ox + L, oy + B, oz);
    const bandB = Math.min(B * 0.22, 7);
    const y0 = B / 2 - bandB / 2;
    const bandOben0 = Q(ox, oy + y0, oz + H);
    const bandSeite0 = Q(ox + L, oy + y0, oz + H * 0.62);
    const karton = {
      id: kt.id, zeile: kt.zeile, stapel: kt.stapel,
      oben: matrixText([k * L * C, k * L * S, -k * B * C, k * B * S, oben0[0], oben0[1]]),
      rechts: matrixText([-k * B * C, k * B * S, 0, -k * H, rechts0[0], rechts0[1]]),
      links: matrixText([-k * L * C, -k * L * S, 0, -k * H, links0[0], links0[1]]),
      bandOben: matrixText([k * L * C, k * L * S, -k * bandB * C, k * bandB * S, bandOben0[0], bandOben0[1]]),
      bandSeite: matrixText([-k * bandB * C, k * bandB * S, 0, -k * H * 0.38, bandSeite0[0], bandSeite0[1]]),
      etikett: null,
    };
    // Das Etikett auf der linken Vorderseite: nur auf dem obersten Karton und nur, wenn es Platz hat.
    if (kt.oben && L >= ETIKETT.breite + 4 && H >= ETIKETT.hoehe + 3) {
      const lx0 = Math.min(L * 0.1, 4);
      const lz1 = Math.min(H * 0.86, H - 1.5);
      const e0 = Q(ox + lx0, oy + B, oz + lz1);
      karton.etikett = matrixText([k * C, k * S, 0, k, e0[0], e0[1]]);
    }
    return karton;
  });

  // Schatten auf dem Boden: je Zeile unter dem untersten Karton, etwas größer als die Grundfläche.
  const schatten = kartons.filter((kt) => kt.stapel === 0).map((kt) => {
    const s0 = Q(kt.ox - 2, kt.oy + 1, 0);
    return { id: `schatten-${kt.zeile}`, matrix: matrixText([k * (kt.L + 6) * C, k * (kt.L + 6) * S, -k * (kt.B + 4) * C, k * (kt.B + 4) * S, s0[0], s0[1]]) };
  });

  // Maße an den Kanten: nur bei einer gezeichneten Zeile, nur für eingegebene Werte, nur wenn die Kante lang genug ist.
  const masse = [];
  if (quelle.length === 1 && !beispiel) {
    const kt = kartons[0];
    const z = quelle[0];
    const abstand = 15;
    const kante = (cm) => cm * k;
    if (z.laenge !== null && kante(kt.L) >= 26) {
      const m = Q(kt.ox + kt.L / 2, kt.oy + kt.B, 0);
      masse.push({ id: "laenge", text: `${zahlText(z.laenge)} cm`, anker: "middle",
        matrix: matrixText([C, S, -S, C, m[0] - abstand * S, m[1] + abstand * C]) });
    }
    if (z.breite !== null && kante(kt.B) >= 26) {
      const m = Q(kt.ox + kt.L, kt.oy + kt.B / 2, 0);
      masse.push({ id: "breite", text: `${zahlText(z.breite)} cm`, anker: "middle",
        matrix: matrixText([C, -S, S, C, m[0] + abstand * S, m[1] + abstand * C]) });
    }
    if (z.hoehe !== null && kante(kt.H) >= 18) {
      const m = Q(kt.ox + kt.L, kt.oy, kt.oz + kt.H / 2);
      masse.push({ id: "hoehe", text: `${zahlText(z.hoehe)} cm`, anker: "start",
        matrix: matrixText([1, 0, 0, 1, m[0] + 9, m[1] + 4]) });
    }
  }

  const paketeGesamt = beispiel ? 0 : gelesen.reduce((s, z) => s + z.anzahl, 0);
  return {
    beispiel, vollstaendig, zeilenGesamt: beispiel ? 0 : gelesen.length, paketeGesamt,
    kartons: flaechen, masse, schatten, faktor: r(faktor),
  };
}

/** Zahl wie im Formular: Dezimalkomma, höchstens eine Nachkommastelle. */
export function zahlText(n) {
  const gerundet = Math.round(n * 10) / 10;
  return String(gerundet).replace(".", ",");
}

/**
 * Die Unterzeile der Bühne: „1 Paket · 40 × 30 × 24 cm · 2,5 kg“, mehrere Zeilen als Summe, sonst die Aufforderung.
 * Maße und Einheiten mit geschützten Leerzeichen (kein Umbruch im Wert).
 */
export function paketBeschriftung(zeilen) {
  const liste = Array.isArray(zeilen) ? zeilen.filter(istObjekt) : [];
  const gelesen = liste.map((z) => ({
    laenge: paketZahl(z.length), breite: paketZahl(z.width), hoehe: paketZahl(z.height),
    gewicht: paketZahl(z.weight), anzahl: menge(z.packageCount),
  }));
  const mitMass = gelesen.filter((z) => z.laenge !== null || z.breite !== null || z.hoehe !== null);
  if (!mitMass.length) return { titel: "Maße eingeben – das Paket nimmt Form an", details: null };
  const nbsp = String.fromCharCode(0xa0); // geschütztes Leerzeichen
  const anzahl = gelesen.reduce((s, z) => s + z.anzahl, 0);
  const pakete = anzahl === 1 ? `1${nbsp}Paket` : `${anzahl}${nbsp}Pakete`;
  if (gelesen.length === 1) {
    const z = gelesen[0];
    const mass = [z.laenge, z.breite, z.hoehe].map((v) => (v === null ? "–" : zahlText(v))).join(`${nbsp}×${nbsp}`);
    const teile = [pakete, `${mass}${nbsp}cm`];
    if (z.gewicht !== null) teile.push(`${zahlText(z.gewicht)}${nbsp}kg${z.anzahl > 1 ? " je Paket" : ""}`);
    return { titel: teile.join(" · "), details: null };
  }
  const gewichte = gelesen.every((z) => z.gewicht !== null)
    ? gelesen.reduce((s, z) => s + z.anzahl * z.gewicht, 0) : null;
  const titel = gewichte === null ? `${pakete} in ${gelesen.length} Größen` : `${pakete} · ${zahlText(gewichte)}${nbsp}kg gesamt`;
  return { titel, details: gelesen.length > MAX_ZEILEN ? `Gezeigt: die ersten ${MAX_ZEILEN} Größen` : null };
}
