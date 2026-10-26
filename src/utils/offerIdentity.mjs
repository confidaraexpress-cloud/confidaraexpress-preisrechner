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

/** Darf der Kunde dieses Angebot auswählen (Karte, Knopf, Buchungsseite)?
 *
 * Gesamtauftrag B (2026-10-24): auch ein Angebot, das nur auf einen Firmennamen wartet
 * (`offerAwaitsBusinessDetails`), ist auswählbar. Die Seite führt dann zum Firmenfeld, statt die Karte zu
 * sperren; gebucht wird erst nach einem neuen Vergleich mit Firmenname (Server, `/book` unverändert).
 *
 * Betreiberentscheidung 2026-10-26 („nur buchbare Tarife sichtbar“): dasselbe gilt für die beiden übrigen
 * kundenlösbaren Angaben — eine zu lange Adressangabe und die fehlende Inhaltsangabe
 * (`offerAwaitsCustomerCorrection`). Der Server liefert ohnehin nur noch buchbare und kundenlösbare Angebote; eine
 * graue, gesperrte Karte gibt es damit nicht mehr. */
export function offerSelectable(tariff) {
  return !offerBlocked(tariff) || offerAwaitsPriceInputs(tariff) || offerAwaitsBusinessDetails(tariff)
    || offerAwaitsCustomerCorrection(tariff);
}

/* Die Stufe, in der ein Angebot gewählt wird — dieselbe Unterscheidung wie der Server (lib/offers/
   customerOfferVisibility.js): „Neue Sendung“ vergleicht MIT Sendungsangaben (strenge Auswahl, `offerSelectable`),
   der angemeldete Preisrechner VOR ihnen. Dort ist jedes Angebot auswählbar, das der Server „buchbar mit
   Sendungsangaben“ nennt (`availableWithShipmentDetails`): die Auswahl übergibt es nach „Neue Sendung“, wo der
   volle Vergleich Preis und Buchbarkeit bindet. Gebucht wird nie aus dem Preisrechner heraus. */
export const OFFER_SELECTION_STAGE = Object.freeze({
  WITH_SHIPMENT_DETAILS: "with_shipment_details",
  BEFORE_SHIPMENT_DETAILS: "before_shipment_details",
});

