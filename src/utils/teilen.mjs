// System-Teilen für Empfehlungslinks (Betreiberauftrag 2026-11-22, BERICHT D.3). Reine Funktionen — die Komponente
// PartnerLinkCopy zeigt nur an. Geteilt wird ausschließlich die Adresse, kein Werbetext.

export const TEILEN_TEXT = Object.freeze({
  geteilt: "Link geteilt.",
  fehler: "Teilen war nicht möglich. Bitte kopieren Sie den Link.",
});

/** Bietet das Gerät das System-Teilen an — und ist es ein Touch-Gerät? Am Desktop bleibt Kopieren die Hauptaktion. */
export function teilenMoeglich(umgebung = globalThis) {
  try {
    const nav = umgebung && umgebung.navigator;
    if (!nav || typeof nav.share !== "function") return false;
    return Boolean(umgebung.matchMedia && umgebung.matchMedia("(pointer: coarse)").matches);
  } catch {
    return false;
  }
}

/** Teilt die Adresse über das System-Teilen. Ergebnis: „geteilt“; „abgebrochen“, wenn die Person den Dialog schließt
 *  (dann keine Meldung); sonst „fehler“ (die Meldung nennt den Weg über Kopieren). */
export async function linkTeilen(url, umgebung = globalThis) {
  try {
    await umgebung.navigator.share({ title: "ConfidaraExpress", url });
    return "geteilt";
  } catch (e) {
    return e && e.name === "AbortError" ? "abgebrochen" : "fehler";
  }
}
