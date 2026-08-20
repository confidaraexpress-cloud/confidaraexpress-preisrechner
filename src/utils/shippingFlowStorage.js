import { FLOW_STORAGE_KEY } from "./shippingFlowState.mjs";

// Aufräumen des früheren sessionStorage-Spiegels des temporären Versandvorgangs.
//
// ── Warum hier nur noch gelöscht wird ───────────────────────────────────────
// Der Vorgang wurde bis zum Paket „leerer Nullzustand" in den sessionStorage
// gespiegelt und beim Mount daraus wiederhergestellt. Damit überlebte er einen
// Browser-Reload — und genau das war fachlich falsch: „Neue Sendung" ist ein
// NEUER Vorgang, und ein F5 auf einem halb ausgefüllten Formular holte
// Adressen, Paketdaten und alte Angebote zurück, ohne dass der Kunde etwas
// gespeichert hätte. Wer Daten behalten will, speichert einen Entwurf; das ist
// die bewusste, serverseitige und geräteübergreifende Funktion dafür.
//
// Der Vorgang lebt seitdem ausschließlich im ShippingFlowProvider, also im
// Arbeitsspeicher des Tabs. Er übersteht jeden Wechsel innerhalb der SPA
// (Sidebar, „Zurück" aus der Buchung, Browser-Vorwärts) — der Provider hängt
// außerhalb von <Routes> — und endet mit dem Reload. Genau diese Trennung war
// gewünscht: transienter Vorgang ja, persistente Wiederherstellung nein.
//
// ── Warum das Löschen bleibt ────────────────────────────────────────────────
// Es schreibt zwar niemand mehr, aber gehashte JS-Bundles gehen mit `immutable`
// hinaus: ein zum Deploymentzeitpunkt offener Tab kann noch das alte Bundle
// halten und den Schlüssel geschrieben haben. Der Provider räumt ihn beim Start
// ab, und der Abmeldepfad tut es weiterhin — sonst überlebte ein fremder
// Vorgang den Kontowechsel im selben Tab.
//
// Jeder Zugriff kann werfen (Privatmodus, gesperrter Speicher) und wird
// deshalb geschluckt: die Anwendung darf daran nicht scheitern.

export function clearShippingFlowStorage() {
  try {
    window.sessionStorage.removeItem(FLOW_STORAGE_KEY);
  } catch {
    /* nichts zu tun */
  }
}
