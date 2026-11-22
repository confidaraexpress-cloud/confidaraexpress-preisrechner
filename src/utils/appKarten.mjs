/* ── Installation der Admin- und der Partner-App (Betreiberauftrag 2026-11-22, D5; FE-2) ──────────────────────────────
   Auf dem App-Host (admin./partner.confidaraexpress.de) zeigt die Karte „Als App nutzen“ den Installationsweg, den
   der Browser wirklich bietet — dieselbe Entscheidung wie im Kundenbereich (pwaInstallView.mjs), mit dem Namen der App.
   Reine Funktionen, kein React. */

import { APP_ADMIN } from "./appHost.mjs";
import { INSTALL_STATE } from "./pwaInstallView.mjs";

const NAME = Object.freeze({ admin: "die Admin-App", partner: "die Partner-App" });
const name = (app) => (app === APP_ADMIN ? NAME.admin : NAME.partner);
const gross = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Erklärender Text der Installationskarte je Zustand (usePwaInstall). */
export function appInstallText(app, state) {
  const n = name(app);
  switch (state) {
    case INSTALL_STATE.INSTALLED: return `Sie nutzen ${n} als installierte App.`;
    case INSTALL_STATE.JUST_INSTALLED: return `${gross(n)} wurde installiert. Sie finden sie auf Ihrem Startbildschirm bzw. in Ihrem Startmenü.`;
    case INSTALL_STATE.BROWSER_MENU: return `Ist ${n} bereits installiert, öffnen Sie sie über ihr Symbol. Andernfalls finden Sie die Installation im Menü Ihres Browsers.`;
    case INSTALL_STATE.UNSUPPORTED: return "Ihr Browser bietet keine App-Installation an. Alle Funktionen stehen Ihnen im Browser vollständig zur Verfügung.";
    case INSTALL_STATE.IOS: return `Vom Home-Bildschirm öffnet ${n} wie eine App – mit denselben Funktionen wie im Browser.`;
    case INSTALL_STATE.SAFARI_MAC: return `Aus dem Dock öffnet ${n} wie eine App – mit denselben Funktionen wie im Browser.`;
    default: return `Installiert öffnet ${n} in einem eigenen Fenster – mit denselben Funktionen wie im Browser.`;
  }
}

export const APP_KARTEN_TEXT = Object.freeze({
  installTitel: "Als App nutzen",
});
