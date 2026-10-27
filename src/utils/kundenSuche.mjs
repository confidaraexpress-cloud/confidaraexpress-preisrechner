// Kopfsuche des Kundenbereichs (Premium-Redesign, Vorschau-Parität mit Konzept A und B, Betreiberentscheidung
// 2026-10-27): Sendungen, Rechnungen und Adressen des eigenen Kontos. Reine Logik — Laden in
// hooks/useKundenSuche.js, Anzeige in components/layout/KundenSuche.jsx.
//
// Durchsucht wird, was die bestehenden Listen-Endpunkte liefern: Sendungen und Rechnungen seitenweise bis zu einer
// festen Obergrenze (die Suche sagt, wenn sie nicht alles gesehen hat), Adressen über die Suche des Adressbuchs.
// Keine Schnittstelle kommt hinzu, nichts wird gespeichert.
import { customerShipmentNumbers, invoiceNumberOf, NO_ORDER_CONFIRMATION_TEXT } from "./businessNumbers.mjs";
import { trackingReferencesOf } from "./trackingReferencesView.mjs";
import { ROLE_RECIPIENT, TAB_RECIPIENT, TAB_SENDER } from "./addressRoles.mjs";

/** Ab dieser Länge sucht das Feld. */
export const SUCHE_MIN_ZEICHEN = 2;

/** Höchstens so viele Treffer je Art; zusammen höchstens acht. */
export const SUCHE_TREFFER_JE_ART = Object.freeze({ sendung: 4, rechnung: 2, adresse: 2 });

/** Seiten zu je 100 Einträgen, die je Liste höchstens geladen werden. */
export const SUCHE_SEITEN_HOECHSTENS = 10;

export const SUCHE_TEXTE = Object.freeze({
  label: "Sendungen, Rechnungen und Adressen suchen",
  platzhalter: "Suchen",
  laedt: "Suche wird vorbereitet …",
  fehler: "Die Suche ist gerade nicht verfügbar. Bitte versuchen Sie es erneut.",
  keine: (begriff) => `Keine Treffer für „${begriff}“`,
  unvollstaendig: "Durchsucht wurden Ihre neuesten Sendungen und Rechnungen — ältere finden Sie in den Listen.",
  arten: Object.freeze({ sendung: "Sendung", rechnung: "Rechnung", adresse: "Adresse" }),
});

// Diakritika entfernen, ohne \u-Escapes im Quelltext (kombinierende Zeichen U+0300 bis U+036F).
const DIAKRITIKA = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");

