/* ── Adressbuch — Zeilenaktionen, Verwaltungsmenü und Badges ──────────────────
   Herausgelöst aus addressBookView.mjs (Modularisierungs-Audit). Fachmodul der
   Zeilen-/Kartendarstellung in der Adressliste: sichtbare Hauptaktion,
   Kebab-Menümodell und die Badge-Liste. Kein React, kein Netzwerk. */

import { ROLE_SENDER, ROLE_RECIPIENT, ROLE_BOTH, canSetDefaultSender, canSetDefaultRecipient } from "./addressRoles.mjs";

// ── Sichtbare Zeilen-/Karten-Hauptaktion „Sendung erstellen" ────────────────
// Exakter, verbindlicher Button-Text (Fachvorgabe — NICHT „Neue Sendung",
// „Versand erstellen", „Sendung anlegen", „Jetzt versenden" oder „Buchen").
// Die Aktion startet über den bestehenden onNewShipment-Flow (resolveNewShipment
// Role + mapAddressToShipmentFormPatch) das vorausgefüllte Versandformular —
// sie bucht nichts. Als Konstante hier gehalten, damit Desktop-Zeile und
// Mobil-Karte denselben Text/dasselbe Icon verwenden (kein Drift) und der Text
// isoliert testbar bleibt.
export const CREATE_SHIPMENT_LABEL = "Sendung erstellen";
export const CREATE_SHIPMENT_ICON = "package";

// ── Verwaltungs-Aktionsmenü (Zahnrad) — reines, geordnetes Anzeigemodell ─────
// Liefert die geordneten Menüeinträge des Kebab-/Zahnrad-Menüs. Enthält
// AUSSCHLIESSLICH Verwaltungsaktionen; „Sendung erstellen"/„Neue Sendung" ist
// bewusst KEIN Menüpunkt mehr (jetzt sichtbarer Zeilen-/Karten-Button). Die
// Sichtbarkeit von „Standard-Absender/-Empfänger" folgt exakt der bestehenden
// Rollenregel (canSetDefaultSender/-Recipient) und dem bereits gesetzten
// Standard. Reihenfolge: Verwaltung (Bearbeiten → Duplizieren → Favorit →
// ggf. Standard) — Trenner — Destruktiv (Löschen). Jeder Eintrag: { key, label,
// icon, danger?, separatorBefore? }. `key` mappt der Aufrufer auf den jeweiligen
// Handler-Prop (kein Handler in der reinen Logik).
export function buildAddressMenuModel(address) {
  const a = address || {};
  const items = [
    { key: "edit", label: "Bearbeiten", icon: "form" },
    { key: "duplicate", label: "Duplizieren", icon: "copy" },
    { key: "toggleFavorite", label: a.favorite ? "Favorit entfernen" : "Als Favorit markieren", icon: "star" },
  ];
  if (canSetDefaultSender(a) && !a.isDefaultSender) {
    items.push({ key: "setDefaultSender", label: "Als Standard-Absender setzen", icon: "shieldCheck" });
  }
  if (canSetDefaultRecipient(a) && !a.isDefaultRecipient) {
    items.push({ key: "setDefaultRecipient", label: "Als Standard-Empfänger setzen", icon: "shieldCheck" });
  }
  // Destruktive Aktion zuletzt, durch einen Trenner abgesetzt.
  items.push({ key: "delete", label: "Löschen", icon: "trash", danger: true, separatorBefore: true });
  return items;
}

// ── Zeilen-/Karten-Badges: höchstens drei gleichzeitig ──────────────────────
// Priorität: Standard (blau, wichtigste Information) → Favorit (gelb) → Rolle
// (grau, ruhigster Marker, immer vorhanden). Sind BEIDE Standard-Flags gesetzt
// (nur bei role "both" möglich), werden sie zu EINEM Badge zusammengefasst
// statt zwei separaten — sonst wären bei einem zusätzlich favorisierten
// Eintrag vier Badges gleichzeitig sichtbar. Die zugrunde liegenden Flags
// bleiben dabei unangetastet; nur die Darstellung fasst sie zusammen.
const ROLE_BADGE_LABEL = { [ROLE_SENDER]: "Absender", [ROLE_RECIPIENT]: "Empfänger", [ROLE_BOTH]: "Beides" };
export function addressBadgeList(address) {
  const a = address || {};
  const badges = [];
  if (a.isDefaultSender && a.isDefaultRecipient) {
    badges.push({ key: "default", text: "Standard-Absender & -Empfänger", tone: "blue" });
  } else if (a.isDefaultSender) {
    badges.push({ key: "default", text: "Standard-Absender", tone: "blue" });
  } else if (a.isDefaultRecipient) {
    badges.push({ key: "default", text: "Standard-Empfänger", tone: "blue" });
  }
  if (a.favorite) badges.push({ key: "favorite", text: "Favorit", tone: "yellow" });
  badges.push({ key: "role", text: ROLE_BADGE_LABEL[a.role] || a.role, tone: "gray" });
  return badges;
}
