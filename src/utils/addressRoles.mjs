/* ── Adressbuch — Rollen, Reiter und Rollenregeln ─────────────────────────────
   Herausgelöst aus addressBookView.mjs (Modularisierungs-Audit): das Blattmodul
   des Adressbuch-Anzeigemodells. Kanonische Rollenwerte, Tab-Zuordnung und die
   Regeln, welche Rolle welche Standard-/Übernahmeaktion erlaubt. Kein React,
   kein Netzwerk — nur deterministische Funktionen. */

// ── Kanonische Backend-Rollenwerte ───────────────────────────────────────────
export const ROLE_SENDER = "sender";
export const ROLE_RECIPIENT = "recipient";
export const ROLE_BOTH = "both";

// ── Sichtbare Tabs („logische Trennung", technisch eine Tabelle) ────────────
export const TAB_SENDER = "sender";       // „Meine Adressen"
export const TAB_RECIPIENT = "recipient"; // „Empfänger"

// Benutzerfreundliche Rollen-Bezeichnung im Formular; API-Shape bleibt exakt
// role: "sender"|"recipient"|"both" (nur die Anzeige-Labels sind kundenfreundlich).
export const UI_ROLE_OPTIONS = [
  { value: ROLE_SENDER, label: "Eigene Adresse" },
  { value: ROLE_RECIPIENT, label: "Empfänger" },
  { value: ROLE_BOTH, label: "Beides" },
];

// ── Tab-/Rollen-Zuordnung (Produktentscheidung #3/#4) ───────────────────────
// „both" gehört zu BEIDEN Ansichten. Sender-Tab: sender+both. Empfänger-Tab:
// recipient+both.
export function belongsToTab(address, tab) {
  const role = address?.role;
  if (tab === TAB_SENDER) return role === ROLE_SENDER || role === ROLE_BOTH;
  if (tab === TAB_RECIPIENT) return role === ROLE_RECIPIENT || role === ROLE_BOTH;
  return false;
}

// „Standard-Absender" nur bei sender/both (Regel #1).
export function canSetDefaultSender(address) {
  return address?.role === ROLE_SENDER || address?.role === ROLE_BOTH;
}

// „Standard-Empfänger" nur bei recipient/both (Regel #2).
export function canSetDefaultRecipient(address) {
  return address?.role === ROLE_RECIPIENT || address?.role === ROLE_BOTH;
}

// ── Rollen-/Default-Konsistenz (clientseitige Frühwarnung) ──────────────────
// Erkennt widersprüchliche Kombinationen, OHNE die Rolle automatisch/still zu
// verändern — der Aufrufer deaktiviert die betroffene Checkbox und zeigt den
// Hinweis. Rückgabe: {} (konsistent) oder { isDefaultSender: msg } / { isDefaultRecipient: msg }.
export function validateRoleDefaultConsistency({ role, isDefaultSender, isDefaultRecipient }) {
  const errors = {};
  if (isDefaultSender && !(role === ROLE_SENDER || role === ROLE_BOTH)) {
    errors.isDefaultSender = "Nur eine eigene Adresse oder eine Adresse vom Typ Beides kann Standard-Absender sein.";
  }
  if (isDefaultRecipient && !(role === ROLE_RECIPIENT || role === ROLE_BOTH)) {
    errors.isDefaultRecipient = "Nur ein Empfänger oder eine Adresse vom Typ Beides kann Standard-Empfänger sein.";
  }
  return errors;
}

// ── „Neue Sendung" aus einer Adresse ─────────────────────────────────────────
// sender/recipient → direkt zuordenbar. both → der Aufrufer muss vorher fragen
// (Auswahl-Dialog), da die Rolle nicht eindeutig ist. Unbekannte Rolle → blockiert.
export function resolveNewShipmentRole(address) {
  if (address?.role === ROLE_BOTH) return { type: "choose" };
  if (address?.role === ROLE_SENDER) return { type: "direct", role: "sender" };
  if (address?.role === ROLE_RECIPIENT) return { type: "direct", role: "recipient" };
  return { type: "blocked" };
}