export function offerSelectableFor(tariff, stage = OFFER_SELECTION_STAGE.WITH_SHIPMENT_DETAILS) {
  const t = tariff && typeof tariff === "object" ? tariff : {};
  if (stage === OFFER_SELECTION_STAGE.BEFORE_SHIPMENT_DETAILS) {
    return t.availableForDate !== false && (offerSelectable(t) || t.availableWithShipmentDetails === true);
  }
  return offerSelectable(t);
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
// Manche Produkte werden nur an Unternehmen zugestellt. Der Server sendet dafür einen eigenen,
// kundenlösbaren Grund — das Angebot bleibt preislich sichtbar, ist aber nicht auswählbar,
// solange beim Empfänger kein Firmenname hinterlegt ist. Der Text nennt weder Carrier noch
// Einkaufsquelle noch eine ServiceID: warum ein Produkt Geschäftsempfänger verlangt, ist eine
// Eigenschaft des Angebots und keine Auskunft darüber, bei wem ConfidaraExpress einkauft.
export const OFFER_BUSINESS_RECIPIENT_REASON = "business_recipient_required";
export const OFFER_BUSINESS_RECIPIENT_TEXT = "Nur für Geschäftsempfänger verfügbar.";
export const OFFER_BUSINESS_RECIPIENT_HINT = "Bitte hinterlegen Sie beim Empfänger einen Firmennamen.";
// Für manche Angebote gelten kürzere Namens- und Adressangaben. Der Server prüft das und sendet dafür einen
// eigenen, kundenlösbaren Grund — sichtbar mit Preis, nicht auswählbar, bis die Angabe gekürzt ist. Die
// Oberfläche prüft nichts selbst: WELCHE Angabe welcher Partei und welche Grenze, sagt seit Paket A (2026-10-23)
// der Server in `unavailableDetail` ({ party, field, max }); ohne Einzelheit bleibt der allgemeine Hinweis.
export const OFFER_ADDRESS_DETAILS_TOO_LONG_REASON = "address_details_too_long";
export const OFFER_ADDRESS_DETAILS_TOO_LONG_TEXT = "Für diese Adressangaben nicht verfügbar.";
export const OFFER_ADDRESS_DETAILS_TOO_LONG_HINT = "Bitte kürzen Sie Vor- und Nachname, Firmenname oder Adresszeilen von Absender oder Empfänger.";
// Die Angaben des Adressvertrags in Kundenworten — providerneutral, ohne Anbieter, ohne Produktnamen.
const ADDRESS_DETAIL_FIELD_LABEL = Object.freeze({
  name: "Vor- und Nachname zusammen",
  forename: "Vorname",
  surname: "Nachname",
  company: "Firmenname",
  phone: "Telefonnummer (ohne Leerzeichen)",
  email: "E-Mail-Adresse",
  addressLine1: "Straße und Hausnummer",
  addressLine2: "Adresszusatz",
  postcode: "PLZ",
  city: "Ort",
});
const ADDRESS_DETAIL_PARTY_LABEL = Object.freeze({ sender: "des Absenders", recipient: "des Empfängers" });
/** Der genaue Handlungshinweis zu `address_details_too_long` — oder `null`, wenn der Server keine Einzelheit sendet. */
export function addressDetailsTooLongHint(detail) {
  const d = detail && typeof detail === "object" ? detail : null;
  if (!d) return null;
  const feld = ADDRESS_DETAIL_FIELD_LABEL[d.field];
  const partei = ADDRESS_DETAIL_PARTY_LABEL[d.party];
  if (!feld || !partei) return null;
  const grenze = Number.isInteger(d.max) && d.max > 0 ? ` (höchstens ${d.max} Zeichen)` : "";
  if (d.field === "phone") {
    return `Die Telefonnummer ${partei} ist für dieses Angebot zu lang${grenze}. Bitte kürzen Sie sie, etwa ohne Durchwahl oder Landesvorwahl.`;
  }
  return `${feld} ${partei}: für dieses Angebot zu lang${grenze}. Bitte kürzen Sie die Angabe.`;
}
// ─── Final Bookability Closure: vier weitere Gründe, die der Server seit P2-05/P2-08 sendet ───────
// Jeder ist eine Eigenschaft des Angebots für DIESE Sendung — ohne Anbieter, ohne Grenzwert, ohne Zahl:
//   business_sender_required      das Produkt verlangt einen Geschäftsabsender     → Firmenname beim Absender
//   content_description_required  das Produkt verlangt die Inhaltsangabe          → Inhalt angeben
//   package_dimensions_unverified die Grenzen des Produkts sind für diese Maße nicht sicher prüfbar
//                                 (etwa ein Gurtmaß ohne belegte Formel) — nicht buchbar, statt zu raten
//   area_surcharge_unconfirmed    für die Adresse fällt ein Gebietszuschlag an, dessen Höhe vor der
//                                 Buchung nicht bestätigt ist — nicht buchbar, statt ihn zu verschweigen
// Die beiden letzten hat der Kunde nicht in der Hand: sie bekommen KEINEN Handlungshinweis.
export const OFFER_BUSINESS_SENDER_REASON = "business_sender_required";
export const OFFER_BUSINESS_SENDER_TEXT = "Nur für Geschäftsabsender verfügbar.";
export const OFFER_BUSINESS_SENDER_HINT = "Bitte hinterlegen Sie beim Absender einen Firmennamen.";
// ─── Firmenpflicht: auswählbar, mit Hinweis und Bestätigung (Gesamtauftrag B, 2026-10-24) ─────────────
// Der Server sagt die Firmenpflicht auf zwei Wegen: als Produkteigenschaft (`senderRequirement`/
// `recipientRequirement` = "business", auch bei schon eingetragener Firma) und — solange der Firmenname fehlt —
// als kundenlösbarer Grund (`business_sender_required`/`business_recipient_required`). Die Karte zeigt dann
// „Angebot auswählen", die Anforderung und ein Bestätigungsfeld; die Bestätigung ersetzt nie den Firmennamen.
// Fehlt er, führt „Neue Sendung" zum Feld und setzt nach der Ergänzung mit genau einem neuen Vergleich fort.
// Die Texte nennen weder Carrier noch Einkaufsquelle — die Pflicht ist eine Eigenschaft des Angebots.
export const OFFER_BUSINESS_PARTY_TEXT = Object.freeze({
  recipient: "Nur für Geschäftsempfänger: Zugestellt wird ausschließlich an Unternehmen.",
  sender: "Nur für Geschäftsabsender: Versendet werden kann nur von einem Unternehmen.",
  both: "Nur zwischen Unternehmen: Absender und Empfänger müssen Unternehmen sein.",
});
export const OFFER_BUSINESS_CONFIRM_LABEL = Object.freeze({
  recipient: "Der Empfänger ist ein Unternehmen.",
  sender: "Der Absender ist ein Unternehmen.",
  both: "Absender und Empfänger sind Unternehmen.",
});
export const OFFER_BUSINESS_CONFIRM_ERROR = "Bitte bestätigen Sie diese Angabe, um das Angebot auszuwählen.";
// Die Meldung am Firmenfeld, wenn ein Angebot mit Firmenpflicht ohne Firmennamen gewählt wird.
export const OFFER_BUSINESS_COMPANY_FIELD_MESSAGE = Object.freeze({
  sender: "Für das gewählte Angebot ist beim Absender ein Firmenname erforderlich.",
  recipient: "Für das gewählte Angebot ist beim Empfänger ein Firmenname erforderlich.",
});
// Ehrlich, wenn das gewählte Angebot nach dem neuen Vergleich fehlt oder nicht mehr auswählbar ist.
export const OFFER_BUSINESS_NOT_FOUND_NOTICE =
  "Das gewählte Angebot ist mit den ergänzten Angaben nicht verfügbar. Bitte wählen Sie ein anderes Angebot.";

/** Welche Partei muss für dieses Angebot ein Unternehmen sein? `party`: "sender" | "recipient" | "both" | null. */
export function offerBusinessRequirement(tariff) {
  const t = tariff && typeof tariff === "object" ? tariff : {};
  const sender = t.senderRequirement === "business" || t.unavailableReason === OFFER_BUSINESS_SENDER_REASON;
  const recipient = t.recipientRequirement === "business" || t.unavailableReason === OFFER_BUSINESS_RECIPIENT_REASON;
  const party = sender && recipient ? "both" : sender ? "sender" : recipient ? "recipient" : null;
  return Object.freeze({ sender, recipient, party });
}

/** Wartet dieses Angebot ausschließlich auf einen Firmennamen (Absender oder Empfänger)? */
export function offerAwaitsBusinessDetails(tariff) {
  const t = tariff && typeof tariff === "object" ? tariff : {};
  return t.bookable === false && t.availableForDate !== false
    && (t.unavailableReason === OFFER_BUSINESS_SENDER_REASON || t.unavailableReason === OFFER_BUSINESS_RECIPIENT_REASON);
}

/** Die DOM-Kennung des Bestätigungsfelds einer Karte — Ziel des Fokus nach dem geführten Vergleich. */
export function offerBusinessConfirmId(tariff) {
  const k = offerKey(tariff);
  return k ? `offer-business-confirm-${k}` : null;
}

export const OFFER_CONTENT_DESCRIPTION_REASON = "content_description_required";
export const OFFER_CONTENT_DESCRIPTION_TEXT = "Nur mit Angabe des Inhalts buchbar.";
export const OFFER_CONTENT_DESCRIPTION_HINT = "Bitte geben Sie den Inhalt der Sendung an.";

// ─── Kundenlösbare Angaben: auswählbar statt grau (Betreiberentscheidung 2026-10-26) ─────────────────────
// Eine zu lange Adressangabe und die fehlende Inhaltsangabe behebt der Kunde im bestehenden Ablauf. Die Karte zeigt
// „Angebot auswählen“ und eine kurze Notiz; die Auswahl führt in „Neue Sendung“ zum betroffenen Feld (mit dem genauen
// Hinweis) und setzt nach der Korrektur mit genau einem neuen Vergleich fort — wie bei der Firmenpflicht. Gebucht wird
// erst, wenn der Server das Angebot danach buchbar nennt (`/book` unverändert).
export const OFFER_ADDRESS_CORRECTION_NOTE = "Nur mit gekürzter Adressangabe buchbar.";
// Die Felder des Adressvertrags (`unavailableDetail.field`) → das Formularfeld in „Neue Sendung“ (ohne Parteipräfix).
const ADRESSFELD_IM_FORMULAR = Object.freeze({
  name: "firstName", forename: "firstName", surname: "lastName", company: "company", phone: "phone",
  email: "email", addressLine1: "street", addressLine2: "addition", postcode: "zip", city: "city",
});

/** Wartet dieses Angebot ausschließlich auf eine Korrektur oder Ergänzung des Kunden (Adresse kürzen, Inhalt angeben)? */
export function offerAwaitsCustomerCorrection(tariff) {
  const t = tariff && typeof tariff === "object" ? tariff : {};
  return t.bookable === false && t.availableForDate !== false
    && (t.unavailableReason === OFFER_ADDRESS_DETAILS_TOO_LONG_REASON || t.unavailableReason === OFFER_CONTENT_DESCRIPTION_REASON);
}

/** Wohin führt die Auswahl eines solchen Angebots? `{ field, message, note }` — `field` ist das Formularfeld in
 *  „Neue Sendung“ (`null`, wenn der Server keine Einzelheit nennt), `message` der genaue Hinweis am Feld, `note` die
 *  kurze Notiz auf der Karte. Sonst `null`. */
export function offerCustomerCorrection(tariff) {
  const t = tariff && typeof tariff === "object" ? tariff : {};
  if (!offerAwaitsCustomerCorrection(t)) return null;
  if (t.unavailableReason === OFFER_CONTENT_DESCRIPTION_REASON) {
    return { field: "declaredContent", message: OFFER_CONTENT_DESCRIPTION_HINT, note: OFFER_CONTENT_DESCRIPTION_TEXT };
  }
  const d = t.unavailableDetail && typeof t.unavailableDetail === "object" ? t.unavailableDetail : null;
  const partei = d && d.party === "sender" ? "s" : d && d.party === "recipient" ? "r" : null;
  const feld = d ? ADRESSFELD_IM_FORMULAR[d.field] : undefined;
  return {
    field: partei && feld ? `${partei}_${feld}` : null,
    message: addressDetailsTooLongHint(d) || OFFER_ADDRESS_DETAILS_TOO_LONG_HINT,
    note: OFFER_ADDRESS_CORRECTION_NOTE,
  };
}
export const OFFER_DIMENSIONS_UNVERIFIED_TEXT = "Für diese Maße nicht bestätigt.";
export const OFFER_AREA_SURCHARGE_TEXT = "Gebietszuschlag nicht bestätigt.";
// Individuelle Mehrpaketsendungen (Canonical v2.79, §15): die beiden Gründe der Kuration — nie ein
// Anbietername, nie eine Stückgrenze als Anbieterregel. Dazu der Satz über der Angebotsliste und der
// Zusatz im Leerzustand, solange unterschiedliche Pakete gerechnet wurden. Der Knopf trägt nur den Grund;
// warum die Etiketten nicht zuzuordnen wären, steht als Hinweis im Detailbereich — so bleiben alle Karten
// einer Stufe gleich hoch (Betreiberentscheidung 2026-10-04).
export const OFFER_PACKAGE_COMBINATION_UNVERIFIED_REASON = "package_combination_unverified";
export const OFFER_PACKAGE_COMBINATION_UNVERIFIED_TEXT = "Für unterschiedliche Pakete derzeit nicht direkt buchbar.";
export const OFFER_PACKAGE_LABELS_INDISTINGUISHABLE_REASON = "package_labels_indistinguishable";
export const OFFER_PACKAGE_LABELS_INDISTINGUISHABLE_TEXT = "Für diese Paketkombination nicht direkt buchbar.";
export const OFFER_PACKAGE_LABELS_INDISTINGUISHABLE_HINT = "Die Versandlabels wären nicht eindeutig zuzuordnen.";
export const OFFERS_MIXED_PACKAGES_NOTE =
  "Für unterschiedliche Pakete werden nur Versandarten angezeigt, die alle Pakete befördern können.";
export const OFFERS_MIXED_PACKAGES_EMPTY_HINT = "Weniger oder gleich große Pakete erweitern die Auswahl.";
const GRUND_TEXTE = {
  quote_only: "Derzeit nicht direkt buchbar",
  date_unavailable: "Für dieses Abholdatum nicht verfügbar.",
  same_day_unavailable: OFFER_SAME_DAY_UNAVAILABLE_TEXT,
  same_day_unconfirmed: OFFER_SAME_DAY_UNCONFIRMED_TEXT,
  same_day_unverifiable: OFFER_SAME_DAY_UNVERIFIABLE_TEXT,
  [OFFER_BUSINESS_RECIPIENT_REASON]: OFFER_BUSINESS_RECIPIENT_TEXT,
  [OFFER_ADDRESS_DETAILS_TOO_LONG_REASON]: OFFER_ADDRESS_DETAILS_TOO_LONG_TEXT,
  [OFFER_BUSINESS_SENDER_REASON]: OFFER_BUSINESS_SENDER_TEXT,
  [OFFER_CONTENT_DESCRIPTION_REASON]: OFFER_CONTENT_DESCRIPTION_TEXT,
  package_dimensions_unverified: OFFER_DIMENSIONS_UNVERIFIED_TEXT,
  area_surcharge_unconfirmed: OFFER_AREA_SURCHARGE_TEXT,
  [OFFER_PACKAGE_COMBINATION_UNVERIFIED_REASON]: OFFER_PACKAGE_COMBINATION_UNVERIFIED_TEXT,
  [OFFER_PACKAGE_LABELS_INDISTINGUISHABLE_REASON]: OFFER_PACKAGE_LABELS_INDISTINGUISHABLE_TEXT,
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
  // Eine kundenlösbare Korrektur ist auswählbar — ihr genauer Hinweis steht trotzdem in den Details.
  if ((offerSelectable(t) && !offerAwaitsCustomerCorrection(t)) || t.availableForDate === false) return null;
  if (OFFER_SAME_DAY_REASONS.includes(t.unavailableReason)) return OFFER_SAME_DAY_UNAVAILABLE_HINT;
  // Die Hinweise, die keine Terminwahl betreffen: hier hilft eine Angabe an der Adresse oder zur Sendung.
  if (t.unavailableReason === OFFER_BUSINESS_RECIPIENT_REASON) return OFFER_BUSINESS_RECIPIENT_HINT;
  if (t.unavailableReason === OFFER_ADDRESS_DETAILS_TOO_LONG_REASON) {
    return addressDetailsTooLongHint(t.unavailableDetail) || OFFER_ADDRESS_DETAILS_TOO_LONG_HINT;
  }
  if (t.unavailableReason === OFFER_BUSINESS_SENDER_REASON) return OFFER_BUSINESS_SENDER_HINT;
  if (t.unavailableReason === OFFER_CONTENT_DESCRIPTION_REASON) return OFFER_CONTENT_DESCRIPTION_HINT;
  // Unterschiedliche Pakete: die Begründung zum Grund auf dem Knopf (siehe oben).
  if (t.unavailableReason === OFFER_PACKAGE_LABELS_INDISTINGUISHABLE_REASON) return OFFER_PACKAGE_LABELS_INDISTINGUISHABLE_HINT;
  return t.unavailableReason === "date_unavailable" ? OFFER_DATE_UNAVAILABLE_HINT : null;
}

export { GRUND_NEUTRAL as OFFER_BLOCKED_FALLBACK };
