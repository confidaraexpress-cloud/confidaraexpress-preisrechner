/* ── Kopieren in die Zwischenablage — Erfolg nur nach echtem Kopieren ───────
   Früher meldete die Kopieraktion „Kopiert“, sobald geklickt war — auch wenn
   die Clipboard-API fehlte oder ablehnte (Mail-WebView, verweigerte
   Berechtigung, unsichere Herkunft). Hier gilt: Erfolg nur, wenn einer der
   beiden Wege tatsächlich kopiert hat.
     1. Clipboard-API (`navigator.clipboard.writeText`),
     2. sonst der ältere Weg über ein unsichtbares Textfeld und
        `document.execCommand("copy")`, der nur `true` meldet, wenn kopiert
        wurde.
   Scheitern beide, ist das Ergebnis `false`; die Oberfläche markiert dann den
   Originaltext, damit er von Hand kopiert werden kann.
   `env` ist nur für Tests: ohne Browser lassen sich so beide Wege prüfen. */

export const COPY_TEXTS = Object.freeze({
  copied: "Kopiert",
  failedSelected: "Kopieren nicht möglich – der Text ist markiert. Bitte manuell kopieren.",
  failed: "Kopieren nicht möglich – bitte den Text markieren und manuell kopieren.",
});

/** Kopiert `text`; `true` nur nach tatsächlich erfolgreichem Kopieren. */
export async function copyToClipboard(text, env = globalThis) {
  const value = typeof text === "string" ? text : (text == null ? "" : String(text));
  if (value === "") return false;
  const clip = env && env.navigator ? env.navigator.clipboard : null;
  if (clip && typeof clip.writeText === "function") {
    try {
      await clip.writeText(value);
      return true;
    } catch {
      // weiter mit dem älteren Weg
    }
  }
  return legacyCopy(value, env);
}

function legacyCopy(value, env) {
  const doc = env ? env.document : null;
  if (!doc || !doc.body || typeof doc.createElement !== "function" || typeof doc.execCommand !== "function") return false;
  const vorher = doc.activeElement;
  const feld = doc.createElement("textarea");
  feld.value = value;
  feld.setAttribute("readonly", "");
  feld.setAttribute("aria-hidden", "true");
  feld.style.position = "fixed";
  feld.style.top = "0";
  feld.style.left = "-9999px";
  feld.style.opacity = "0";
  doc.body.appendChild(feld);
  let ok = false;
  try {
    feld.select();
    ok = doc.execCommand("copy") === true;
  } catch {
    ok = false;
  } finally {
    if (typeof feld.remove === "function") feld.remove();
    else doc.body.removeChild(feld);
    // Der Fokus gehört wieder dem Bedienelement, das das Kopieren ausgelöst hat.
    try { if (vorher && typeof vorher.focus === "function") vorher.focus(); } catch { /* ohne Fokus weiter */ }
  }
  return ok;
}

/** Markiert den Textinhalt eines Elements (manuelles Kopieren); `true` bei Erfolg. */
export function selectElementText(el, env = globalThis) {
  try {
    const doc = env ? env.document : null;
    if (!el || !doc || typeof doc.createRange !== "function" || typeof env.getSelection !== "function") return false;
    const range = doc.createRange();
    range.selectNodeContents(el);
    const auswahl = env.getSelection();
    auswahl.removeAllRanges();
    auswahl.addRange(range);
    return true;
  } catch {
    return false;
  }
}
