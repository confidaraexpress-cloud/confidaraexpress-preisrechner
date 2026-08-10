// ── Informationen zur Transportversicherung: Inhaltsmodell ───────────────────
// Reines Datenmodul (framework-frei, testbar). Es trägt den vollständigen Text
// der Informationsseite an EINER Stelle, damit Inhalt und Darstellung getrennt
// bleiben und der Inhalt prüfbar ist.
//
// ══ HERKUNFT JEDER AUSSAGE ══════════════════════════════════════════════════
// Diese Seite ist eine verständliche ZUSAMMENFASSUNG, kein Rechtstext und keine
// Kopie fremder Versicherungsbedingungen. Jede Aussage trägt deshalb ihre
// Quelle:
//
//   quelle: "agb"     → belegt in den ConfidaraExpress-AGB (im Produkt
//                       nachlesbar, verlinkt). Diese Aussagen sind verifiziert.
//   quelle: "produkt" → Produkteigenschaft, die im Buchungsprozess bereits
//                       ausgewiesen wird (Selbstbeteiligung, Leistungsumfang
//                       Standard/Premium).
//   quelle: "bedingungen" → richtet sich nach den jeweils geltenden
//                       Versicherungsbedingungen. Hier steht bewusst NUR eine
//                       vorsichtige, nicht abschließende Zusammenfassung
//                       („können insbesondere"), niemals eine Zusage.
//
// Was NICHT passiert: keine erfundene Deckungszusage, keine abschließende
// Aufzählung, keine Frist, die nicht aus einer benennbaren Quelle stammt, keine
// Nennung des internen Upstream-Anbieters und keine Aussage über die
// regulatorische Rolle von ConfidaraExpress.
//
// WHITE LABEL: siehe utils/insuranceTerms.mjs — dieselbe Regel gilt hier.

export const INSURANCE_INFO_ROUTE = "/versicherungsinformationen";

export const INSURANCE_INFO_PAGE = Object.freeze({
  eyebrow: "Transportversicherung",
  title: "Informationen zur Transportversicherung",
  lead:
    "Diese Seite fasst zusammen, was die optionale Transportversicherung leistet, " +
    "welche Güter besondere Voraussetzungen haben und was im Schadenfall zu tun ist.",
  // Bewusst am Anfang UND am Ende: wer nur überfliegt, soll es trotzdem lesen.
  disclaimer:
    "Diese Seite dient der verständlichen Zusammenfassung der angebotenen Transportversicherung. " +
    "Maßgeblich sind die im jeweiligen Versicherungsfall geltenden Versicherungsbedingungen.",
});

// Quellenkennzeichnung, die die Seite sichtbar ausweist.
export const QUELLE_LABEL = Object.freeze({
  agb: "Belegt in unseren AGB",
  produkt: "Produkteigenschaft",
  bedingungen: "Nach den geltenden Versicherungsbedingungen",
});