/** Vergleichsform: klein, ohne Akzente, Leerraum zusammengefasst. */
export function suchForm(wert) {
  return String(wert ?? "").normalize("NFKD").replace(DIAKRITIKA, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Der Suchbegriff in Vergleichsform — leer, solange er kürzer als SUCHE_MIN_ZEICHEN ist. */
export function suchbegriff(roh) {
  const b = suchForm(roh);
  return b.length >= SUCHE_MIN_ZEICHEN ? b : "";
}

const enthaelt = (felder, begriff) => felder.some((f) => suchForm(f).includes(begriff));
const text = (...teile) => teile.filter((t) => typeof t === "string" && t.trim() !== "").join(", ");
const vollerName = (a) => [a.firstName, a.lastName].filter((t) => typeof t === "string" && t.trim() !== "").join(" ") || a.contactName || "";

function empfaengerVon(s) {
  const r = s && (s.recipient_address || s.recipientAddress);
  return r && typeof r === "object" ? r : null;
}

/** Sendungen: Auftragsbestätigung, Trackingnummern, eigene Referenz, Empfänger (Firma, Name, Ort, PLZ). */
export function sucheSendungen(liste, begriff) {
  if (!begriff || !Array.isArray(liste)) return [];
  const treffer = [];
  for (const s of liste) {
    if (!s || s.id == null) continue;
    const nummern = customerShipmentNumbers(s);
    const r = empfaengerVon(s) || {};
    const felder = [
      nummern.orderConfirmationNumber, nummern.customerReference, ...trackingReferencesOf(s), nummern.trackingNumber,
      r.company, r.fullName, r.name, r.city, r.postalCode,
    ];
    if (!enthaelt(felder, begriff)) continue;
    treffer.push({
      art: "sendung", id: s.id,
      titel: nummern.orderConfirmationNumber || NO_ORDER_CONFIRMATION_TEXT,
      text: text(r.company || r.fullName || r.name, r.city) || nummern.trackingNumber || "",
      objekt: s,
    });
  }
  return treffer;
}

/** Rechnungen und Testbelege: Belegnummer. */
export function sucheRechnungen(liste, begriff) {
  if (!begriff || !Array.isArray(liste)) return [];
  const treffer = [];
  for (const r of liste) {
    if (!r || r.id == null) continue;
    const nummer = invoiceNumberOf(r);
    if (!nummer || !enthaelt([nummer], begriff)) continue;
    treffer.push({ art: "rechnung", id: r.id, titel: nummer, betrag: r.gross_amount ?? null, objekt: r });
  }
  return treffer;
}

/** Adressen: die Treffer der Adressbuchsuche (der Server hat bereits gefiltert). */
export function adressTreffer(liste) {
  if (!Array.isArray(liste)) return [];
  return liste.filter((a) => a && a.id != null).map((a) => {
    const name = vollerName(a);
    return {
      art: "adresse", id: a.id,
      titel: a.company || name || a.label || "",
      text: text(a.company ? name : "", a.city),
      objekt: a,
    };
  });
}

/** Alle Treffer in fester Reihenfolge (Sendungen, Rechnungen, Adressen), je Art begrenzt. */
export function suchTreffer({ sendungen = [], rechnungen = [], adressen = [] } = {}) {
  return [
    ...sendungen.slice(0, SUCHE_TREFFER_JE_ART.sendung),
    ...rechnungen.slice(0, SUCHE_TREFFER_JE_ART.rechnung),
    ...adressen.slice(0, SUCHE_TREFFER_JE_ART.adresse),
  ];
}

/** Wohin ein Treffer führt: der Bereich des Kundenbereichs, der ihn zeigt. */
export function suchZiel(treffer) {
  if (!treffer) return null;
  if (treffer.art === "sendung") return "shipments";
  if (treffer.art === "rechnung") return "invoices";
  if (treffer.art === "adresse") return "addressbook";
  return null;
}

/** Was in den Verlaufszustand geht: nur Art, Kennung und das Listenobjekt (kein abgeleiteter Text). */
export function suchFokus(treffer) {
  if (!treffer || !suchZiel(treffer)) return null;
  return { art: treffer.art, id: treffer.id, objekt: treffer.objekt ?? null };
}

// Übergabe eines Treffers an eine andere Route (Rechner, Buchung, Lagerdetails → Dashboard): in den Router-State —
// und damit in den Verlauf des Browsers — kommen nur Art und Kennung. Das Listenobjekt (mit Empfängeranschrift)
// bleibt im Arbeitsspeicher und wird beim Übernehmen verbraucht; ein späteres Zurück findet nichts mehr vor.
let uebergabe = null;

/** Hinterlegt den Treffer und liefert den Verweis für den Router-State. */
export function sucheUebergeben(fokus) {
  uebergabe = fokus && fokus.objekt != null ? fokus : null;
  return fokus ? { art: fokus.art, id: fokus.id } : null;
}

/** Holt den hinterlegten Treffer zum Verweis aus dem Router-State — genau einmal. */
export function sucheUebernehmen(verweis) {
  const f = uebergabe;
  uebergabe = null;
  if (!verweis || !f) return null;
  return f.art === verweis.art && String(f.id) === String(verweis.id) ? f : null;
}

/** Liste mit dem gesuchten Eintrag: steht er nicht in den geladenen Seiten, kommt er vorn dazu. */
export function listeMitFokus(liste, fokus) {
  const basis = Array.isArray(liste) ? liste : [];
  if (!fokus || fokus.objekt == null || fokus.id == null) return basis;
  return basis.some((e) => e && String(e.id) === String(fokus.id)) ? basis : [fokus.objekt, ...basis];
}

/** Adressbuch nach einem Adresstreffer: der Reiter der Rolle und die Firma (sonst Name, sonst Label) als Suche. */
export function adressSucheStart(fokus) {
  if (!fokus || fokus.art !== "adresse" || !fokus.objekt) return null;
  const a = fokus.objekt;
  return { tab: a.role === ROLE_RECIPIENT ? TAB_RECIPIENT : TAB_SENDER, q: a.company || vollerName(a) || a.label || "" };
}
