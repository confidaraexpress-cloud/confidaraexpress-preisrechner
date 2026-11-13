// Typografie-Schnappschuss der Admin-Anmeldung (/admin/login, Hologramm-Paket).
//
// Die Confidara Signature Typography (2026-11-13) ändert Schrift, Gewichte und Textfarben der ganzen Plattform — die
// Admin-Anmeldung ausdrücklich nicht. Dieser Schnappschuss hält ihre berechneten Schriftwerte fest: jedes Element mit
// eigenem Text sowie jedes Feld und jeder Knopf, in DOM-Reihenfolge, dazu der Platzhalter der Felder und die Maße von
// Panel und Hauptaktion. Die Vergleichsbasis (tests/e2e/fixtures/admin-anmeldung-typografie.json) stammt aus dem Stand
// vor der Änderung (origin/main b123d16; Build 3194450 ist codegleich).
//
// Text wird nur zur Orientierung mitgeschrieben und nicht verglichen (Jahreszahlen, Textpflege). Animationen laufen im
// Test mit reduzierter Bewegung nicht — die Werte sind stabil.

export const TYPOGRAFIE_EIGENSCHAFTEN = [
  "font-family", "font-size", "font-weight", "font-stretch", "font-style", "letter-spacing", "line-height",
  "color", "-webkit-text-fill-color", "background-image", "filter", "text-shadow", "text-transform",
  "-webkit-font-smoothing",
];

/** Liest den Schnappschuss im Browser. Ergebnis: { elemente: [...], masse: {...} } oder null ohne Admin-Anmeldung. */
export async function adminAnmeldungTypografie(page) {
  return page.evaluate((EIGENSCHAFTEN) => {
    const wurzel = document.querySelector(".auth-admin-seite");
    if (!wurzel) return null;
    const eigenerText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const steuerelement = (el) => /^(INPUT|BUTTON|SELECT|TEXTAREA)$/.test(el.tagName);
    const elemente = [wurzel, ...wurzel.querySelectorAll("*")]
      .filter((el) => eigenerText(el) || steuerelement(el))
      .map((el) => {
        const cs = getComputedStyle(el);
        const eintrag = { el: `${el.tagName.toLowerCase()}${[...el.classList].map((k) => `.${k}`).join("")}` };
        for (const p of EIGENSCHAFTEN) eintrag[p] = cs.getPropertyValue(p);
        if (el.tagName === "INPUT") {
          const ph = getComputedStyle(el, "::placeholder");
          eintrag.platzhalter = { color: ph.color, "font-weight": ph.fontWeight, "font-size": ph.fontSize };
        }
        return eintrag;
      });
    const box = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { breite: Math.round(b.width), hoehe: Math.round(b.height) };
    };
    return { elemente, masse: { panel: box(".auth-admin-panel"), cta: box(".auth-admin-cta"), titel: box(".auth-admin-titel") } };
  }, TYPOGRAFIE_EIGENSCHAFTEN);
}

/** Orientierungstext je Element (wird nicht verglichen). */
export async function adminAnmeldungTexte(page) {
  return page.evaluate(() => {
    const wurzel = document.querySelector(".auth-admin-seite");
    if (!wurzel) return [];
    return [wurzel, ...wurzel.querySelectorAll("*")]
      .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || /^(INPUT|BUTTON|SELECT|TEXTAREA)$/.test(el.tagName))
      .map((el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").slice(0, 40));
  });
}
