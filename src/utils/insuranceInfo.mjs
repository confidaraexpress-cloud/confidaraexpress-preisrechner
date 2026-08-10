// ── Informationen zur Transportversicherung: Inhaltsmodell ───────────────────
// Reines Datenmodul (framework-frei, testbar). Es trägt den vollständigen Text
// der Informationsseite an EINER Stelle, damit Inhalt und Darstellung getrennt
// bleiben und der Inhalt prüfbar ist.
//
// ══ SOURCE GOVERNANCE — verbindlich ═════════════════════════════════════════
// Versicherungscopy darf AUSSCHLIESSLICH aus einer dokumentierten, prüfbaren
// Quelle abgeleitet werden:
//
//   A. den tatsächlich vorliegenden Versicherungsbedingungen
//   B. nachweisbaren CE-eigenen Vertrags-/AGB-Inhalten
//   C. technisch belegten Produktdaten
//
// Ein Implementierungs-Prompt ist AUSDRÜCKLICH KEINE Quelle. Eine Aussage, die
// nur deshalb hier steht, weil sie in einem Auftrag als Beispiel vorkam, ist ein
// Fehler — genau so ist die erste Fassung dieser Seite entstanden und beim
// Review aufgefallen.
//
// ══ ZWEI VERSICHERUNGSPROFILE — NICHT MISCHEN ═══════════════════════════════
// Die vorliegenden Bedingungen unterscheiden mindestens eine deutsche und eine
// französische Konstellation mit teilweise abweichenden Warenklassifizierungen,
// Detailregeln und Schadenmeldefristen.
//
// Technische Prüfung (Stand dieses Commits): es ist NICHT belegbar, dass alle
// CE-Buchungen nach demselben Profil laufen. Belege:
//   • Das Versicherungsmodell kommt response-weit vom Upstream (`insurance` der
//     shipment-rates-Antwort) — es gibt keine CE-Konfiguration, keine
//     Umgebungsvariable und keine Accounteinstellung, die ein Profil festlegt.
//   • Das Modell verzweigt selbst nach Route: national / national_premium
//     gegenüber international / international_premium.
//   • Die Versichereridentität wird serverseitig aus dem Kundenpayload ENTFERNT
//     (toPublicTariffDetailFields) — das Frontend kann das Profil nicht kennen.
//
// Folge: diese Seite erklärt den GEMEINSAMEN INFORMATIONSKERN. Sie nennt keine
// profilspezifische Detailregel, keine Frist, keine Höchstsumme und keine
// Güterklassifizierung als allgemeingültig. Wer eine solche Regel ergänzen will,
// braucht zuerst den technischen Nachweis, welches Profil gilt.
//
// WHITE LABEL: siehe utils/insuranceTerms.mjs — dieselbe Regel gilt hier.

export const INSURANCE_INFO_ROUTE = "/versicherungsinformationen";

export const INSURANCE_INFO_PAGE = Object.freeze({
  eyebrow: "Transportversicherung",
  title: "Informationen zur Transportversicherung",
  lead:
    "Diese Seite fasst zusammen, wie die optionale Transportversicherung funktioniert, " +
    "welche Voraussetzungen und Grenzen gelten können und was im Schadenfall zu tun ist.",
  // Bewusst am Anfang UND am Ende: wer nur überfliegt, soll es trotzdem lesen.
  disclaimer:
    "Diese Seite dient der verständlichen Zusammenfassung der angebotenen Transportversicherung. " +
    "Maßgeblich sind die im jeweiligen Versicherungsfall geltenden Versicherungsbedingungen.",
});

