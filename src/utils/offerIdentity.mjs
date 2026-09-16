/* ── Die Identität EINES Angebots in der Oberfläche ──────────────────────────
   Die EINE Stelle, die beantwortet: „welches Angebot ist das?"

   Bis zur Multi-Provider-Anzeige war das die Tarif-ID des einen Lieferanten.
   Das trägt nicht mehr: die Namensräume zweier Einkaufsquellen überschneiden
   sich, und das Backend liefert deshalb je Angebot eine providerübergreifende
   `offerId`.

   ── Warum das mehr ist als ein anderer Feldname ──────────────────────────────
   Ein Angebot ohne `id` erzeugt in JEDEM Vergleich `undefined`. Und
   `undefined === undefined` ist `true`. Ohne diese Datei hieße das gemessen:

     • `selected?.id === t.id` → jede Karte ohne `id` gilt als AUSGEWÄHLT,
       auch wenn gar nichts ausgewählt ist;
     • `badges.get(t.id)` → alle Karten ohne `id` teilen sich EIN Badge;
     • `offer-details-${t.id}` → mehrere Knoten tragen dieselbe DOM-Kennung,
       und `aria-controls` zeigt bei allen auf denselben Bereich;
     • `key={t.id}` → React fällt auf den Index zurück und schiebt beim
       Sortieren den Aufklappzustand auf die jeweils nächste Karte.

   Keiner dieser vier Fälle wirft. Sie sehen alle aus wie „geht doch".

   ── Die Regel ───────────────────────────────────────────────────────────────
   `offerId` zuerst, die Tarif-ID nur als Rückfall — und nie etwas anderes.
   Der Rückfall ist bewusst: eine Antwort aus einem älteren Bundle trägt noch
   keine `offerId`, und die Auswahl soll dort weiter funktionieren.

   Gibt es KEINES von beidem, liefert diese Funktion `null` — und `null` ist
   ausdrücklich KEINE Identität: `sameOffer` vergleicht zwei `null` als
   VERSCHIEDEN. Genau das verhindert die Falschauswahl oben. */

export function offerKey(tariff) {
  const o = tariff && typeof tariff === "object" ? tariff : null;
  if (!o) return null;
  if (typeof o.offerId === "string" && o.offerId.trim() !== "") return o.offerId.trim();
  // Die Legacy-Tarif-ID kann Zahl ODER String sein ("s-3712" bei Shopvarianten).
  if (typeof o.id === "number" && Number.isFinite(o.id)) return `t:${o.id}`;
  if (typeof o.id === "string" && o.id.trim() !== "") return `t:${o.id.trim()}`;
  return null;
}

/** Sind das zwei Ansichten desselben Angebots? Ohne Identität: NEIN. */
export function sameOffer(a, b) {
  const ka = offerKey(a);
  return ka !== null && ka === offerKey(b);
}

/* ── Ist dieses Angebot auswählbar? ──────────────────────────────────────────
   Zwei Gründe, dieselbe Darstellung — und beide sind ausdrückliche Aussagen
   des Backends, nie eine Ableitung aus einem fehlenden Feld:

     bookable === false        das Angebot ist eine reine Preisauskunft
     availableForDate === false  am gewünschten Termin nicht verfügbar

   Ein FEHLENDES Feld sperrt nichts. Das ist die tragende Zeile: `undefined`
   heißt „dazu sagt das Backend nichts", nicht „nein". Wer hier auf
   `!t.bookable` prüft, sperrt jedes Angebot aus einer älteren Antwort. */
