/* ── Statusfallback (Paket A, Phase 3) ───────────────────────────────────────
   Ein unbekannter Statuswert darf nicht als Rohwert im sichtbaren Text landen.
   Bis Phase 3 fielen neun Statusmapper auf genau das zurück: bei einem neuen
   oder umbenannten Backendwert stand plötzlich `label_ready`, `awaiting_pickup`
   oder `document_failed` in der Oberfläche — englisch, technisch und für
   Kundinnen und Kunden bedeutungslos.

   Regel ab jetzt:
     • sichtbarer Text: „Unbekannter Status"
     • fehlender Wert:  „—"
     • der Rohwert steht höchstens im title-Attribut, damit der Support beim
       Draufzeigen sieht, was der Server geliefert hat.

   Diese Datei ändert KEINEN Backendwert und keinen API-Vertrag — sie betrifft
   ausschließlich die Darstellung eines Werts, den kein Mapper kennt. */

export const UNBEKANNTER_STATUS = "Unbekannter Status";
export const STATUS_LEER = "—";

/** Rohwert eines Status als Zeichenkette, oder "" wenn nichts Brauchbares da ist. */
export function statusRohwert(status) {
  if (typeof status === "string") return status.trim();
  if (typeof status === "number" && Number.isFinite(status)) return String(status);
  return "";
}

/**
 * Fallback für einen Status, den kein Mapper kennt.
 * Rückgabe: [badgeKlasse, sichtbarerText, rohwertFuerTitle|null]
 * Die ersten beiden Felder sind formgleich mit allen bestehenden Mappern —
 * `const [cls, label] = …` funktioniert unverändert.
 */
export function statusFallback(status) {
  const roh = statusRohwert(status);
  if (!roh) return ["badge-gray", STATUS_LEER, null];
  return ["badge-gray", UNBEKANNTER_STATUS, roh];
}

/** Nur das title-Attribut — null, wenn es nichts zu zeigen gibt. */
export function statusTitle(status) {
  const roh = statusRohwert(status);
  return roh ? `Serverwert: ${roh}` : undefined;
}
