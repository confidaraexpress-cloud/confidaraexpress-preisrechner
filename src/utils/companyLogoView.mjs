/* ── Firmenlogo: reine Anzeige- und Prüflogik ────────────────────────────────
   Kein React, kein DOM, kein fetch — deshalb direkt testbar.

   WAS DAS BILD IST: das Logo des UNTERNEHMENS, nicht das Bild einer Person.
   ConfidaraExpress führt kein Personenbildmodell; dieses Feature führt keines
   ein. Deshalb heißt hier alles `companyLogo` und nirgends Avatar oder
   Profilbild.

   Die Grenzwerte spiegeln den Backendvertrag (lib/companyLogo.js). Sie stehen
   hier ausschließlich, um dem Kunden SOFORT eine Rückmeldung zu geben, statt
   ihn eine Datei hochladen zu lassen, die der Server ohnehin ablehnt. Sie sind
   ausdrücklich KEINE Sicherheitsprüfung: maßgeblich ist allein der Server, der
   MIME-Typ, Dateisignatur (Magic Bytes), Größe und Bildmaße erneut prüft. Wer
   diese Datei umgeht, umgeht nichts. */

export const LOGO_MAX_BYTES = 512 * 1024;               // = COMPANY_LOGO_MAX_BYTES (Default)
export const LOGO_ACCEPT = "image/png,image/jpeg";       // <input accept> — reiner Komfort
export const LOGO_MIME_TYPES = ["image/png", "image/jpeg"];

export const COMPANY_LOGO_TEXT = {
  title: "Unternehmenslogo",
  subtitle: "Ihr Logo im Kundenportal",
  /* Sagt, WO das Bild erscheint — und ebenso klar, wo nicht. Ein Kunde, der ein
     Logo hinterlegt, erwartet es sonst womöglich auf Rechnungen oder Labels. */
  description:
    "Das Logo erscheint in Ihrem eigenen Kundenportal — oben rechts neben Ihrem Firmennamen. " +
    "Es wird nicht an Versanddienstleister übermittelt und erscheint nicht auf Versandlabels, " +
    "Rechnungen oder Zollunterlagen.",
  requirements: "PNG oder JPEG, höchstens 512 KB. Quadratische Logos wirken am besten.",
  /* Warum kein SVG: ausdrücklich benannt, damit die Ablehnung nicht willkürlich
     wirkt. Der Grund ist technisch und bleibt gültig, bis eine geprüfte
     Sanitisierung existiert. */
  svgHint: "SVG-Dateien werden aus Sicherheitsgründen nicht unterstützt.",
  empty: "Noch kein Logo hinterlegt. Solange keines vorliegt, zeigt das Portal den Anfangsbuchstaben Ihres Firmennamens.",
  choose: "Logo hochladen",
  replace: "Logo ändern",
  remove: "Logo entfernen",
  uploading: "Wird hochgeladen …",
  removing: "Wird entfernt …",
  savedUpload: "Logo gespeichert",
  savedRemove: "Logo entfernt",
  altPreview: "Aktuelles Unternehmenslogo",
  genericError: "Das Logo konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.",
  removeError: "Das Logo konnte nicht entfernt werden. Bitte versuchen Sie es erneut.",
};

/* Metadaten aus dem Konto lesen. Das Backend liefert sie top-level neben
   `pendingEmailChange`; AuthContext faltet sie in das User-Objekt. Defensiv:
   Ein Backend OHNE dieses Feld liefert `undefined` → null, und die Oberfläche
   zeigt unverändert die Initiale. Kein Fehler, kein leerer Kasten. */
export function companyLogoMeta(user) {
  const meta = user?.companyLogo;
  if (!meta || typeof meta !== "object") return null;
  if (typeof meta.version !== "string" || !meta.version) return null;
  return meta;
}

export function hasCompanyLogo(user) {
  return companyLogoMeta(user) !== null;
}

/* Lesbare Dateigröße für die Anzeige unter dem Logo. Bewusst grob (eine
   Nachkommastelle ab 100 KB wäre Scheingenauigkeit für eine Bilddatei). */
export function formatLogoSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1000) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/* Maße als Text, falls der Server sie lesen konnte (bei JPEG nicht garantiert). */
export function formatLogoDimensions(meta) {
  const w = meta?.width, h = meta?.height;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) return null;
  return `${w} × ${h} px`;
}

/* Sofortprüfung der gewählten Datei — Komfort, keine Autorität (siehe Kopf).
   Gibt null zurück, wenn nichts zu beanstanden ist, sonst eine Meldung.
   Der Typ wird über `file.type` gelesen; ist er leer (manche Systeme liefern
   nichts), wird NICHT abgelehnt — dann entscheidet der Server. */
export function preCheckLogoFile(file) {
  if (!file) return null;
  const type = typeof file.type === "string" ? file.type.trim().toLowerCase() : "";
  if (type === "image/svg+xml") return COMPANY_LOGO_TEXT.svgHint;
  if (type && !LOGO_MIME_TYPES.includes(type)) return "Bitte wählen Sie eine PNG- oder JPEG-Datei.";
  if (Number.isFinite(file.size) && file.size > LOGO_MAX_BYTES)
    return `Die Datei ist zu groß (${formatLogoSize(file.size)}). Erlaubt sind höchstens ${formatLogoSize(LOGO_MAX_BYTES)}.`;
  if (Number.isFinite(file.size) && file.size === 0) return "Die Datei ist leer.";
  return null;
}

/* Fehlermeldung einer Antwort. Der Server formuliert bereits verständlich und
   ist die einzige Quelle der Wahrheit — sein Text wird deshalb übernommen und
   NICHT im Frontend nachgebaut (sonst driften beide auseinander). Nur wenn gar
   kein Text ankommt (Netzfehler, leerer Body), greift der neutrale Ersatz. */
export function logoErrorMessage(body, fallback = COMPANY_LOGO_TEXT.genericError) {
  const text = body && typeof body.error === "string" ? body.error.trim() : "";
  return text || fallback;
}