// Quellenkennzeichnung, die die Seite sichtbar ausweist.
export const QUELLE_LABEL = Object.freeze({
  agb: "Belegt in unseren AGB",
  produkt: "Produkteigenschaft",
  bedingungen: "Nach den anwendbaren Versicherungsbedingungen",
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
      "Der Versicherungsschutz richtet sich nach den im jeweiligen Versicherungsfall anwendbaren Versicherungsbedingungen.",
    ]),
    quelle: "produkt",
  }),

  Object.freeze({
    id: "umfang",
    title: "Umfang und Grenzen des Versicherungsschutzes",
    lead:
      "Die Transportversicherung deckt Schäden am Transportgut nach Maßgabe der anwendbaren " +
      "Versicherungsbedingungen ab. Sie ist kein pauschaler Rundumschutz: Umfang, Voraussetzungen, " +
      "Grenzen und Ausschlüsse ergeben sich aus diesen Bedingungen.",
    items: Object.freeze([
      "Versichert wird das Transportgut — nicht entgangener Gewinn oder Folgeschäden.",
      "Voraussetzung ist eine zutreffende Angabe von Inhalt und Warenwert bei der Buchung.",
      "Der Versicherungswert kann vom Warenwert abweichen und wird im Buchungsprozess gesondert erfasst.",
    ]),
    quelle: "bedingungen",
  }),

  Object.freeze({
    id: "gueter-voraussetzungen",
    title: "Güter mit besonderen Voraussetzungen oder Ausschluss",
    // KEINE Güternamen: welche Kategorie ausgeschlossen ist und welche nur eine
    // Freigabe braucht, unterscheidet sich zwischen den Bedingungswerken. Eine
    // Liste hier wäre eine Vermischung — und genau der Fehler der ersten Fassung.
    lead:
      "Nicht jede Ware ist versicherbar. Bestimmte Güter können vom Versicherungsschutz " +
      "ausgeschlossen sein, andere benötigen vor Transportbeginn eine gesonderte Vereinbarung " +
      "oder Freigabe. Welche Kategorie für Ihre Ware gilt, richtet sich nach den anwendbaren " +
      "Versicherungsbedingungen.",
    items: Object.freeze([
      "Allgemeine Handelsgüter sind der Regelfall — eine pauschale Zusage, dass jede Ware versichert ist, gibt es nicht.",
      "Besonders gefährdete oder hochwertige Güter können eine vorherige Freigabe voraussetzen.",
      "Andere Güter können vollständig vom Versicherungsschutz ausgenommen sein.",
    ]),
    note:
      "Klären Sie die Versicherbarkeit vor der Buchung, wenn Ihre Ware in eine dieser Gruppen " +
      "fallen könnte. Eine fehlende Freigabe lässt sich nachträglich nicht heilen.",
    quelle: "bedingungen",
  }),

  Object.freeze({
    id: "versandausschluesse",
    // Bewusst ein EIGENER Abschnitt mit eigener Quelle: das sind
    // VERSANDverbote aus den CE-AGB, keine Versicherungsausschlüsse. Beides zu
    // vermengen wäre falsch — die Überschrift sagt das ausdrücklich.
    title: "Vom Versand ausgeschlossene Güter",
    lead:
      "Unabhängig von der Versicherung dürfen bestimmte Güter über ConfidaraExpress gar nicht " +
      "versandt werden. Diese Liste steht abschließend in unseren AGB; sie ist etwas anderes als " +
      "der Umfang des Versicherungsschutzes.",
    items: Object.freeze([
      "Gefahrgut im Sinne von ADR, IATA oder IMDG jeder Klasse sowie ADR-pflichtige Transporte.",
      "Explosivstoffe, Munition und Schusswaffen ohne behördliche Genehmigung.",
      "Lebende Tiere jeder Art.",
      "Bargeld, Münzen und Briefmarken als Sammelobjekte.",
      "Edelmetalle und Edelsteine ohne Sondervereinbarung mit dem Versanddienstleister.",
      "Gefälschte Waren, Betäubungsmittel und illegale Güter aller Art.",
    ]),
    note:
      "Die vollständige Aufzählung steht in § 8 unserer AGB. Mit jeder Buchung bestätigen Sie, " +
      "dass die Sendung keines dieser Güter enthält.",
    quelle: "agb",
  }),

  Object.freeze({
    id: "ausgeschlossene-risiken",
    title: "Ausgeschlossene Ursachen und Schäden",
    // Keine Aufzählung konkreter Ausschlussgründe: sie unterscheiden sich
    // zwischen den Bedingungswerken. Genannt wird nur, was in jedem Fall gilt.
    lead:
      "Auch bei versicherbaren Gütern ist nicht jeder Schaden gedeckt. Die anwendbaren " +
      "Versicherungsbedingungen nennen Ursachen und Schadenarten, für die kein " +
      "Versicherungsschutz besteht.",
    items: Object.freeze([
      "Ob ein konkreter Schaden gedeckt ist, entscheidet sich nach den anwendbaren Versicherungsbedingungen.",
      "Unzutreffende oder unvollständige Angaben bei der Buchung können den Versicherungsschutz gefährden.",
      "Ein nicht beanspruchungsgerecht verpacktes Gut kann vom Schutz ausgenommen sein.",
    ]),
    quelle: "bedingungen",
  }),

  Object.freeze({
    id: "hoechstgrenzen",
    title: "Versicherungssumme und Höchstgrenzen",
    // KEINE Zahl: die im deutschen Bedingungswerk genannte Grenze gilt für
    // bestimmte Gütergruppen ohne besondere Anfrage — sie ist keine allgemeine
    // Produktzusage und nicht für jedes Profil belegt.
    lead:
      "Je nach Güterart und anwendbaren Versicherungsbedingungen können Höchstversicherungssummen " +
      "und vorherige Freigaben gelten. Eine allgemein gültige Obergrenze für jede Sendung gibt es nicht.",
    items: Object.freeze([
      "Für bestimmte Gütergruppen ist eine Versicherung ohne besondere Anfrage nur bis zu einer Höchstsumme vorgesehen.",
      "Höhere Werte können eine gesonderte Anfrage vor dem Transport erfordern.",
      "Der im Buchungsprozess erfasste Versicherungswert ist zusätzlich technisch begrenzt.",
    ]),
    note:
      "Welche Höchstsumme im Einzelfall gilt, klären Sie bitte vor der Buchung — sie hängt von " +
      "der Güterart und dem anwendbaren Bedingungswerk ab.",
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
      "anwendbaren Versicherungsbedingungen.",
    items: Object.freeze([
      "Versicherungsschutz nach Maßgabe der anwendbaren Versicherungsbedingungen.",
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
      "Premium erweitert die Betreuung, nicht den Versicherungsumfang. Deckung und Ausschlüsse " +
      "sind dieselben wie bei der Standardversicherung.",
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
    id: "meldefrist",
    title: "Schadenmeldung: Fristen",
    // KEINE Zahl. Die Bedingungswerke nennen unterschiedliche Fristen, und
    // welches gilt, steht technisch nicht fest. Die Reklamationsfristen der
    // CE-AGB sind ETWAS ANDERES und werden hier ausdrücklich abgegrenzt statt
    // als Versicherungsfrist ausgegeben — das war der gravierendste Fehler der
    // ersten Fassung.
    lead:
      "Versicherungsschäden sind unverzüglich zu melden. Die konkret geltende Meldefrist richtet " +
      "sich nach den für den jeweiligen Versicherungsfall anwendbaren Versicherungsbedingungen. " +
      "Kontaktieren Sie ConfidaraExpress daher im Schadenfall so früh wie möglich.",
    items: Object.freeze([
      "Warten Sie nicht ab: eine späte Meldung kann den Anspruch kosten.",
      "Melden Sie auch dann, wenn Sie unsicher sind, ob ein Versicherungsfall vorliegt.",
    ]),
    note:
      "Davon zu unterscheiden sind die Reklamationsfristen gegenüber ConfidaraExpress aus dem " +
      "Beförderungsvertrag. Sie stehen in unseren AGB und sind nicht mit der versicherungs­" +
      "rechtlichen Meldefrist identisch.",
    quelle: "agb",
  }),

  Object.freeze({
    id: "verschollenheit",
    title: "Verlust und Verschollenheit",
    lead:
      "Bleibt eine Sendung dauerhaft aus, behandeln die anwendbaren Versicherungsbedingungen sie ab " +
      "einem dort definierten Zeitpunkt als verschollen. Ab wann das gilt, ergibt sich aus dem " +
      "jeweiligen Bedingungswerk.",
    items: Object.freeze([
      "Einen Totalverlust bitte ebenfalls unverzüglich melden.",
      "Der Zeitpunkt, ab dem eine Sendung als verschollen gilt, ergibt sich aus den anwendbaren Versicherungsbedingungen.",
    ]),
    quelle: "bedingungen",
  }),

  Object.freeze({
    id: "wichtige-hinweise",
    title: "Wichtige Hinweise",
    lead: "Drei Punkte, die im Alltag am häufigsten zu Missverständnissen führen:",
    items: Object.freeze([
      "Bestimmte Güter können vom Versicherungsschutz ausgeschlossen sein oder eine vorherige Freigabe erfordern.",
      "Der Versicherungsschutz unterliegt weiteren Voraussetzungen, Grenzen und Ausschlüssen, die sich aus den anwendbaren Versicherungsbedingungen ergeben.",
      "Ohne zusätzliche Transportversicherung gelten allein die Haftungs- und Beförderungsbedingungen des gewählten Versanddienstleisters.",
    ]),
    quelle: "bedingungen",
  }),
]);

// Inhaltsverzeichnis — aus den Abschnitten abgeleitet, damit es nie auseinanderläuft.
export function insuranceInfoToc() {
  return INSURANCE_INFO_SECTIONS.map(({ id, title }) => ({ id, title }));
}
