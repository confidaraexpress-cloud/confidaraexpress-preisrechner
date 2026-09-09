/* utils/shipmentDeclarations.mjs — die vier Sendungsangaben von „Neue Sendung".

   Reine Funktionen: kein Netz, kein Zustand, kein React.

   ─── WORUM ES GEHT ───────────────────────────────────────────────────────────
   Vier Angaben beschreiben eine Sendung so vollständig, dass ein Versanddienst sie
   abschließend bepreisen kann:

     declaredContent          Inhalt der Sendung
     declaredGoodsValue       Warenwert in EUR
     collectionIsResidential  Ist die Abholadresse eine Privatadresse?
     deliveryIsResidential    Ist die Lieferadresse eine Privatadresse?

   Sie werden VOR dem Angebotsvergleich erhoben. Vorher standen Inhalt und Warenwert
   erst auf der Buchungsseite und die Adressart erst unmittelbar vor der Bestellung —
   verglichen wurde also ohne sie und gebucht mit ihnen. Die Preisdifferenz daraus sah
   aus wie eine Preisänderung des Dienstleisters, war aber schlicht die Antwort auf eine
   andere Frage.

   ─── DIESE DATEI IST DER SPIEGEL DES SERVERS, NICHT SEINE ERSETZUNG ──────────
   Dieselben Grenzen, dieselbe Dreiwertigkeit, dieselbe Ablehnung erfundener Werte wie
   `lib/shipmentDeclarations.js` im Backend. Das Formular verhindert damit nur, dass der
   Kunde einen Knopf drückt, der garantiert 400 liefert — die Entscheidung fällt
   serverseitig, und sie fällt dort noch einmal vollständig.

   ─── KEIN PROVIDERNAME, KEIN ERSATZWERT ──────────────────────────────────────
   Für den Kunden sind das Angaben zu SEINER Sendung. Über wen ConfidaraExpress
   einkauft, steht hier nicht — nicht im Text, nicht im Feldnamen, nicht in einer
   Klasse. Und es gibt keinen Vorgabewert: kein „Paket", kein Warenwert 0, kein
   vorausgewähltes „Geschäftsadresse". Ein Vorgabewert wäre eine Aussage über die
   Sendung, die niemand getroffen hat — und er wäre preiswirksam.

   ─── DREIWERTIG ──────────────────────────────────────────────────────────────
   Bei der Adressart sind `true` (privat), `false` (geschäftlich) und `null`
   (unbeantwortet) DREI Zustände. `false` ist eine vollständige Antwort und darf nie als
   „fehlt" gelten; `null` darf nie zu `false` werden. Wer hier mit Truthiness arbeitet,
   erzeugt genau diese beiden Fehler. */

import { istBeantwortet, FELD_ZUSTELLUNG, FELD_ABHOLUNG } from "./addressTypeQuestions.mjs";

/* Grenzen — identisch mit dem Server. Die Längengrenze des Inhaltstextes ist eine
   Eingabehärtung, keine Zusage an einen Dienstleister. */
export const DECLARED_CONTENT_MAX = 100;
export const DECLARED_GOODS_VALUE_MAX = 9999999;

/* Die Formularfelder. Die beiden Adressartfelder heißen wie im Angebotsvertrag des
   Servers (`collectionIsResidential`/`deliveryIsResidential`), damit dieselbe
   Bedienoberfläche sie tragen kann; die beiden Textfelder tragen das Präfix
   `declared`, damit sie mit dem gleichnamigen Buchungsseitenzustand (`form.content`
   des Bestellformulars) nicht verwechselt werden können — das ist ein ANDERER Wert
   mit einer anderen Aufgabe. */
export const DECLARATION_FIELDS = Object.freeze([
  "declaredContent", "declaredGoodsValue", FELD_ABHOLUNG, FELD_ZUSTELLUNG,
]);

/** Der leere Ausgangszustand. Textfelder sind kontrollierte Eingaben und deshalb `""`;
 *  die Adressartfelder sind `null` — „noch nicht beantwortet". */
export function blankDeclarations() {
  return {
    declaredContent: "",
    declaredGoodsValue: "",
    [FELD_ABHOLUNG]: null,
    [FELD_ZUSTELLUNG]: null,
  };
}

