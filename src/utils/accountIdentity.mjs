// ─────────────────────────────────────────────────────────────────────────────
// Kontoidentität — die EINE Quelle für die sichtbare Initiale und den
// angezeigten Kontonamen. Rein, framework-frei, ohne Netzwerk und State.
//
// Vorher gab es vier Fassungen derselben Sache: die Sidebar-Firmenkarte, der
// Benutzerchip und die Übersicht leiteten je eigenständig
// `(company_name || name || "?").charAt(0)` ab, und der Profilhero zeigte eine
// fest verdrahtete Initiale „CE" — also die Marke ConfidaraExpress statt des
// Kontos. Ein Konto „Muster GmbH" trug damit in der Sidebar ein „M" und im
// Profil ein „CE": dieselbe Identität, zwei verschiedene Zeichen.
//
// Bewusst EIN Buchstabe, nicht zwei: deutsche Firmennamen enden regelmäßig auf
// eine Rechtsform („Muster GmbH", „Beispiel AG", „Test e. K."). Zwei Initialen
// aus den ersten beiden Wörtern ergäben daraus „MG"/„BA"/„TE" — die zweite
// Stelle trüge dann die Rechtsform statt des Namens und läse sich wie ein
// fremdes Kürzel. Ein Buchstabe ist in allen Fällen richtig.
// ─────────────────────────────────────────────────────────────────────────────

// Fallbackzeichen, wenn weder Firmenname noch Ansprechpartner ein verwertbares
// Zeichen liefern. Bewusst neutral — nie ein Markenkürzel.
export const ACCOUNT_INITIAL_FALLBACK = "?";

// Erstes verwertbares Zeichen: Buchstaben und Ziffern zählen, führende
// Anführungszeichen/Klammern/Leerzeichen werden übersprungen. So ergibt
// „ ›Muster‹ GmbH" ein „M" und nicht „›".
function firstMeaningfulChar(value) {
  if (typeof value !== "string") return null;
  for (const ch of value.trim()) {
    // \p{L} = Buchstabe, \p{N} = Ziffer (Unicode-bewusst, also auch Umlaute).
    if (/[\p{L}\p{N}]/u.test(ch)) return ch.toUpperCase();
  }
  return null;
}

// Die sichtbare Initiale des Kontos. Reihenfolge: Firmenname (die Identität
// eines B2B-Kontos), danach der Ansprechpartner.
export function accountInitials(user) {
  return firstMeaningfulChar(user?.company_name)
    || firstMeaningfulChar(user?.name)
    || ACCOUNT_INITIAL_FALLBACK;
}

// Der sichtbare Kontoname — dieselbe Vorrangregel wie die Initiale, damit
// Avatar und Name nie auseinanderlaufen.
export function accountDisplayName(user, fallback = "Kunde") {
  const company = typeof user?.company_name === "string" ? user.company_name.trim() : "";
  if (company) return company;
  const name = typeof user?.name === "string" ? user.name.trim() : "";
  return name || fallback;
}
