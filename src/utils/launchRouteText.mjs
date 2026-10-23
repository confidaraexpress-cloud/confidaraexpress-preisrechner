// ── Kundentext für eine vom Server gesperrte Versandroute (rein) ─────────────────────────────
//
// Der Server lehnt eine Route mit `422 ROUTE_NOT_SUPPORTED` ab und nennt maschinenlesbar den Grund
// (`reason`), die Seite (`field`: sender | recipient) und — seit Paket C des
// Master-Implementierungsauftrags (2026-10-23) — bei einem Sondergebiet dessen Namen (`territory`,
// z. B. „Kanarische Inseln"). Bis dahin las der Kunde für jede Sperre denselben Satz und den Rat,
// Versanddatum und Paketdaten zu prüfen — für eine Kanaren-Adresse eine Irreführung.
//
// Dieses Modul formuliert aus den drei Feldern den einen Satz, den der Kunde liest. Es nennt das
// erkannte Gebiet, nie eine rechtliche Begründung („Zoll", „Drittland") und nie einen Anbieter.
// Kein React, kein fetch — dieselbe Funktion für den Kundenbereich (apiError.mjs) und den
// öffentlichen Preisrechner (publicCalculatorView.mjs).

export const ROUTE_NOT_SUPPORTED_TITLE = "Versandziel nicht verfügbar";

const SEITE = Object.freeze({ sender: "Absenderadresse", recipient: "Empfängeradresse" });

const text = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

// Security-Review Paket C (B4): der Gebietsname ist der erste Servertext in diesem Kundensatz. Übernommen wird nur,
// was wie ein konfigurierter Ortsname aussieht — kurz, aus Buchstaben, Ziffern, Leerzeichen und wenigen Satzzeichen.
// Alles andere (überlang, fremde Zeichen, Steuerzeichen) fällt auf den allgemeinen Gebietstext zurück.
const TERRITORY_MAX = 60;
const TERRITORY_RE = /^[\p{L}\p{N} .,'’()\/-]+$/u;
const gebietsname = (v) => {
  const t = text(v);
  return t && t.length <= TERRITORY_MAX && TERRITORY_RE.test(t) ? t : null;
};
// (B3): die Seite nur über eigene Schlüssel — kein Griff in die Prototypkette bei `field: "constructor"`.
const seiteVon = (field) => (typeof field === "string" && Object.hasOwn(SEITE, field) ? SEITE[field] : "Adresse");

/**
 * @param {object} body  der Antwortkörper des Servers ({ code, reason, field, territory, error })
 * @returns {string}     der Kundentext
 */
export function launchRouteBlockedText(body) {
  const d = body && typeof body === "object" ? body : {};
  const seite = seiteVon(d.field);
  const territory = gebietsname(d.territory);
  switch (d.reason) {
    case "special_territory":
      return territory
        ? `Die ${seite} liegt in einem Gebiet, das ConfidaraExpress derzeit nicht bedient: ${territory}. Bitte prüfen Sie Land und Postleitzahl.`
        : `Die ${seite} liegt in einem Gebiet, das ConfidaraExpress derzeit nicht bedient. Bitte prüfen Sie Land und Postleitzahl.`;
    case "country_not_supported":
      return `Das Land der ${seite} wird von ConfidaraExpress derzeit nicht bedient. Möglich sind Sendungen von Deutschland in die Mitgliedstaaten der Europäischen Union.`;
    case "origin_not_supported":
      return "Versand ist derzeit nur ab Deutschland möglich. Bitte prüfen Sie das Land der Absenderadresse.";
    case "missing_postal_code":
      return `Bitte geben Sie die Postleitzahl der ${seite} an. In diesem Land hängt die Verfügbarkeit vom Gebiet ab.`;
    case "invalid_postal_code":
      return `Bitte prüfen Sie die Postleitzahl der ${seite}.`;
    case "missing_country":
    case "invalid_country":
      return `Bitte wählen Sie das Land der ${seite} aus.`;
    default:
      return "Für diese Versandroute sind derzeit keine Angebote verfügbar. Bitte prüfen Sie Land und Postleitzahl von Absender und Empfänger.";
  }
}
