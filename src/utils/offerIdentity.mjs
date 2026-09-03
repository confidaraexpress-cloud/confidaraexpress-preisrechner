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
export function offerBlocked(tariff) {
  const t = tariff && typeof tariff === "object" ? tariff : {};
  return t.bookable === false || t.availableForDate === false;
}

/* ── Warum nicht auswählbar? ─────────────────────────────────────────────────
   Der Backendgrund wird ÜBERSETZT, nie durchgereicht. Ein roher Code im
   sichtbaren Text wäre dieselbe Fehlerklasse wie ein roher Status — und die
   Übersetzung nennt den Einkaufsprovider nicht: dass ein Angebot heute nicht
   direkt buchbar ist, ist für den Kunden eine Eigenschaft des Angebots und
   keine Auskunft darüber, bei wem ConfidaraExpress einkauft.

   Unbekannter Grund → der neutrale Satz. Nie der Rohwert. */
const GRUND_TEXTE = {
  quote_only: "Derzeit nicht direkt buchbar",
  date_unavailable: "Nicht verfügbar für dieses Datum",
};
const GRUND_NEUTRAL = "Derzeit nicht buchbar";

export function offerBlockedLabel(tariff) {
  const t = tariff && typeof tariff === "object" ? tariff : {};
  if (!offerBlocked(t)) return null;
  // Das Datum hat Vorrang: es ist die konkretere Aussage, und sie stand schon
  // vor der zweiten Einkaufsquelle so auf der Karte.
  if (t.availableForDate === false) return GRUND_TEXTE.date_unavailable;
  const text = GRUND_TEXTE[t.unavailableReason];
  return typeof text === "string" ? text : GRUND_NEUTRAL;
}

export { GRUND_NEUTRAL as OFFER_BLOCKED_FALLBACK };
