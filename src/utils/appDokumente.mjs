/* ── Das Gerüst der Admin-Anmeldung mit dem Kopf der Admin-App (FE-2, 2026-11-22) ──────────────────────────────────────
   Auf admin.confidaraexpress.de liefert nginx für /admin/login admin-app-login.html: dasselbe dunkle Gerüst wie
   admin-login.html (Hauptdomain), aber mit Manifest, Symbol und Namen der Admin-App — so installiert der Browser auch von
   der Anmeldung aus die Admin-App und nie den Kundenbereich. Das Dokument entsteht im Build aus dem FERTIGEN
   admin-login.html (vite.config.js); eine zweite Fassung des Gerüsts gibt es nicht.

   Ausgetauscht werden genau diese drei Stellen, jede muss genau einmal vorkommen — sonst bricht der Build ab, statt still
   ein Dokument mit dem Kopf des Kundenbereichs auszuliefern. Nur für den Build (Node), nicht im Bündel der Anwendung. */
export const ADMIN_APP_KOPF = Object.freeze([
  ['<link rel="manifest" href="/manifest.webmanifest" />', '<link rel="manifest" href="/admin.webmanifest" />'],
  ['<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-v1.png" />', '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-admin-v1.png" />'],
  ['<meta name="robots" content="noindex, nofollow" />', '<meta name="robots" content="noindex, nofollow" />\n    <meta name="apple-mobile-web-app-title" content="CE Admin" />'],
]);

export function adminAppLoginHtml(html) {
  let ergebnis = String(html);
  for (const [alt, neu] of ADMIN_APP_KOPF) {
    if (ergebnis.split(alt).length !== 2) throw new Error(`admin-app-login.html: „${alt}“ nicht genau einmal im Gerüst`);
    ergebnis = ergebnis.replace(alt, neu);
  }
  return ergebnis;
}
