/* utils/priceChangeView.mjs — was eine Preisänderung dem Kunden anbieten darf.

   Reine Funktion: kein Netz, kein Zustand, kein React.

   ─── DAS PROBLEM, DAS DIESE DATEI LÖST ───────────────────────────────────────
   `/book` beantwortet eine Preisänderung mit `409` und dem Code `PRICE_CHANGED`.
   Der Körper dieser Antwort hat aber NICHT überall dieselbe Form:

     Form A   { code, message, oldPrice, newPrice }
     Form B   { error, code, price }
     Form C   { code, message }              — ganz ohne Beträge

   Die Buchungsseite las bis hierher pauschal `oldPrice`/`newPrice`. Bei Form B
   und C sind beide `undefined`, und die Anzeige lief durch `money()`:
   `Number(undefined) || 0` ist `0`. Der Kunde bekam damit einen Preisdialog, der
   ihm „0,00 €" als bisherigen UND als neuen Preis nannte — zwei erfundene
   Beträge in genau dem Dialog, der ihn um eine Preisbestätigung bittet.

   ─── DIE REGEL ───────────────────────────────────────────────────────────────
   Bestätigen lässt sich nur ein Preis, der TATSÄCHLICH in der Antwort steht.
   Beide Beträge müssen echte, endliche Zahlen sein — sonst gibt es nichts zu
   vergleichen und nichts zu bestätigen, und die einzige ehrliche Handlung ist
   eine neue Berechnung.

   ─── WARUM EIN EINZELNER BETRAG NICHT REICHT ─────────────────────────────────
   Ein alleinstehender `price` wird hier ausdrücklich NICHT zu `newPrice`
   umgedeutet. Das wäre nicht nur eine unvollständige Anzeige, sondern eine
   falsche Zusage: eine Bestätigung schickt dieselbe Angebotskennung erneut, und
   wo der Server den bestätigten Preis nicht aus dem Request, sondern aus dem
   gespeicherten Angebot liest, endet der zweite Versuch zwangsläufig wieder als
   Preisänderung. Der Kunde drückte einen Knopf, der nichts bewirken kann.

   Deshalb entscheidet hier die FORM DER ANTWORT, nicht die Herkunft des
   Angebots. Ein Feld aus dem Request (etwa ein mitgeschickter Anbietername)
   wäre für diese Entscheidung ohnehin die falsche Grundlage — es steht unter
   der Kontrolle des Clients und sagt nichts darüber, was der Server gerade
   geantwortet hat.

   ─── KEIN PROVIDERNAME ───────────────────────────────────────────────────────
   Für den Kunden ist das eine Preisänderung. Über wen ConfidaraExpress einkauft,
   steht hier nicht. */

export const PRICE_CHANGE_KIND = Object.freeze({
  /* Beide Beträge liegen vor: Vergleich anzeigen, Bestätigung anbieten. */
  CONFIRMABLE: "confirmable",
  /* Kein bestätigbares Paar: neutral hinweisen, neu berechnen lassen. */
  RECALCULATE: "recalculate",
  /* TG22 Residential: der Preis eines Angebots mit gebundener Lieferadresse hat sich geändert.
     Es gibt keine Übernahme — die Art der Lieferadresse wird neu geladen und neu bestätigt. */
  REBIND: "rebind",
});

/** Verlangt die Antwort, die Art der Lieferadresse neu zu bestätigen? */
export const istNeubindungNoetig = (body) =>
  !!body && typeof body === "object" && !Array.isArray(body) && body.priceInputsRebindRequired === true;

/* Eine echte, endliche Zahl. `null`, `undefined`, `NaN`, `""`, `[]` und `{}` sind
   KEINE Beträge — `Number("")` und `Number([])` sind beide `0`, und genau so
   entstünde der erfundene Nullbetrag wieder. Ein String mit einer Zahl darin wird
   bewusst nicht angenommen: die Antwort ist JSON, dort ist eine Zahl eine Zahl. */
const istBetrag = (w) => typeof w === "number" && Number.isFinite(w);

/**
 * Wie darf diese Preisänderung dargestellt werden?
 *
 * @param {object} body der bereits gelesene Antwortkörper (darf `null` sein)
 * @returns {{kind: string, oldPrice?: number, newPrice?: number}}
 */
export function priceChangeAnsicht(body) {
  const d = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  // TG22 Residential: eine verlangte Neubestätigung der Lieferadresse hat keinen Bestätigungsweg
  // über Beträge — die Antwort trägt bewusst keine.
  if (istNeubindungNoetig(d)) return { kind: PRICE_CHANGE_KIND.REBIND };
  // TG22 Golden Offer Contract: verlangt der Server ausdrücklich eine Neuberechnung, gibt es
  // keinen Bestätigungsweg — auch dann nicht, wenn Beträge mitreisen. Eine Bestätigung sendete
  // dasselbe Angebot erneut, und es scheiterte an derselben Stelle wieder.
  if (d.recalculationRequired === true) return { kind: PRICE_CHANGE_KIND.RECALCULATE };
  if (istBetrag(d.oldPrice) && istBetrag(d.newPrice)) {
    return { kind: PRICE_CHANGE_KIND.CONFIRMABLE, oldPrice: d.oldPrice, newPrice: d.newPrice };
  }
  return { kind: PRICE_CHANGE_KIND.RECALCULATE };
}

