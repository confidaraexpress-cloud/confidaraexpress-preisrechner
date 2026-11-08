/* ── Profilmenü des Kundenbereichs (Betreiberentscheidung 2026-11-08) ─────────────────────────────────────────────
   Ein Klick auf den Benutzerchip öffnet dieses Menü direkt unter dem Chip, statt in die Kontoeinstellungen zu wechseln;
   die Seite bleibt stehen. Inhalt, Lage und Tastaturweg stehen hier — framework-frei und ohne DOM prüfbar
   (profilMenueView.test.mjs). Die Komponente (components/ui/ProfilMenue.jsx) misst nur und rendert.

   Jede Aktion nutzt einen BESTEHENDEN Weg der Shell (Verlassen-Schutz von „Neue Sendung“ inklusive): die Seitennavigation
   (`navigateTo`) zu den Kontoeinstellungen bzw. den Supportanfragen und den Abmeldeweg der Shell. „Sicherheit & Passwort“
   öffnet die Kontoeinstellungen und springt dort in den Abschnitt „Sicherheit“ (utils/profilAbschnitt.mjs) — keine neue
   Seite, keine neue Passwortlogik. */

export const PROFIL_MENUE_TEXT = Object.freeze({
  // Zugänglicher Zusatz und Tooltip des Chips: Er öffnet das Menü, er führt nicht mehr direkt ins Profil.
  knopf: "Profilmenü",
  // Dezente Kontoart im Kopf — jedes Konto des Kundenbereichs ist ein Geschäftskundenkonto (B2B-Plattform).
  kontoart: "Geschäftskundenkonto",
});

// Die vier beschlossenen Aktionen in fester Reihenfolge; vor „Abmelden“ eine Trennlinie.
//   ziel      — page-Wert der Seitennavigation
//   abschnitt — Abschnitt der Zielseite, in den gesprungen wird (nur nach tatsächlich ausgeführter Navigation)
//   abmelden  — der Abmeldeweg der Shell statt einer Navigation
export const PROFIL_MENUE_EINTRAEGE = Object.freeze([
  Object.freeze({ key: "konto", titel: "Mein Konto", untertitel: "Profil und Unternehmensdaten", icon: "user", ziel: "profile" }),
  Object.freeze({ key: "sicherheit", titel: "Sicherheit & Passwort", untertitel: "Zugangsdaten verwalten", icon: "lock", ziel: "profile", abschnitt: "sicherheit" }),
  Object.freeze({ key: "support", titel: "Meine Supportanfragen", untertitel: "Anfragen und Antworten ansehen", icon: "headset", ziel: "support" }),
  Object.freeze({ key: "abmelden", titel: "Abmelden", icon: "logout", abmelden: true, trennerDavor: true }),
]);

// Maße in px: Breite nach Auftrag (etwa 320–350 px), Abstand unter dem Chip, Rand zum Fenster, Mindesthöhe der Liste.
export const PROFIL_MENUE_MASS = Object.freeze({ breite: 336, abstand: 8, rand: 16, mindestHoehe: 160, pfeilRand: 28 });

const zahl = (v) => typeof v === "number" && Number.isFinite(v);

/* Lage unter dem Chip, rechtsbündig an seiner rechten Kante — im Fensterkoordinatensystem.
   anker:    Rechteck des Chips ({ left, right, top, bottom })
   flaeche:  sichtbare Fläche ({ breite, hoehe, unten }) — `unten` ist eine feste Leiste am unteren Rand (Demo-Leiste)
   Breite höchstens bis auf den Rand an beiden Seiten; die Höchsthöhe reicht bis zum unteren Rand, darüber scrollt die Liste
   innen (nie die Seite). Der Pfeil zeigt auf die Mitte des Chips. Ungültige Eingaben ergeben null (fail-closed: das Menü
   bleibt dann unsichtbar statt an einer erfundenen Stelle). */
export function profilMenueLage({ anker, flaeche, mass = PROFIL_MENUE_MASS } = {}) {
  if (!anker || !flaeche) return null;
  const { left, right, bottom } = anker;
  const { breite: fensterBreite, hoehe: fensterHoehe } = flaeche;
  if (![left, right, bottom, fensterBreite, fensterHoehe].every(zahl) || right < left) return null;
  const unten = zahl(flaeche.unten) && flaeche.unten > 0 ? flaeche.unten : 0;
  const breite = Math.max(0, Math.min(mass.breite, fensterBreite - 2 * mass.rand));
  const links = Math.max(mass.rand, Math.min(right - breite, fensterBreite - mass.rand - breite));
  const oben = bottom + mass.abstand;
  const maxHoehe = Math.max(mass.mindestHoehe, Math.floor(fensterHoehe - unten - mass.rand - oben));
  const mitte = (left + right) / 2 - links;
  const pfeil = Math.round(Math.max(mass.pfeilRand, Math.min(breite - mass.pfeilRand, mitte)));
  return { top: Math.round(oben), left: Math.round(links), breite: Math.round(breite), maxHoehe, pfeil };
}

/* Tastaturweg im Menü (Muster „Menu Button“): Pfeiltasten wandern im Kreis, Pos1/Ende springen an die Enden.
   aktuell: Index des fokussierten Eintrags oder -1 (Fokus außerhalb der Einträge). Andere Tasten ergeben null. */
export function profilMenueZiel(taste, aktuell, anzahl) {
  if (!Number.isInteger(anzahl) || anzahl <= 0) return null;
  const i = Number.isInteger(aktuell) && aktuell >= 0 && aktuell < anzahl ? aktuell : -1;
  if (taste === "ArrowDown") return i < 0 ? 0 : (i + 1) % anzahl;
  if (taste === "ArrowUp") return i < 0 ? anzahl - 1 : (i - 1 + anzahl) % anzahl;
  if (taste === "Home") return 0;
  if (taste === "End") return anzahl - 1;
  return null;
}
