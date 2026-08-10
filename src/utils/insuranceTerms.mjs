// ── Transportversicherung: Texte, Bedingungslinks, Carrier-Bedingungen ───────
// Reines Datenmodul (framework-frei, testbar). Es enthält KEINE Preis-, Reprice-
// oder Buchungslogik — Prämien kommen unverändert aus dem Tarif, die Auswahl aus
// dem Orchestrator.
//
// Warum die Texte hier und nicht in der Komponente stehen: sie sind fachliche
// Aussagen über ein Versicherungsprodukt. Sie werden an EINER Stelle gepflegt
// und an EINER Stelle getestet, statt in JSX verteilt.
//
// WHITE LABEL — verbindlich für diese Datei: ConfidaraExpress tritt gegenüber
// dem Kunden allein auf. Der interne Upstream-/Fulfillment-Anbieter, über den
// die Buchung technisch läuft, wird hier NICHT benannt — weder als Marke, noch
// als Bedingungsgeber, noch als Support-, Schaden- oder Kostenträger, noch als
// Link. Sichtbar sein dürfen ConfidaraExpress und der konkret gewählte
// Versanddienstleister (DPD, UPS, DHL Express, GLS …). Die technische
// Integration bleibt davon unberührt; sie lebt in der API-Schicht.
// `insuranceTerms.test.mjs` hält das fest.
import { httpUrlOrNull } from "./externalLink.mjs";

// Einheitliche Benennungen. Im gesamten Modul gilt genau EIN Wort je Sache —
// keine Parallelbegriffe wie „Versicherungskonditionen" oder „Haftungs-AGB".
export const INSURANCE_TEXT = Object.freeze({
  sectionTitle:  "Transportversicherung",
  sectionIntro:  "Wählen Sie optional eine zusätzliche Transportversicherung für Ihre Sendung.",
  detailsAction: "Versicherungsdetails",
  carrierTerms:  "Haftungs- & Beförderungsbedingungen öffnen",
  // Führt INTERN auf die ausführliche ConfidaraExpress-Informationsseite —
  // die dritte Ebene des Informationssystems (Karte → Dialog → Seite).
  moreInfo:      "Ausführliche Versicherungsinformationen",
  // Gilt bei „Keine zusätzliche Transportversicherung" — und identisch als
  // Fallback, wenn der Tarif keinen Bedingungslink mitliefert. Es wird KEINE
  // Haftungssumme genannt: eine tarifabhängige, belegte Zahl gibt es nicht.
  carrierLiability:
    "Es gelten die Haftungs- und Beförderungsbedingungen des gewählten Versanddienstleisters.",
});

// Kartentexte. Bewusst OHNE absolute Zusagen: keine „100 %"-Aussage, keine
// Deckungssumme, keine Behauptung über besseren Schutz. Was zutrifft, steht in
// den geltenden Versicherungsbedingungen — sie werden benannt, nicht nacherzählt.
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

// Inhalt des Versicherungsdetails-Dialogs: eine verständliche Produkt-
// zusammenfassung, kein Volltext.
//
// Es gibt bewusst KEINEN Link auf externe Vollbedingungen. Eine kundenfähige,
// autorisierte ConfidaraExpress-Fassung der vollständigen Versicherungs-
// bedingungen existiert im Produkt nicht; der einzige verfügbare Volltext
// gehört dem internen Upstream-Anbieter und wäre damit customer-facing
// sichtbar. Fremde Bedingungen zu spiegeln, eine eigene Fassung zu erfinden
// oder einen funktionslosen Knopf stehen zu lassen, sind alle drei keine
// Optionen — also steht hier nur die Zusammenfassung, bis eine freigegebene
// eigene Fassung vorliegt.
export const INSURANCE_DIALOG = Object.freeze({
  title: "Transportversicherung",
  // Keine Aussage darüber, wer Versicherer, Versicherungsnehmer, Vermittler
  // oder Makler ist, und keine Nennung einer Versicherungsgesellschaft: die
  // Bedingungen kennen unterschiedliche Konstellationen, und für keine davon
  // ist belegt, dass sie für JEDE ConfidaraExpress-Buchung gilt. Genannt wird
  // deshalb nur, was in jedem Fall zutrifft.
  intro:
    "Für Ihre Sendung kann optional eine zusätzliche Transportversicherung gewählt werden. " +
    "Der Versicherungsschutz richtet sich nach den jeweils geltenden Versicherungsbedingungen.",
  sections: Object.freeze([
    Object.freeze({
      id: "standard",
      title: "Standardversicherung",
      items: Object.freeze([
        "Versicherungsschutz nach Maßgabe der geltenden Versicherungsbedingungen",
        "50,00 € Selbstbeteiligung je Schadenfall",
        "Reguläre Schadenbearbeitung",
      ]),
    }),
    Object.freeze({
      id: "premium",
      title: "Premiumversicherung",
      // Der erste Punkt sagt ausdrücklich, was Premium NICHT ist: eine andere
      // Versicherung. Es ist derselbe Schutz mit zusätzlichem Service. Wer die
      // Selbstbeteiligung wirtschaftlich trägt, ist eine Innenbeziehung und
      // geht den Kunden nichts an — er erfährt nur, dass sie für ihn entfällt.
      items: Object.freeze([
        "Gleiche zugrunde liegende Versicherungsbedingungen wie bei der Standardversicherung",
        "Die Selbstbeteiligung entfällt für Sie",
        "Priorisierter Support",
        "Wöchentliche Status-Updates",
      ]),
    }),
  ]),
  // „Wichtige Hinweise" als eigener Block statt eines Einzelsatzes: die drei
  // Punkte sind die häufigsten Missverständnisse und tragen die mittlere
  // Informationsebene. Alles Weitere steht auf der Informationsseite.
  noticeTitle: "Wichtige Hinweise",
  notices: Object.freeze([
    "Bestimmte Güter können vom Versicherungsschutz ausgeschlossen sein.",
    "Bestimmte Güter können eine vorherige Freigabe benötigen.",
    "Der Versicherungsschutz unterliegt weiteren Voraussetzungen und Ausschlüssen.",
  ]),
});

// Bedingungslink des KONKRETEN TARIFS. Quelle ist ausschließlich
// `tariff.carrierLinks.agb` (Bedingungslink des Versanddienstleisters, wie ihn
// der Tarif liefert) — bewusst KEIN Mapping über den Carriernamen: derselbe
// Carrier liefert für Pickup, Shop, Classic und Express unterschiedliche
// Bedingungen, und eine Namenstabelle würde genau diesen Unterschied einebnen.
//
// Der Link führt zum Versanddienstleister, nicht zu einer Zwischenplattform —
// er ist damit ausdrücklich erwünscht und white-label-konform.
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
