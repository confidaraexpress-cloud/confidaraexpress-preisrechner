import { apiFetch } from "./client";

/* ── Firmenlogo des eigenen Kontos ───────────────────────────────────────────
   Alle drei Aufrufe laufen über das zentrale `apiFetch` (Bearer-Auth, zentrales
   401/403-Handling) — kein eigenes `fetch` in einer Komponente.

   Der Endpunkt trägt KEINEN Pfadparameter: das Konto steht serverseitig im JWT.
   Es gibt hier deshalb nichts zu übergeben und nichts, das sich manipulieren
   ließe.

   WARUM DAS BILD ÜBER fetch UND NICHT ÜBER <img src> KOMMT:
   Die Route ist authentifiziert, und ein <img>-Element kann keinen
   Authorization-Header senden. Die Alternative wäre eine öffentliche oder
   signierte URL — also eine zweite Zugriffsklasse für dieselben Daten. Das Bild
   wird stattdessen als Blob geholt und über eine Object-URL angezeigt. */

const LOGO_PATH = "/api/kunde/company-logo";

/* Zwischenspeicher der Object-URL, auf MODULEBENE (nicht in einer Komponente):
   der Chip hängt an vier Stellen im Baum und wird bei jedem Bereichswechsel neu
   montiert — ohne diesen Speicher liefe bei jeder Navigation ein neuer Abruf.
   Schlüssel ist die Version (gekürzter Inhaltshash): ändert sich das Bild,
   ändert sich die Version, und die alte URL wird freigegeben.

   `inFlight` verhindert, dass mehrere gleichzeitig montierte Chips denselben
   Abruf parallel starten. */
let cachedVersion = null;
let cachedUrl = null;
let inFlight = null;

function revokeCached() {
  if (cachedUrl) URL.revokeObjectURL(cachedUrl);
  cachedUrl = null;
  cachedVersion = null;
}

/* Liefert eine Object-URL des eigenen Logos — oder null, wenn keines vorliegt
   oder der Abruf scheitert. Wirft NIE: ein fehlendes oder unlesbares Logo ist
   kein Fehlerzustand der Anwendung, sondern führt zur Initiale zurück. */
export async function getCompanyLogoUrl(version) {
  if (!version) return null;
  if (cachedVersion === version && cachedUrl) return cachedUrl;
  if (inFlight && inFlight.version === version) return inFlight.promise;

  const promise = (async () => {
    try {
      const r = await apiFetch(LOGO_PATH, { auth: true });
      if (!r.ok) return null;
      const blob = await r.blob();
      if (!blob || blob.size === 0) return null;
      revokeCached();                       // die vorherige Fassung freigeben
      cachedUrl = URL.createObjectURL(blob);
      cachedVersion = version;
      return cachedUrl;
    } catch {
      return null;                           // Netzfehler → Initiale, kein Absturz
    } finally {
      inFlight = null;
    }
  })();

  inFlight = { version, promise };
  return promise;
}

/* Gibt den Zwischenspeicher frei. Wird beim Abmelden aufgerufen (dieselbe
   Stelle wie `clearShippingFlowStorage`) — eine Object-URL überlebt sonst den
   Kontowechsel im selben Tab. */
export function clearCompanyLogoCache() {
  revokeCached();
  inFlight = null;
}

/* Setzt oder ersetzt das Logo. Genau ein Feld `logo`; den Content-Type samt
   Boundary setzt der Browser (apiFetch lässt ihn bei FormData weg).
   Gibt die rohe Response zurück — der Aufrufer wertet Status/JSON selbst aus,
   konsistent mit den übrigen Callern dieses Projekts. */
export function uploadCompanyLogo(file) {
  const formData = new FormData();
  formData.append("logo", file);
  return apiFetch(LOGO_PATH, { method: "POST", auth: true, body: formData });
}

/* Entfernt das Logo (idempotent). Kein Body. */
export function deleteCompanyLogo() {
  return apiFetch(LOGO_PATH, { method: "DELETE", auth: true });
}
