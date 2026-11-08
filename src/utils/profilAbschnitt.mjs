/* ── Sprungwunsch in einen Abschnitt der Kontoeinstellungen (Profilmenü, 2026-11-08) ────────────────────────────────
   „Sicherheit & Passwort“ im Profilmenü öffnet die bestehenden Kontoeinstellungen und springt dort in den Abschnitt
   „Sicherheit“ (Login-E-Mail und Passwortänderung). Dasselbe Muster wie der Fokuswunsch der App-Karte
   (utils/pwaInstallPrompt.js):

   • Angefordert wird erst, wenn die Navigation tatsächlich ausgeführt wird — als Folgeaktion von `navigateTo`. Fängt der
     Verlassen-Schutz von „Neue Sendung“ die Navigation ab und bleibt der Kunde dort, entsteht kein Wunsch; bestätigt er
     das Verlassen, läuft die Folgeaktion dann.
   • Der offene Wunsch ist gemeldeter Zustand, kein Mount-Signal: Kontoeinstellungen, die gerade erst entstehen, lösen
     ihn beim Mount ein, schon geöffnete (kein Remount) sofort. Eingelöst wird genau einmal.
   • Nur Modulspeicher — kein Storage, keine Adresse; ein Neuladen vergisst ihn. */

export const PROFIL_ABSCHNITTE = Object.freeze(["sicherheit"]);

let wunsch = null;
const hoerer = new Set();

function melden() {
  for (const fn of [...hoerer]) fn();
}

export function profilAbschnittAnfordern(abschnitt) {
  if (!PROFIL_ABSCHNITTE.includes(abschnitt)) return false;
  wunsch = abschnitt;
  melden();
  return true;
}

// Löst den Wunsch für genau diesen Abschnitt ein (true) — ein anderer oder kein Wunsch bleibt unberührt (false).
export function profilAbschnittEinloesen(abschnitt) {
  if (wunsch === null || wunsch !== abschnitt) return false;
  wunsch = null;
  melden();
  return true;
}

export function profilAbschnittWunsch() {
  return wunsch;
}

export function profilAbschnittAbonnieren(fn) {
  hoerer.add(fn);
  return () => { hoerer.delete(fn); };
}
