import { apiFetch } from "./client";

/* ── Foto des persönlichen ConfidaraExpress-Ansprechpartners ─────────────────
   Dasselbe Muster wie das Firmenlogo (companyLogoApi.js): authentifizierter Abruf über das zentrale `apiFetch`,
   Blob, Object-URL. Der Endpunkt trägt KEINEN Pfadparameter — welches Foto kommt, folgt serverseitig aus dem Konto
   im JWT; es gibt nichts zu übergeben und nichts zu manipulieren. Ein <img> könnte keinen Authorization-Header
   senden; eine öffentliche Bildadresse wäre eine zweite Zugriffsklasse für dieselbe Person.

   Zwischenspeicher auf Modulebene, Schlüssel ist die Version aus /kundenbereich (gekürzter Inhaltshash): wechselt
   ein Admin den Ansprechpartner, ändert sich die Version, und die alte Object-URL wird freigegeben. `inFlight`
   verhindert parallele Abrufe derselben Version. */

const FOTO_PATH = "/api/kunde/account-manager/photo";

let cachedVersion = null;
let cachedUrl = null;
let inFlight = null;

function revokeCached() {
  if (cachedUrl) URL.revokeObjectURL(cachedUrl);
  cachedUrl = null;
  cachedVersion = null;
}

/* Object-URL des Fotos — oder null, wenn keines vorliegt oder der Abruf scheitert. Wirft nie: ohne Foto zeigt die
   Karte die Initialen der richtigen Person. */
export async function getAccountManagerPhotoUrl(version) {
  if (!version) return null;
  if (cachedVersion === version && cachedUrl) return cachedUrl;
  if (inFlight && inFlight.version === version) return inFlight.promise;

  const promise = (async () => {
    try {
      const r = await apiFetch(FOTO_PATH, { auth: true });
      if (!r.ok) return null;
      const blob = await r.blob();
      if (!blob || blob.size === 0) return null;
      revokeCached();
      cachedUrl = URL.createObjectURL(blob);
      cachedVersion = version;
      return cachedUrl;
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();

  inFlight = { version, promise };
  return promise;
}

/* Freigabe beim Abmelden und beim zentralen 401/403 (AuthContext) — das Foto des Ansprechpartners eines Kontos
   überlebt sonst den Kontowechsel im selben Tab. */
export function clearAccountManagerPhotoCache() {
  revokeCached();
  inFlight = null;
}
