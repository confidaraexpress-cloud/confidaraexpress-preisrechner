# ConfidaraExpress als App (PWA)

Ausgelagert aus der Regeldatei (Stand origin/main, 2026-10-19). Wird nicht automatisch geladen. Lesen bei Arbeit an Manifest, Service Worker, Offline-Seite, Installationszugang, Update-Hinweis oder nginx-Locations. Bei Widerspruch gewinnt der Canonical Context, danach der aktuelle Code.

Eine Anwendung — dieselbe SPA im Browser und installiert. Projektweiter Stand: Canonical Context §3.1, §15, §16.

- **Manifest** `public/manifest.webmanifest`; die App-Icons entstehen aus `public/favicon-v2.svg` über `scripts/export-app-icons.mjs` (Namen versioniert `-vN`, Manifest nachziehen). Keine Zusatzfelder (Shortcuts, Screenshots, Share Target …) ohne Produktentscheidung.
- **Service Worker** `public/sw.js`, registriert nur im Produktionsbuild (`src/utils/serviceWorkerRegistration.js`): ausschließlich Navigationen derselben Origin, Netz zuerst, `/offline.html` nur bei Netzfehler. Genau ein Cache `ce-offline-v1` mit genau dieser Datei. **Nie** App-Code, API-Antworten, Dokumente oder Kundendaten cachen; kein Background Sync — `/book` darf nie automatisch wiederholt werden. Abgesichert durch `src/styles/pwaGovernance.test.mjs` und `tests/e2e/pwaCore.test.mjs`.
- **`offline.html`** bleibt eigenständig: kein Script (CSP), keine externen Ressourcen; das Signet ist die Favicon-Geometrie.
- **Installationszugang nur nach dem Login:** Karte `components/dashboard/AppInstallCard.jsx` (Kontoeinstellungen, nach „Sicherheit") und Utility-Eintrag in `DashboardSidebar.jsx`. Die Entscheidung fällt allein in `utils/pwaInstallView.mjs`. `beforeinstallprompt` fängt `main.jsx` über `utils/pwaInstallPrompt.js` ab; `prompt()` nur auf Klick. Nicht neben dem Benutzerchip, nicht in der Topbar. Buttonbeschriftungen kurz halten — Buttons brechen nicht um (320 px).
- **Updates:** nie automatisch neu laden; der Versionshinweis (`hooks/useAppUpdateAvailable.js`) erscheint nicht auf `/booking` und nicht in „Neue Sendung".
- **Login-Rücksprung** nur über `utils/loginReturnTarget.mjs` (Allowlist, kein Open Redirect).
- **nginx:** neue Locations wiederholen den Sicherheitsheaderblock; `/sw.js` nie ersatzlos entfernen (Notfall: sich selbst abmeldende Fassung).
- **E2E:** `pwaCore` baut in ein temporäres Verzeichnis und startet `vite preview` — den Service Worker gibt es nur im Produktionsbuild.