/* Ein Wert gilt als angegeben, wenn er nicht fehlt und nicht leer ist. `Number("")` ist
   0 — eine Prüfung, die direkt parst, macht aus einem leeren Feld eine gültige Null. */
const angegeben = (roh) => roh !== undefined && roh !== null && String(roh).trim() !== "";

/* Erst Anwesenheit, dann parsen, dann Bereich — nie in einem Schritt. Das Dezimalkomma
   wird toleriert, weil deutsche Tastaturen es liefern; es ist eine Schreibweise
   derselben Zahl und kein anderer Wert. */
function alsZahl(roh) {
  if (!angegeben(roh)) return null;
  if (typeof roh === "number") return Number.isFinite(roh) ? roh : null;
  const t = String(roh).trim().replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Welche der vier Angaben fehlen oder sind ungültig? */
export function declarationErrors(form) {
  const f = form && typeof form === "object" ? form : {};
  const e = {};

  const inhalt = typeof f.declaredContent === "string" ? f.declaredContent.trim() : "";
  if (inhalt === "") e.declaredContent = "Bitte beschreiben Sie den Inhalt der Sendung.";
  else if (inhalt.length > DECLARED_CONTENT_MAX)
    e.declaredContent = `Der Inhalt darf maximal ${DECLARED_CONTENT_MAX} Zeichen enthalten.`;

  if (!angegeben(f.declaredGoodsValue)) e.declaredGoodsValue = "Bitte geben Sie den Warenwert an.";
  else {
    const n = alsZahl(f.declaredGoodsValue);
    if (n === null) e.declaredGoodsValue = "Bitte geben Sie einen gültigen Betrag ein.";
    else if (n <= 0) e.declaredGoodsValue = "Der Warenwert muss größer als 0 € sein.";
    else if (n > DECLARED_GOODS_VALUE_MAX)
      e.declaredGoodsValue = `Der Warenwert darf höchstens ${DECLARED_GOODS_VALUE_MAX} € betragen.`;
  }

  // Die beiden Adressfragen. Die Texte der Fehlermeldung stehen bei den Fragen selbst.
  if (!istBeantwortet(f[FELD_ABHOLUNG]))
    e[FELD_ABHOLUNG] = "Bitte geben Sie an, ob die Abholadresse eine Privatadresse ist.";
  if (!istBeantwortet(f[FELD_ZUSTELLUNG]))
    e[FELD_ZUSTELLUNG] = "Bitte geben Sie an, ob die Lieferadresse eine Privatadresse ist.";

  return e;
}

/** Sind alle vier beantwortet? */
export const declarationsComplete = (form) => Object.keys(declarationErrors(form)).length === 0;

/**
 * Der Block, der mit dem Preisvergleich gesendet wird.
 *
 * Es entsteht `null`, solange etwas fehlt — es gibt keinen Pfad, auf dem eine halbe
 * Deklaration zu einem Request wird. Der Server lehnt einen unvollständigen Block
 * ohnehin ab; ein Client, der ihn gar nicht erst baut, spart dem Kunden die Fehlermeldung.
 *
 * Gesendet wird der Warenwert als ZAHL (nicht als Eingabetext) und der Inhalt getrimmt.
 */
export function declarationsPayload(form) {
  if (!declarationsComplete(form)) return null;
  const f = form;
  return {
    content: f.declaredContent.trim(),
    goodsValue: alsZahl(f.declaredGoodsValue),
    [FELD_ABHOLUNG]: f[FELD_ABHOLUNG],
    [FELD_ZUSTELLUNG]: f[FELD_ZUSTELLUNG],
  };
}

/**
 * Der Entwurfsschnappschuss — bewusst LOCKERER als der Vergleich.
 *
 * Ein Entwurf ist ein Zwischenstand und kein Vertrag: jede Angabe wird für sich
 * gespeichert, auch wenn die anderen drei noch fehlen. Fehlende Werte stehen als `null`
 * (nicht als `""`), damit sie sich beim Zurücklesen von einer echten Angabe
 * unterscheiden lassen.
 */
export function declarationsSnapshot(form) {
  const f = form && typeof form === "object" ? form : {};
  const inhalt = typeof f.declaredContent === "string" ? f.declaredContent.trim() : "";
  return {
    content: inhalt === "" ? null : inhalt.slice(0, DECLARED_CONTENT_MAX),
    goodsValue: alsZahl(f.declaredGoodsValue),
    [FELD_ABHOLUNG]: istBeantwortet(f[FELD_ABHOLUNG]) ? f[FELD_ABHOLUNG] : null,
    [FELD_ZUSTELLUNG]: istBeantwortet(f[FELD_ZUSTELLUNG]) ? f[FELD_ZUSTELLUNG] : null,
  };
}

/**
 * Ein gespeicherter Schnappschuss → Formularfelder.
 *
 * Defensiv: ein Entwurf aus der Zeit vor diesen Feldern, ein beschädigter Wert oder ein
 * Wert aus einer neueren Serverfassung ergeben den leeren Ausgangszustand. Es wird nie
 * ein Wert erfunden, und eine unbeantwortete Adressart bleibt unbeantwortet.
 */
export function declarationsFromSnapshot(snapshot) {
  const s = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot : {};
  const aus = blankDeclarations();
  if (typeof s.content === "string" && s.content.trim() !== "")
    aus.declaredContent = s.content.trim().slice(0, DECLARED_CONTENT_MAX);
  const n = alsZahl(s.goodsValue);
  if (n !== null && n > 0 && n <= DECLARED_GOODS_VALUE_MAX) aus.declaredGoodsValue = String(n);
  for (const feld of [FELD_ABHOLUNG, FELD_ZUSTELLUNG])
    if (istBeantwortet(s[feld])) aus[feld] = s[feld];
  return aus;
}

/** Der Warenwert als Zahl — für die Buchungsseite, die ihn anzeigt und weiterreicht. */
export const declaredGoodsValueNumber = (form) => alsZahl(form && form.declaredGoodsValue);

/* ── Die Namenskollision auf der Leitung ─────────────────────────────────────
   Oben steht es bereits: `declaredContent` (diese vier Angaben) und `form.content`
   des Bestellformulars sind ZWEI Werte mit zwei Aufgaben. Im Buchungsrequest
   trugen sie bis hierher denselben Namen — `content`.

   Solange nur ein Weg diesen Namen las, war das folgenlos. Es lesen aber zwei:
   der eine nimmt ihn als Inhaltsbeschreibung entgegen, der andere vergleicht ihn
   gegen die eingefrorene Inhaltsangabe der Sendung und bricht bei Abweichung ab.
   Für ein Angebot der zweiten Art ist ein mitgeschicktes `form.content` damit
   keine Beschreibung mehr, sondern eine BEHAUPTUNG über die Deklaration — und
   zwar eine, die der Kunde nie aufgestellt hat: das sichtbare Eingabefeld dafür
   gibt es auf der Buchungsseite nicht mehr, der Wert stammt aus einem anderen
   Zusammenhang.

   Heute fällt das nicht auf, weil der Wert dort im Regelfall leer ist und ein
   leerer Wert als „nichts behauptet" gilt. Ein fortgesetzter Vorgang aus einem
   älteren Bundle kann ihn aber gefüllt mitbringen — dann bricht die Buchung mit
   einer Begründung ab, die auf ein Feld zeigt, das der Kunde nirgends sieht.

   ─── DIE REGEL ──────────────────────────────────────────────────────────────
   Verlangt das Angebot die vorab erhobenen Angaben, wird `content` NICHT
   mitgeschickt. Nicht „mit dem richtigen Wert", sondern GAR NICHT: die
   maßgebliche Angabe steht bereits eingefroren an der Sendung, und ein
   Clientwert kann dort nichts mehr entscheiden. Ihn aus `declaredContent`
   nachzubilden wäre eine zweite Quelle für dieselbe Aussage — und die erste
   Abweichung zwischen beiden wäre wieder ein Abbruch ohne sichtbaren Grund.

   Für jedes andere Angebot bleibt der Request unverändert. */
export function bookingContentPayload(formContent, requiredPriceInputs) {
  if (Array.isArray(requiredPriceInputs) && requiredPriceInputs.length > 0) return {};
  return { content: formContent };
}
