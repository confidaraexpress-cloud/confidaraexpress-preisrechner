/* utils/packageRulesView.mjs — die verbindlichen Verpackungsregeln eines Angebots als Sätze (Auftrag 2 / P4).
   Reine Funktionen: kein Netz, kein Zustand, kein React.
   ─── DER SERVER BELEGT, DIESE DATEI FORMULIERT ────────────────────────────────
   `packageRules` kommt vom Server als `{ notAccepted: Code[], handlingAidFromKg: Zahl|null }`. Belegt ist das
   durch die Serviceseite des Anbieters (Backend `docs/transglobal/servicegrenzen.md`); hier wird nichts ergänzt.
   ─── FAIL CLOSED ──────────────────────────────────────────────────────────────
   Ein unbekannter Code oder eine fremde Form ergibt KEINE Zeile — nie einen Rohcode und nie eine halbe Aussage. */
import { SERVICE_NOT_ACCEPTED_TEXT } from "./serviceDetailsView.mjs";

const KG = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });

export const PACKAGE_RULES_TEXT = Object.freeze({
  notAccepted: (liste) => `Nicht zugelassen: ${liste}.`,
  handlingAid: (kg) => `Packstücke ab ${kg} kg müssen auf einer Ladehilfe stehen, etwa einer Palette oder einem rollbaren Untersatz.`,
});

const istObjekt = (w) => !!w && typeof w === "object" && !Array.isArray(w);
// Nur eigene Schlüssel: „constructor" oder „__proto__" sind kein Code.
const hat = (tabelle, code) => typeof code === "string" && Object.prototype.hasOwnProperty.call(tabelle, code);

/** Die Regeln in genau der Form des Vertrags — oder `null`. */
export function readPackageRules(tariff) {
  const r = istObjekt(tariff) ? tariff.packageRules : null;
  if (!istObjekt(r)) return null;
  const liste = r.notAccepted;
  if (!Array.isArray(liste) || liste.some((code) => !hat(SERVICE_NOT_ACCEPTED_TEXT, code))) return null;
  if (new Set(liste).size !== liste.length) return null;
  const ab = r.handlingAidFromKg;
  if (ab !== null && !(typeof ab === "number" && Number.isFinite(ab) && ab > 0)) return null;
  if (liste.length === 0 && ab === null) return null;
  return { notAccepted: [...liste], handlingAidFromKg: ab };
}

/** Die Sätze für den Abschnitt „Einschränkungen" — in fester Reihenfolge, ohne Duplikate. */
export function packageRulesLines(tariff) {
  const r = readPackageRules(tariff);
  if (!r) return [];
  const zeilen = [];
  if (r.notAccepted.length > 0) {
    zeilen.push({ key: "packageRules-notAccepted",
                  text: PACKAGE_RULES_TEXT.notAccepted(r.notAccepted.map((c) => SERVICE_NOT_ACCEPTED_TEXT[c]).join(", ")) });
  }
  if (r.handlingAidFromKg !== null) {
    zeilen.push({ key: "packageRules-handlingAid", text: PACKAGE_RULES_TEXT.handlingAid(KG.format(r.handlingAidFromKg)) });
  }
  return zeilen;
}