/* ─── DARSTELLUNG UND BUCHBARKEIT SIND ZWEI FRAGEN ──────────────────────────
   Lange beantwortete `offerBlocked` beide, und die Karte machte daraus einen
   einzigen Zustand: gesperrt hiess ausgegraut, Preis gedaempft und verkleinert,
   Carrierlogo in Graustufen, Timeline durch eine Hinweiszeile ersetzt.

   Das ist eine Verwechslung. Ein Angebot, das man gerade nicht bestellen kann,
   ist deswegen keine minderwertige Auskunft: Carrier, Service, Uebergabeart,
   Laufzeit und vor allem der PREIS sind vollstaendig real und genau das, wofuer
   der Kunde den Preisrechner geoeffnet hat. Sie blass zu zeichnen sagt ihm
   "diese Zahl gilt nicht so richtig" — und das stimmt nicht.

   Deshalb gibt es ab hier zwei Begriffe:

     offerBookable(t)   Darf der Kunde DIESES Angebot beauftragen? Steuert
                        ausschliesslich Folgeschritte: CTA, Kartenklick,
                        Paketshopsuche, Auszeichnungen.

     offerBlocked(t)    Unveraendert das Gegenteil davon — bleibt als Name
                        erhalten, weil mehrere Aufrufer ihn tragen. Er steuert
                        aber NICHT mehr die optische Wertigkeit der Karte.

   Wer eine neue Sperre einbaut, entscheidet damit ueber Aktionen. Ueber das
   Aussehen der Karte entscheidet er nicht. */

/** Darf dieses Angebot beauftragt werden? Die einzige Frage, die Aktionen steuert. */
export function offerBookable(tariff) {
  return !offerBlocked(tariff);
}

export function offerBlocked(tariff) {
  const t = tariff && typeof tariff === "object" ? tariff : {};
  return t.bookable === false || t.availableForDate === false;
}

/* ─── AUSWÄHLBAR, ABER NOCH NICHT BUCHBAR (TG22 Residential) ──────────────────
   Ein Angebot kann eine preisrelevante Angabe brauchen, die erst NACH der Auswahl erhoben
   wird: die Art der Lieferadresse. Der Server sagt das ausdrücklich — `bookable: false` mit
   dem Grund `price_inputs_required` und `deliveryIsResidential` in `requiredPriceInputs`.

   Ein solches Angebot ist AUSWÄHLBAR (Karte, Knopf, Weg zur Buchungsseite), aber nicht
   buchbar: gebucht wird erst nach der Bindung auf der Buchungsseite. Deshalb bleibt
   `offerBlocked`/`offerBookable` die Aussage über die Buchbarkeit (Auszeichnungen), und
   `offerSelectable` beantwortet die Aktionsfrage. Ein unbekannter Grund oder eine Angabe, die
   diese Oberfläche nicht erheben kann, macht nichts auswählbar — fail closed. */
export const PRICE_INPUT_DELIVERY_RESIDENTIAL = "deliveryIsResidential";
const PREISANGABE_AUSSTEHEND = "price_inputs_required";

/** Wartet dieses Angebot ausschließlich auf die Angabe zur Lieferadresse? */
export function offerAwaitsPriceInputs(tariff) {
  const t = tariff && typeof tariff === "object" ? tariff : {};
  return t.bookable === false && t.unavailableReason === PREISANGABE_AUSSTEHEND
    && t.availableForDate !== false
    && Array.isArray(t.requiredPriceInputs) && t.requiredPriceInputs.includes(PRICE_INPUT_DELIVERY_RESIDENTIAL);
}

/** Darf der Kunde dieses Angebot auswählen (Karte, Knopf, Buchungsseite)? */
export function offerSelectable(tariff) {
  return !offerBlocked(tariff) || offerAwaitsPriceInputs(tariff);
}

/* ── Warum nicht auswählbar? ─────────────────────────────────────────────────
   Der Backendgrund wird ÜBERSETZT, nie durchgereicht. Ein roher Code im
   sichtbaren Text wäre dieselbe Fehlerklasse wie ein roher Status — und die
   Übersetzung nennt den Einkaufsprovider nicht: dass ein Angebot heute nicht
   direkt buchbar ist, ist für den Kunden eine Eigenschaft des Angebots und
   keine Auskunft darüber, bei wem ConfidaraExpress einkauft.

   Unbekannter Grund → der neutrale Satz. Nie der Rohwert. */
