// ── Transportversicherung: Texte, Bedingungslinks, Carrier-Bedingungen ───────
// Reines Datenmodul (framework-frei, testbar). Es enthält KEINE Preis-, Reprice-
// oder Buchungslogik — Prämien kommen unverändert aus dem Tarif (JUMiNGO), die
// Auswahl aus dem Orchestrator.
//
// Warum die Texte hier und nicht in der Komponente stehen: sie sind fachliche
// Aussagen über ein Versicherungsprodukt. Sie werden an EINER Stelle gepflegt
// und an EINER Stelle getestet, statt in JSX verteilt.
import { httpUrlOrNull } from "./externalLink.mjs";

// Autoritative Produkt-URL der vollständigen Versicherungsbedingungen.
// Bewusst eine Produktkonstante und keine Umgebungsvariable: der Link ist
// öffentlich, stabil und für alle Umgebungen derselbe — eine env-Variable
// würde ihn nur schwerer auffindbar machen und könnte je Umgebung abweichen.
export const JUMINGO_INSURANCE_TERMS_URL =
  "https://www.jumingo.com/de-de/info/versicherungsbedingungen";

// Einheitliche Benennungen. Im gesamten Modul gilt genau EIN Wort je Sache —
// keine Parallelbegriffe wie „Versicherungskonditionen" oder „Haftungs-AGB".
export const INSURANCE_TEXT = Object.freeze({
  sectionTitle:  "Transportversicherung",
  sectionIntro:  "Wählen Sie optional eine zusätzliche Transportversicherung für Ihre Sendung.",
  detailsAction: "Versicherungsdetails",
  carrierTerms:  "Haftungs- & Beförderungsbedingungen öffnen",
  fullTerms:     "Vollständige Versicherungsbedingungen öffnen",
  // Gilt bei „Keine zusätzliche Transportversicherung" — und identisch als
  // Fallback, wenn der Tarif keinen Bedingungslink mitliefert. Es wird KEINE
  // Haftungssumme genannt: eine tarifabhängige, belegte Zahl gibt es nicht.
  carrierLiability:
    "Es gelten die Haftungs- und Beförderungsbedingungen des gewählten Versanddienstleisters.",
});

// Kartentexte. Bewusst OHNE absolute Zusagen: keine „100 %"-Aussage, keine
// Deckungssumme, keine Behauptung über besseren Schutz. Was zutrifft, steht in
// den Versicherungsbedingungen — und die sind verlinkt, nicht nacherzählt.
export const INSURANCE_CARD_COPY = Object.freeze({
  standard: Object.freeze({
    description: "Zusätzliche Transportversicherung nach Maßgabe der Versicherungsbedingungen",
    bullets: Object.freeze([
      { text: "50,00 € Selbstbeteiligung je Schadenfall", info: true },
      { text: "Reguläre Schadenbearbeitung" },
    ]),
    hasDetails: true,
  }),
  premium: Object.freeze({
    // „Erweiterter Service" statt „Erweiterter Schutz": Premium erweitert die
    // Betreuung, nicht den Versicherungsumfang. Der alte Text behauptete einen
    // besseren Versicherungsschutz, für den es keinen Beleg gibt.
    badge: "Erweiterter Service",
    description: "Gleiche zugrunde liegende Versicherungsbedingungen wie bei der Standardversicherung",
    bullets: Object.freeze([
      { text: "Keine Selbstbeteiligung für Sie" },
      { text: "Priorisierter Support" },
      { text: "Wöchentliche Status-Updates" },
    ]),
    hasDetails: true,
  }),
  none: Object.freeze({
    description: INSURANCE_TEXT.carrierLiability,
    bullets: Object.freeze([]),
    hasDetails: false,
    // Diese Karte trägt den Bedingungslink des GEWÄHLTEN TARIFS (siehe
    // carrierTermsHref) — nie die CE-eigenen AGB.
    hasCarrierTerms: true,
  }),
});

// Inhalt des Versicherungsdetails-Dialogs. Zusammenfassung, kein Volltext:
// die vollständigen Bedingungen bleiben an ihrer autoritativen Quelle, damit
// im Frontend keine zweite, alternde Fassung entsteht.
export const INSURANCE_DIALOG = Object.freeze({
  title: "Transportversicherung",
  // Keine Aussage über die regulatorische Rolle von ConfidaraExpress — die ist
  // nicht abschließend belegt. Genannt wird nur, was belegt ist: wessen
  // Bedingungen gelten und wo eingedeckt wird.
  intro:
    "Für die zusätzliche Transportversicherung gelten die Versicherungsbedingungen von JUMiNGO. " +
    "Nach den dort ausgewiesenen Bedingungen wird die Transportversicherung bei der " +
    "KRAVAG LOGISTIC Versicherung AG eingedeckt.",
  sections: Object.freeze([
    Object.freeze({
      id: "standard",
      title: "Standardversicherung",
      items: Object.freeze([
        "Versicherungsschutz nach Maßgabe der vollständigen Versicherungsbedingungen",
        "50,00 € Selbstbeteiligung je Schadenfall",
        "Reguläre Schadenbearbeitung",
      ]),
    }),
    Object.freeze({
      id: "premium",
      title: "Premiumversicherung",
      // Der erste Punkt sagt ausdrücklich, was Premium NICHT ist: eine andere
      // Versicherung. Es ist derselbe Schutz mit zusätzlichem Service.
      items: Object.freeze([
        "Gleiche zugrunde liegende Versicherungsbedingungen wie bei der Standardversicherung",
        "Die Selbstbeteiligung wird nach den JUMiNGO-Bedingungen übernommen",
        "Priorisierter Support",
        "Wöchentliche Status-Updates",
      ]),
    }),
  ]),
  notice:
    "Bestimmte Güter können vom Versicherungsschutz ausgeschlossen sein oder eine vorherige " +
    "Freigabe erfordern. Es gelten die vollständigen Versicherungsbedingungen.",
});

// Bedingungslink des KONKRETEN TARIFS. Quelle ist ausschließlich
// `tariff.carrierLinks.agb` (JUMiNGO `shipper.agb_link`) — bewusst KEIN Mapping
// über den Carriernamen: derselbe Carrier liefert für Pickup, Shop, Classic und
// Express unterschiedliche Bedingungen, und eine Namenstabelle würde genau
// diesen Unterschied einebnen.
//
// Ungültige, fehlende oder unsichere Werte ergeben null → die Oberfläche zeigt
// dann NUR den neutralen Hinweistext. Es wird nicht auf die CE-AGB
// zurückgefallen: das sind die Vertragsbedingungen von ConfidaraExpress, nicht
// die Beförderungsbedingungen des Versanddienstleisters.
export function carrierTermsHref(tariff) {
  const links = tariff && typeof tariff === "object" ? tariff.carrierLinks : null;
  if (!links || typeof links !== "object") return null;
  return httpUrlOrNull(links.agb);
}