export const INSURANCE_INFO_SECTIONS = Object.freeze([
  Object.freeze({
    id: "ueberblick",
    title: "Überblick",
    lead:
      "Zu jeder Sendung kann optional eine zusätzliche Transportversicherung gewählt werden. " +
      "Sie tritt neben die gesetzliche Haftung des Versanddienstleisters und kann Schäden abdecken, " +
      "die über deren Grenzen hinausgehen.",
    items: Object.freeze([
      "Die Auswahl erfolgt im Buchungsprozess und ist freiwillig.",
      "Ohne Zusatzversicherung gelten allein die Haftungs- und Beförderungsbedingungen des gewählten Versanddienstleisters.",
      "Der Versicherungsschutz richtet sich nach den jeweils geltenden Versicherungsbedingungen.",
    ]),
    quelle: "produkt",
  }),

  Object.freeze({
    id: "umfang",
    title: "Umfang der Transportversicherung",
    lead:
      "Die Transportversicherung deckt Schäden am Transportgut nach Maßgabe der geltenden " +
      "Versicherungsbedingungen ab. Sie ist kein pauschaler Rundumschutz: Umfang, Voraussetzungen " +
      "und Ausschlüsse ergeben sich aus diesen Bedingungen.",
    items: Object.freeze([
      "Versichert wird das Transportgut, nicht der entgangene Gewinn oder Folgeschäden.",
      "Voraussetzung ist eine zutreffende Angabe von Inhalt und Warenwert bei der Buchung.",
      "Der Versicherungswert kann vom Warenwert abweichen und wird im Buchungsprozess gesondert erfasst.",
    ]),
    quelle: "bedingungen",
  }),

  Object.freeze({
    id: "versicherbare-gueter",
    title: "Versicherbare Güter",
    lead:
      "Allgemeine Handelsgüter können grundsätzlich versicherbar sein, soweit sie nicht in eine " +
      "ausgeschlossene oder besonders zu prüfende Kategorie fallen. Eine pauschale Zusage, dass " +
      "jede Ware versichert ist, gibt es nicht.",
    items: Object.freeze([
      "Handelsübliche, ordnungsgemäß verpackte Waren sind der Regelfall.",
      "Ob eine konkrete Ware versichert ist, richtet sich nach den geltenden Versicherungsbedingungen.",
      "Im Zweifel klären Sie die Versicherbarkeit vor der Buchung.",
    ]),
    quelle: "bedingungen",
  }),

  Object.freeze({
    id: "besondere-voraussetzungen",
    title: "Güter mit besonderen Voraussetzungen",
    lead:
      "Für bestimmte Güter können besondere Voraussetzungen gelten — etwa eine gesonderte Freigabe " +
      "vor Transportbeginn, eine Sondervereinbarung oder eine besondere Verpackung. Ohne diese " +
      "Voraussetzungen kann der Versicherungsschutz entfallen.",
    items: Object.freeze([
      "Kunstgegenstände und Antiquitäten ab einem Einzelwert von 1.000 EUR — nur mit gesonderter Versicherung und Freigabe des Versanddienstleisters.",
      "Edelmetalle und Edelsteine — nur mit Sondervereinbarung.",
      "Leicht verderbliche Lebensmittel — nur mit geeigneter Spezialverpackung und Sondergenehmigung für Kühlkettentransporte.",
      "Pflanzen in grenzüberschreitenden Sendungen — nur mit phytosanitärer Genehmigung.",
      "Unverpackte oder nicht beanspruchungsgerecht verpackte Güter.",
      "Umzugsgut und lebende Tiere.",
    ]),
    note:
      "Vor Transportbeginn kann eine gesonderte Freigabe erforderlich sein. Klären Sie das bitte " +
      "vor der Buchung — nachträglich lässt sich eine fehlende Freigabe nicht heilen.",
    quelle: "agb",
  }),

  Object.freeze({
    id: "nicht-versicherbare-gueter",
    title: "Nicht versicherbare Güter",
    lead:
      "Bestimmte Güter sind vom Versand oder vom Versicherungsschutz ausgeschlossen. Die folgende " +
      "Aufzählung ist eine Zusammenfassung und nicht abschließend — hierzu können insbesondere " +
      "folgende Güter gehören:",
    items: Object.freeze([
      "Bargeld, Münzen und Briefmarken als Sammelobjekte.",
      "Edelmetalle und Edelsteine ohne Sondervereinbarung.",
      "Wertpapiere und bestimmte Dokumente.",
      "Gefahrgut im Sinne von ADR, IATA oder IMDG jeder Klasse.",
      "Waffen, Munition und Explosivstoffe ohne behördliche Genehmigung.",
      "Betäubungsmittel, gefälschte Waren und illegale Güter aller Art.",
      "Menschliche Überreste, Organe oder Körperteile.",
    ]),
    note:
      "Welche Güter vom Versand ausgeschlossen sind, steht abschließend in unseren AGB. Der " +
      "Versicherungsschutz kann darüber hinaus weitere Güter ausnehmen.",
    quelle: "agb",
  }),

  Object.freeze({
    id: "ausgeschlossene-risiken",
    title: "Ausgeschlossene Risiken und Schäden",
    lead:
      "Auch bei versicherbaren Gütern ist nicht jeder Schaden gedeckt. Ausgeschlossen sein können " +
      "insbesondere Schäden aufgrund von:",
    items: Object.freeze([
      "Verzögerung der Beförderung.",
      "der natürlichen Beschaffenheit der Ware, etwa Verderb oder innerer Verderbnis.",
      "unzureichender oder nicht beanspruchungsgerechter Verpackung.",
      "Krieg, Bürgerkrieg, Unruhen oder terroristischen Ereignissen.",
      "behördlicher Beschlagnahme, Verfügung oder Einziehung.",
      "unrichtigen oder unvollständigen Angaben bei der Buchung.",
    ]),
    note:
      "Diese Aufzählung fasst typische Ausschlüsse zusammen und ist nicht abschließend. " +
      "Maßgeblich sind die geltenden Versicherungsbedingungen.",
    quelle: "bedingungen",
  }),

  Object.freeze({
    id: "hoechstgrenzen",
    title: "Versicherungssumme und Höchstgrenzen",
    lead:
      "Je nach Güterart und geltender Bedingung können Höchstversicherungssummen gelten. Für " +
      "bestimmte Gütergruppen ist eine Versicherung ohne besondere Anfrage nur bis zu bestimmten " +
      "Höchstgrenzen vorgesehen.",
    items: Object.freeze([
      "Für bestimmte Gütergruppen ist ohne besondere Anfrage eine Höchstversicherungssumme von 50.000 EUR je Transportmittel beziehungsweise je transportbedingter Zwischenlagerung vorgesehen.",
      "Höhere Werte oder abweichende Gütergruppen benötigen eine gesonderte Anfrage.",
      "Der im Buchungsprozess erfasste Versicherungswert ist zusätzlich technisch begrenzt.",
    ]),
    note:
      "Diese Grenze gilt nicht pauschal für jede Sendung. Welche Höchstsumme im Einzelfall gilt, " +
      "richtet sich nach Güterart und geltender Bedingung.",
    quelle: "bedingungen",
  }),

  Object.freeze({
    id: "selbstbeteiligung",
    title: "Selbstbeteiligung",
    lead:
      "Bei der Standardversicherung tragen Sie je Schadenfall einen festen Eigenanteil. Bei der " +
      "Premiumversicherung entfällt dieser Eigenanteil für Sie.",
    items: Object.freeze([
      "Standardversicherung: 50,00 € Selbstbeteiligung je Schadenfall.",
      "Premiumversicherung: keine Selbstbeteiligung für Sie.",
    ]),
    quelle: "produkt",
  }),

  Object.freeze({
    id: "standardversicherung",
    title: "Standardversicherung",
    lead:
      "Die Standardversicherung ist die reguläre Zusatzversicherung. Sie greift nach Maßgabe der " +
      "geltenden Versicherungsbedingungen.",
    items: Object.freeze([
      "Versicherungsschutz nach Maßgabe der geltenden Versicherungsbedingungen.",
      "50,00 € Selbstbeteiligung je Schadenfall.",
      "Reguläre Schadenbearbeitung.",
    ]),
    quelle: "produkt",
  }),

  Object.freeze({
    id: "premiumversicherung",
    title: "Premiumversicherung",
    lead:
      "Die Premiumversicherung ist eine Serviceerweiterung — kein anderer und kein weitergehender " +
      "Versicherungsschutz. Es gelten dieselben zugrunde liegenden Versicherungsbedingungen wie bei " +
      "der Standardversicherung.",
    items: Object.freeze([
      "Gleiche zugrunde liegende Versicherungsbedingungen wie bei der Standardversicherung.",
      "Keine Selbstbeteiligung für Sie.",
      "Priorisierter Support.",
      "Wöchentliche Status-Updates.",
    ]),
    note:
      "Premium erweitert die Betreuung, nicht den Versicherungsumfang. Deckungssumme und " +
      "Ausschlüsse sind dieselben wie bei der Standardversicherung.",
    quelle: "produkt",
  }),

  Object.freeze({
    id: "verpackung",
    title: "Verpackungs- und Mitwirkungspflichten",
    lead:
      "Eine beanspruchungsgerechte Verpackung ist Voraussetzung für den Versicherungsschutz. Ist die " +
      "Ware nicht ordnungsgemäß verpackt, kann der Schutz beeinträchtigt sein oder entfallen.",
    items: Object.freeze([
      "Verpacken Sie transportgerecht: ausreichend Polsterung, stabiler Außenkarton, gesicherter Inhalt.",
      "Kennzeichnen Sie empfindliche Sendungen sachgerecht.",
      "Geben Sie Inhalt, Gewicht und Maße zutreffend an — falsche Angaben gehen zu Ihren Lasten.",
    ]),
    quelle: "agb",
  }),

  Object.freeze({
    id: "schadenfall",
    title: "Was tun im Schadenfall?",
    lead:
      "Melden Sie einen Schaden so früh wie möglich und sichern Sie vorher die Nachweise. Beides " +
      "entscheidet häufig darüber, ob ein Anspruch durchsetzbar ist.",
    items: Object.freeze([
      "Äußerlich erkennbare Schäden sofort bei der Ablieferung anzeigen.",
      "Verpackung und Ware aufbewahren und nicht vorschnell entsorgen.",
      "Fotos von Außen- und Innenverpackung sowie vom beschädigten Inhalt anfertigen.",
      "Buchungsnummer, Sendungs-ID und Warenrechnung bereithalten.",
      "ConfidaraExpress über den Support kontaktieren und den Schaden melden.",
    ]),
    quelle: "agb",
  }),

  Object.freeze({
    id: "meldefristen",
    title: "Meldefristen",
    lead:
      "Schäden sind unverzüglich zu melden. Für die Reklamation gegenüber ConfidaraExpress gelten " +
      "die in unseren AGB genannten Fristen:",
    items: Object.freeze([
      "Äußerlich erkennbare Schäden: sofortige Anzeige bei Ablieferung, Anzeige gegenüber ConfidaraExpress spätestens innerhalb von 24 Stunden.",
      "Verdeckte Schäden: Anzeige spätestens innerhalb von 7 Werktagen nach Empfang der Sendung.",
      "Totalverlust: Anzeige spätestens 21 Tage nach dem vereinbarten Liefertermin.",
    ]),
    note:
      "Für den Versicherungsfall selbst sind zusätzlich die jeweils geltenden Fristen der " +
      "Versicherungsbedingungen maßgeblich. Melden Sie im Zweifel sofort.",
    quelle: "agb",
  }),

  Object.freeze({
    id: "verschollenheit",
    title: "Verlust und Verschollenheit",
    lead:
      "Bleibt eine Sendung dauerhaft aus, behandeln die Versicherungsbedingungen sie ab einem dort " +
      "definierten Zeitpunkt als verschollen. Ab wann das gilt, hängt von der jeweils geltenden " +
      "Bedingung und der Transportart ab.",
    items: Object.freeze([
      "Ein Totalverlust ist gegenüber ConfidaraExpress fristgerecht anzuzeigen.",
      "Der Zeitpunkt, ab dem eine Sendung als verschollen gilt, ergibt sich aus den geltenden Versicherungsbedingungen.",
    ]),
    quelle: "bedingungen",
  }),

  Object.freeze({
    id: "wichtige-hinweise",
    title: "Wichtige Hinweise",
    lead: "Drei Punkte, die im Alltag am häufigsten zu Missverständnissen führen:",
    items: Object.freeze([
      "Bestimmte Güter können vom Versicherungsschutz ausgeschlossen sein oder eine vorherige Freigabe erfordern.",
      "Der Versicherungsschutz unterliegt weiteren Voraussetzungen und Ausschlüssen, die sich aus den geltenden Versicherungsbedingungen ergeben.",
      "Ohne zusätzliche Transportversicherung gelten allein die Haftungs- und Beförderungsbedingungen des gewählten Versanddienstleisters.",
    ]),
    quelle: "bedingungen",
  }),
]);

// Inhaltsverzeichnis — aus den Abschnitten abgeleitet, damit es nie auseinanderläuft.
export function insuranceInfoToc() {
  return INSURANCE_INFO_SECTIONS.map(({ id, title }) => ({ id, title }));
}
