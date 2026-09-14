/* utils/shipmentDeclarations.mjs — die Sendungsangaben von „Neue Sendung".

   Reine Funktionen: kein Netz, kein Zustand, kein React.

   ─── WORUM ES GEHT ───────────────────────────────────────────────────────────
   Zwei Angaben beschreiben die Ware so, dass ein Versanddienst sie bepreisen kann:

     declaredContent          Inhalt der Sendung
     declaredGoodsValue       Warenwert in EUR

   Sie werden VOR dem Angebotsvergleich erhoben und serverseitig an der Sendung eingefroren.

   ─── TG22 RESIDENTIAL: DIE ADRESSART GEHÖRT NICHT MEHR HIERHER ───────────────
   Bis zu diesem Paket standen hier zusätzlich zwei Pflichtfragen zur Adressart (Abholung und
   Lieferung privat?). Sie sind entfallen: der Zuschlag einer privaten Lieferadresse betrifft
   nur einzelne Angebote und wird deshalb erst NACH der Angebotsauswahl gefragt — auf der
   Buchungsseite, nur für ein Angebot, das ihn trägt (utils/residentialPriceInputs.mjs). Eine
   Abholadressfrage gibt es nicht mehr.

   Ein älterer Entwurf oder Vorgang kann die beiden Werte noch mitbringen. Sie werden beim
   Zurücklesen still ignoriert — nie übernommen, nie gesendet, nie zum Fehler.

   ─── DIESE DATEI IST DER SPIEGEL DES SERVERS, NICHT SEINE ERSETZUNG ──────────
   Dieselben Grenzen und dieselbe Ablehnung erfundener Werte wie `lib/shipmentDeclarations.js`
   im Backend. Das Formular verhindert damit nur, dass der Kunde einen Knopf drückt, der
   garantiert 400 liefert — die Entscheidung fällt serverseitig.

   ─── KEIN PROVIDERNAME, KEIN ERSATZWERT ──────────────────────────────────────
   Für den Kunden sind das Angaben zu SEINER Sendung. Es gibt keinen Vorgabewert: kein
   „Paket", kein Warenwert 0. Ein Vorgabewert wäre eine Aussage über die Sendung, die niemand
   getroffen hat — und er wäre preiswirksam. */

/* Grenzen — identisch mit dem Server. Die Längengrenze des Inhaltstextes ist eine
   Eingabehärtung, keine Zusage an einen Dienstleister. */
export const DECLARED_CONTENT_MAX = 100;
export const DECLARED_GOODS_VALUE_MAX = 9999999;

/* Die Formularfelder. Die beiden Textfelder tragen das Präfix `declared`, damit sie mit dem
   gleichnamigen Buchungsseitenzustand (`form.content` des Bestellformulars) nicht verwechselt
   werden können — das ist ein ANDERER Wert mit einer anderen Aufgabe. */
export const DECLARATION_FIELDS = Object.freeze(["declaredContent", "declaredGoodsValue"]);

/** Der leere Ausgangszustand. Beide Felder sind kontrollierte Eingaben und deshalb `""`. */
export function blankDeclarations() {
  return {
    declaredContent: "",
    declaredGoodsValue: "",
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

/** Welche der beiden Angaben fehlen oder sind ungültig? */
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

  return e;
}

/** Sind beide gültig angegeben? */
export const declarationsComplete = (form) => Object.keys(declarationErrors(form)).length === 0;

/**
 * Der Block, der mit dem Preisvergleich gesendet wird: GENAU Inhalt und Warenwert.
 *
 * Es entsteht `null`, solange etwas fehlt — es gibt keinen Pfad, auf dem eine halbe
 * Deklaration zu einem Request wird. Gesendet wird der Warenwert als ZAHL (nicht als
 * Eingabetext) und der Inhalt getrimmt. Eine Adressart steht hier nie.
 */
export function declarationsPayload(form) {
  if (!declarationsComplete(form)) return null;
  const f = form;
  return {
    content: f.declaredContent.trim(),
    goodsValue: alsZahl(f.declaredGoodsValue),
  };
}

/**
 * Der Entwurfsschnappschuss — bewusst LOCKERER als der Vergleich.
 *
 * Ein Entwurf ist ein Zwischenstand und kein Vertrag: jede Angabe wird für sich
 * gespeichert, auch wenn die andere noch fehlt. Fehlende Werte stehen als `null`
 * (nicht als `""`), damit sie sich beim Zurücklesen von einer echten Angabe
 * unterscheiden lassen.
 */
export function declarationsSnapshot(form) {
  const f = form && typeof form === "object" ? form : {};
  const inhalt = typeof f.declaredContent === "string" ? f.declaredContent.trim() : "";
  return {
    content: inhalt === "" ? null : inhalt.slice(0, DECLARED_CONTENT_MAX),
    goodsValue: alsZahl(f.declaredGoodsValue),
  };
}

/**
 * Ein gespeicherter Schnappschuss → Formularfelder.
 *
 * Defensiv: ein Entwurf aus der Zeit vor diesen Feldern, ein beschädigter Wert oder ein
 * Wert aus einer anderen Fassung ergeben den leeren Ausgangszustand. Es wird nie ein Wert
 * erfunden. Eine mitgebrachte Adressart (älterer Entwurf) wird ignoriert.
 */
export function declarationsFromSnapshot(snapshot) {
  const s = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot : {};
  const aus = blankDeclarations();
  if (typeof s.content === "string" && s.content.trim() !== "")
    aus.declaredContent = s.content.trim().slice(0, DECLARED_CONTENT_MAX);
  const n = alsZahl(s.goodsValue);
  if (n !== null && n > 0 && n <= DECLARED_GOODS_VALUE_MAX) aus.declaredGoodsValue = String(n);
  return aus;
}

/** Der Warenwert als Zahl — für die Buchungsseite, die ihn anzeigt und weiterreicht. */
export const declaredGoodsValueNumber = (form) => alsZahl(form && form.declaredGoodsValue);

/* ── Die Namenskollision auf der Leitung ─────────────────────────────────────
   `declaredContent` (die Sendungsangabe) und `form.content` des Bestellformulars sind ZWEI
   Werte mit zwei Aufgaben. Im Buchungsrequest trugen sie bis hierher denselben Namen —
   `content`.

   Solange nur ein Weg diesen Namen las, war das folgenlos. Es lesen aber zwei: der eine nimmt
   ihn als Inhaltsbeschreibung entgegen, der andere vergleicht ihn gegen die eingefrorene
   Inhaltsangabe der Sendung und bricht bei Abweichung ab. Für ein Angebot der zweiten Art ist
   ein mitgeschicktes `form.content` damit keine Beschreibung mehr, sondern eine BEHAUPTUNG
   über die Deklaration — und zwar eine, die der Kunde nie aufgestellt hat.

   ─── DIE REGEL ──────────────────────────────────────────────────────────────
   Verlangt das Angebot preisrelevante Zusatzangaben, wird `content` NICHT mitgeschickt. Nicht
   „mit dem richtigen Wert", sondern GAR NICHT: die maßgebliche Angabe steht bereits
   eingefroren an der Sendung, und ein Clientwert kann dort nichts mehr entscheiden.

   Für jedes andere Angebot bleibt der Request unverändert. */
export function bookingContentPayload(formContent, requiredPriceInputs) {
  if (Array.isArray(requiredPriceInputs) && requiredPriceInputs.length > 0) return {};
  return { content: formContent };
}