// TG22 Paket B: `date_unavailable` sendet der Server, wenn der gewählte Abholtag der EINZIGE
// Grund ist — dann hilft ein anderer Abholtermin, und genau das sagt der Hinweis darunter.
// Nie „nächster Werktag": welcher Tag trägt, weiß nur eine neue Berechnung.
// TG22/TG23 Same-Day: drei Gründe sendet der Server, wenn eine Abholung HEUTE der einzige Grund ist — ein
// späterer Abholtag hilft in allen drei Fällen. „nicht mehr möglich" steht NUR beim zeitlichen Ablauf:
//   same_day_unavailable   der wirksame Abholschluss ist erreicht
//   same_day_unconfirmed   der Server kann die Abholung heute nicht bestätigen (kein Abholschluss)
//   same_day_unverifiable  die Angaben für die Abholung heute sind unbrauchbar
// Die Oberfläche entscheidet das nie selbst: sie vergleicht keine Uhrzeit und liest keinen Abholschluss.
export const OFFER_SAME_DAY_UNAVAILABLE_TEXT = "Abholung heute nicht mehr möglich.";
export const OFFER_SAME_DAY_UNCONFIRMED_TEXT = "Abholung heute für dieses Angebot nicht verfügbar.";
export const OFFER_SAME_DAY_UNVERIFIABLE_TEXT = "Abholung heute kann derzeit nicht bestätigt werden.";
export const OFFER_SAME_DAY_UNAVAILABLE_HINT = "Bitte wählen Sie einen späteren Abholtag.";
export const OFFER_SAME_DAY_REASONS = Object.freeze(["same_day_unavailable", "same_day_unconfirmed", "same_day_unverifiable"]);
const GRUND_TEXTE = {
  quote_only: "Derzeit nicht direkt buchbar",
  date_unavailable: "Für dieses Abholdatum nicht verfügbar.",
  same_day_unavailable: OFFER_SAME_DAY_UNAVAILABLE_TEXT,
  same_day_unconfirmed: OFFER_SAME_DAY_UNCONFIRMED_TEXT,
  same_day_unverifiable: OFFER_SAME_DAY_UNVERIFIABLE_TEXT,
};
// Die ältere Datumsaussage (`availableForDate === false`) bleibt wortgleich.
const DATUM_NICHT_VERFUEGBAR = "Nicht verfügbar für dieses Datum";
const GRUND_NEUTRAL = "Derzeit nicht buchbar";
export const OFFER_DATE_UNAVAILABLE_HINT = "Bitte wählen Sie einen anderen Abholtermin.";

export function offerBlockedLabel(tariff) {
  const t = tariff && typeof tariff === "object" ? tariff : {};
  if (offerSelectable(t)) return null;
  // Das Datum hat Vorrang: es ist die konkretere Aussage, und sie stand schon
  // vor der zweiten Einkaufsquelle so auf der Karte.
  if (t.availableForDate === false) return DATUM_NICHT_VERFUEGBAR;
  const text = GRUND_TEXTE[t.unavailableReason];
  return typeof text === "string" ? text : GRUND_NEUTRAL;
}

/** Handlungshinweis zum Sperrgrund — nur, wenn ein anderer Abholtermin tatsächlich hilft. */
export function offerBlockedHint(tariff) {
  const t = tariff && typeof tariff === "object" ? tariff : {};
  if (offerSelectable(t) || t.availableForDate === false) return null;
  if (OFFER_SAME_DAY_REASONS.includes(t.unavailableReason)) return OFFER_SAME_DAY_UNAVAILABLE_HINT;
  return t.unavailableReason === "date_unavailable" ? OFFER_DATE_UNAVAILABLE_HINT : null;
}

export { GRUND_NEUTRAL as OFFER_BLOCKED_FALLBACK };
