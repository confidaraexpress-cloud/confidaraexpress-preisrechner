// api/launchScopeApi.js — welche Länder ConfidaraExpress heute anbietet.
//
// EINE Frage, EIN Endpunkt, EINE Antwort je Tab. Dasselbe Muster wie `legalApi.js`: das
// Frontend pflegt keine eigene Länder-Whitelist, es fragt den Server.
//
// ─── Warum ein Modulcache ────────────────────────────────────────────────────────────────────
// Der Scope ändert sich innerhalb einer Sitzung nicht, aber die Auswahlfelder hängen an acht
// Stellen im Baum und werden bei jedem Bereichswechsel neu montiert. Ohne Cache liefe bei jeder
// Navigation ein Abruf. Gespeichert wird ausschließlich das PROMISE — damit erzeugen auch zwei
// gleichzeitig montierte Formulare nur einen Request.
//
// ─── Nichts wird persistiert ─────────────────────────────────────────────────────────────────
// Kein `localStorage`, kein `sessionStorage`. Ein Reload fragt neu; das ist eine Anfrage von
// wenigen hundert Byte und die einzige Art, eine Scope-Änderung ohne Deployment zu sehen.
//
// Öffentlich und ohne Auth (`auth: false`): die Information ist eine Produktaussage, kein
// Kontodatum, und steht ohnehin in jedem ausgelieferten Preisrechnerformular. Damit läuft der
// Abruf auch bei abgelaufenem Token sauber und rührt den zentralen 401/403-Handler nicht an.
import { apiFetch } from "./client";
import { parseLaunchScope } from "../utils/launchScopeView.mjs";

let laufend = null;

/**
 * Liefert `{ codes }` oder `null`. `null` heißt „nicht bekannt" — nie „keine Länder";
 * die Auswertung in `scopedCountries` behandelt beide Fälle als volle Liste.
 *
 * Wirft NICHT: ein Ausfall des Scope-Endpunkts darf kein Formular zerstören. Die
 * Buchungssperre liegt vollständig serverseitig, dieser Abruf ist reine UX.
 */
export function fetchLaunchScope() {
  if (laufend) return laufend;
  laufend = (async () => {
    try {
      const r = await apiFetch(`/api/shipping/launch-scope`);
      if (!r.ok) return null;
      return parseLaunchScope(await r.json());
    } catch {
      return null;
    }
  })();
  return laufend;
}

// Nur für Tests: den Cache leeren, damit ein zweiter Fall nicht die Antwort des ersten sieht.
export function __resetLaunchScopeCache() { laufend = null; }