/** Darf diesem Zustand ein Bestätigungsknopf angeboten werden? */
export const preisIstBestaetigbar = (ansicht) =>
  !!ansicht && ansicht.kind === PRICE_CHANGE_KIND.CONFIRMABLE
  && istBetrag(ansicht.newPrice) && istBetrag(ansicht.oldPrice);

/* Die sichtbaren Texte. Sie stehen HIER und nicht im JSX — dieselbe Regel wie bei
   den Adressfragen. Der Titel ist in beiden Fällen derselbe: die Aussage „der
   Preis hat sich geändert" stimmt immer, nur das ANGEBOT darunter unterscheidet
   sich. */
export const PREISAENDERUNG_TITEL = "Preisänderung erkannt";

export const PREISAENDERUNG_TEXT = Object.freeze({
  [PRICE_CHANGE_KIND.CONFIRMABLE]:
    "Der Preis hat sich seit Ihrer Angebotsberechnung geändert.",
  /* Ohne Beträge wird ausdrücklich KEINE Zahl behauptet und KEINE Richtung
     genannt — weder „teurer" noch „günstiger". Die Antwort sagt nur, DASS sich
     etwas geändert hat. */
  [PRICE_CHANGE_KIND.RECALCULATE]:
    "Der Preis für dieses Angebot ist nicht mehr aktuell. "
    + "Bitte berechnen Sie die Angebote neu — Sie sehen dann den gültigen Preis und können erneut wählen. "
    + "Es wurde nichts gebucht und nichts berechnet.",
  [PRICE_CHANGE_KIND.REBIND]:
    "Der Preis für dieses Angebot hat sich geändert. Bitte wählen Sie die Art der Lieferadresse erneut.",
});

export const PREISAENDERUNG_NEU_BERECHNEN = "Angebote neu berechnen";
export const PREISAENDERUNG_FORTFAHREN = "Zum neuen Preis fortfahren";
export const PREISAENDERUNG_ANSEHEN = "Preisänderung ansehen";

/* ─── Die OFFENE Preisänderung ────────────────────────────────────────────────
   TG22 Golden Offer Contract: der Dialog ist nur die Anzeige der Entscheidung, nicht die
   Entscheidung selbst. Schließt der Kunde ihn (Escape, Hintergrund), gilt der alte Preis
   deshalb NICHT wieder — der Bestellknopf bleibt durch diesen Hinweis ersetzt, bis der neue
   Preis übernommen oder neu berechnet wurde. Den Dialog erneut öffnen kann nur, wer auch
   etwas zu bestätigen hat. */
export const PREISAENDERUNG_OFFEN_TEXT = Object.freeze({
  [PRICE_CHANGE_KIND.CONFIRMABLE]:
    "Der Preis hat sich geändert. Gebucht wird erst, wenn Sie den neuen Preis bestätigen — "
    + "oder Sie berechnen die Angebote neu. Es wurde nichts gebucht.",
  [PRICE_CHANGE_KIND.RECALCULATE]:
    "Der Preis für dieses Angebot ist nicht mehr aktuell. Bitte berechnen Sie die Angebote neu. "
    + "Es wurde nichts gebucht.",
  [PRICE_CHANGE_KIND.REBIND]:
    "Der Preis für dieses Angebot hat sich geändert. Bitte wählen Sie die Art der Lieferadresse erneut. "
    + "Es wurde nichts gebucht.",
});

/**
 * Der Hinweis zu einer offenen Preisänderung — oder `null`, wenn keine offen ist.
 *
 * @param   {object|null} ansicht  das Ergebnis von `priceChangeAnsicht` bzw. der versicherten Variante
 * @returns {{reviewable: boolean, text: string}|null}
 */
export function pendingPriceChangeNotice(ansicht) {
  if (!ansicht || typeof ansicht !== "object") return null;
  const bestaetigbar = preisIstBestaetigbar(ansicht);
  const art = bestaetigbar ? PRICE_CHANGE_KIND.CONFIRMABLE
    : (ansicht.kind === PRICE_CHANGE_KIND.REBIND ? PRICE_CHANGE_KIND.REBIND : PRICE_CHANGE_KIND.RECALCULATE);
  return Object.freeze({
    reviewable: bestaetigbar,
    text: PREISAENDERUNG_OFFEN_TEXT[art],
  });
}
