/* utils/addressTypeQuestions.mjs — welche Adressfragen braucht DIESES Angebot?

   Reine Funktionen: kein Netz, kein Zustand, kein React.

   ─── WARUM ÜBERHAUPT GEFRAGT WIRD ────────────────────────────────────────────
   Manche Zustelldienste berechnen für Wohnadressen einen Zuschlag. Ob eine Adresse
   als Wohnadresse gilt, kann ConfidaraExpress nicht ausrechnen — es steht in keiner
   Datenquelle, die uns vorliegt. Ohne die Angabe steht der Preis nicht fest.

   ─── UND WARUM NICHT IMMER BEIDE ─────────────────────────────────────────────
   Die Zustelladresse ist immer relevant: dorthin wird geliefert.

   Die ABHOLadresse nur, wenn tatsächlich abgeholt wird. Bei einer Abgabe im
   Paketshop fährt niemand zur Absenderadresse — ein abholbezogener Zuschlag kann
   dort gar nicht entstehen. Die Frage wäre eine Pflichtangabe ohne jede Wirkung,
   und genau solche Fragen bringen Leute dazu, Formulare wegzuklicken.

   ─── WAS HIER NICHT GEFRAGT WIRD ─────────────────────────────────────────────
   Die Stapelbarkeit. Der Vertrag des Anbieters sagt, dass der Carrier sie im
   NACHHINEIN bewertet und einen Zuschlag dann nachberechnet — unabhängig davon,
   was wir vorher erklärt haben. Eine Kundenfrage würde das Risiko also nicht
   senken: ein „ja" schützt nicht vor der Nachbelastung, ein „nein" kauft den
   Zuschlag sofort ein. Sie bliebe eine Frage ohne erkennbaren Zweck.

   ─── DREIWERTIG, NICHT ZWEIWERTIG ────────────────────────────────────────────
   `true`, `false` und `null` sind drei verschiedene Zustände. Ein `false` heißt
   „Geschäftsadresse" und ist eine vollständige Antwort. Wer hier mit Truthiness
   arbeitet, macht daraus „noch nicht beantwortet" — und fragt den Kunden endlos
   nach etwas, das er längst gesagt hat.

   ─── KEIN PROVIDERNAME ───────────────────────────────────────────────────────
   Weder in den Feldnamen noch in den Texten. Der Kunde sieht den Carrier, nie den
   Einkaufsweg. Für ihn ist das schlicht eine Angabe zur Adresse. */

/* Die Übergabearten des öffentlichen Vertrags — dieselben Werte wie `serviceType`. */
const PICKUP = "pickup";
const DROPOFF = "dropoff";

/* Die Feldnamen. Bewusst beschreibend und providerneutral. */
export const FELD_ZUSTELLUNG = "deliveryIsResidential";
export const FELD_ABHOLUNG = "collectionIsResidential";

/* Ist das eine echte Antwort? `false` ist eine — `null`/`undefined` nicht. */
export const istBeantwortet = (w) => w === true || w === false;

/** Welche Fragen braucht dieses Angebot? Feldnamen, feste Reihenfolge. */
export function benoetigteAdressfragen(uebergabeart) {
  if (uebergabeart === PICKUP) return [FELD_ABHOLUNG, FELD_ZUSTELLUNG];
  if (uebergabeart === DROPOFF) return [FELD_ZUSTELLUNG];
  // Unbekannte Übergabeart: die Zustellfrage gilt immer, die Abholfrage wird NICHT
  // geraten. Lieber eine Frage zu wenig stellen als eine zu erfinden — der Server
  // prüft ohnehin und lehnt fail-closed ab, wenn ihm etwas fehlt.
  return [FELD_ZUSTELLUNG];
}

/** Welche der benötigten Angaben fehlen noch? */
export function fehlendeAdressangaben(werte, uebergabeart) {
  const w = werte && typeof werte === "object" ? werte : {};
  return benoetigteAdressfragen(uebergabeart).filter((f) => !istBeantwortet(w[f]));
}

/** Sind alle für dieses Angebot nötigen Angaben da? */
export const adressangabenVollstaendig = (werte, uebergabeart) =>
  fehlendeAdressangaben(werte, uebergabeart).length === 0;

/* Die sichtbaren Texte. Sie stehen HIER und nicht im JSX, damit sie geprüft werden
   können und nicht an zwei Stellen auseinanderlaufen. */
export const ADRESSFRAGE_TEXT = Object.freeze({
  [FELD_ZUSTELLUNG]: {
    label: "Die Lieferadresse ist eine Privatadresse",
    hint: "Privatadressen können bei manchen Versanddienstleistern einen Zuschlag auslösen.",
  },
  [FELD_ABHOLUNG]: {
    label: "Die Abholadresse ist eine Privatadresse",
    hint: "Gilt für die Adresse, an der das Paket abgeholt wird.",
  },
});

/** Der Hinweis unter einem gesperrten Weiter-Knopf — nennt, was fehlt. */
export function adressangabenHinweis(werte, uebergabeart) {
  const fehlt = fehlendeAdressangaben(werte, uebergabeart);
  if (fehlt.length === 0) return "";
  if (fehlt.length === 2) return "Bitte geben Sie an, ob Abhol- und Lieferadresse Privatadressen sind.";
  return fehlt[0] === FELD_ABHOLUNG
    ? "Bitte geben Sie an, ob die Abholadresse eine Privatadresse ist."
    : "Bitte geben Sie an, ob die Lieferadresse eine Privatadresse ist.";
}

/**
 * Baut den Teil des Buchungspayloads, der die Adressangaben trägt.
 *
 * Gesendet werden AUSSCHLIESSLICH die für dieses Angebot benötigten Felder. Eine
 * nicht benötigte Angabe wird bewusst verworfen statt mitgeschickt: sie hätte im
 * Request nichts zu suchen, und ein Server, der sie ignoriert, ist eine schlechtere
 * Garantie als ein Client, der sie gar nicht erst sendet.
 *
 * Fehlt eine benötigte Angabe, entsteht `null` — es gibt keinen Pfad, auf dem ein
 * unvollständiger Satz zu einem Request wird.
 */
export function adressangabenPayload(werte, uebergabeart) {
  if (!adressangabenVollstaendig(werte, uebergabeart)) return null;
  const aus = {};
  for (const f of benoetigteAdressfragen(uebergabeart)) aus[f] = werte[f];
  return aus;
}
