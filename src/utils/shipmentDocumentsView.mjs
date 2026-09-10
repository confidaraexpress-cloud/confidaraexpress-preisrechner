// ─────────────────────────────────────────────────────────────────────────────
// Dokumente EINER Sendung — reine Auswertung für den Dokumente-Drawer.
//
// Kein React, kein fetch, kein Zustand. Beantwortet ausschließlich: welche
// Dokumente meldet der Server, wie werden sie gruppiert, was darf die Oberfläche
// dazu anbieten.
//
// ─── Der Server ist die Wahrheit ─────────────────────────────────────────────
// Welche Dokumente es zu einer Sendung gibt, sagt allein
// `GET /api/shipments/:id/documents`. Hier wird NICHTS aus der Sendungszeile
// abgeleitet: nicht aus Zielland, Status, Carrier, Tarif oder daraus, ob eine
// Auftragsbestätigungsnummer in der Liste steht. Auch die GRUPPE kommt aus der
// Antwort (`category`) — es wird kein Dokumentname geparst.
//
// ─── Die gemeinsame Grundlage ────────────────────────────────────────────────
// Pfad-Guard und Nachladetakt stehen HIER, weil sie für jedes Sendungsdokument
// gelten. `proformaDocumentView.mjs` (P5B, Erfolgsbildschirm) reicht beide
// unverändert weiter — es gibt genau EINE Regel, nicht zwei mit demselben Inhalt.
// ─────────────────────────────────────────────────────────────────────────────

// Zustände des Serververtrags (P5A). Mehr gibt es nicht; alles Unbekannte gilt
// als „in Arbeit", nie als ladbar.
export const DOC_STATUS = {
  READY: "ready",
  PROCESSING: "processing",
  FAILED: "failed",
};

/**
 * Ist `path` ein Pfad auf DIESE API — und nicht auf einen fremden Host?
 *
 * Das ist kein Formalismus. `apiFetch` reicht eine absolute http(s)-URL
 * unverändert durch UND hängt bei `auth: true` den Bearer-Token an. Ein
 * `downloadPath`, der (durch einen Fehler oder eine manipulierte Antwort) auf
 * einen fremden Host zeigte, würde das Kundentoken dorthin senden. Deshalb wird
 * ausschließlich ein relativer Pfad akzeptiert; „//host/…" ist protokollrelativ
 * und damit ebenfalls ein fremder Host, „javascript:"/„data:" sind gar keine
 * Serverpfade.
 */
export function isSafeApiPath(path) {
  if (typeof path !== "string") return false;
  const p = path.trim();
  if (!p.startsWith("/") || p.startsWith("//")) return false;
  // Steuerzeichen, Leerraum und Anführungszeichen haben in einem Pfad nichts zu
  // suchen — sie deuten auf eine kaputte oder gebastelte Antwort hin.
  return !/[\s"'<>\\]/.test(p);
}

// ─── Gedeckeltes Nachladen ───────────────────────────────────────────────────
// Ein Dokument entsteht serverseitig nach der Buchung, in aller Regel innerhalb
// weniger Sekunden. Deshalb: erster Abruf sofort, danach kurzer fester Takt und
// eine harte Obergrenze. Kein Endlospolling, kein Hintergrundworker, kein
// Backoff über Minuten. Läuft das Budget ab, während ein Beleg noch entsteht,
// bleibt der ruhige „wird erstellt"-Hinweis stehen — die Oberfläche behauptet
// nichts Falsches, sie hört nur auf zu fragen.
export const DOCUMENT_POLL_INTERVAL_MS = 2000;
export const DOCUMENT_POLL_BUDGET_MS = 30000;

/**
 * Wartezeit vor dem nächsten Abruf — oder `null`, wenn das Budget erschöpft ist.
 * `attempt` ist die Zahl der bereits ERFOLGTEN Nachladeversuche (der sofortige
 * erste Abruf zählt nicht mit).
 */
export function nextDocumentPollDelay(attempt) {
  // Erst der TYP, dann der Wert — nie in einem Schritt: `Number(null)` und
  // `Number("")` sind `0`, `Number("3")` ist `3`. Ohne diese Reihenfolge
  // erzeugte ein versehentlich übergebenes `null` einen gültigen Takt und damit
  // ein Nachladen, das sein Budget nie erreicht.
  if (typeof attempt !== "number") return null;
  if (!Number.isInteger(attempt) || attempt < 0) return null;
  const verbraucht = (attempt + 1) * DOCUMENT_POLL_INTERVAL_MS;
  return verbraucht <= DOCUMENT_POLL_BUDGET_MS ? DOCUMENT_POLL_INTERVAL_MS : null;
}

// ─── Gruppen ─────────────────────────────────────────────────────────────────
// Feste Abbildung der SERVERSEITIGEN Kategorien auf deutsche Überschriften. Nur
// bekannte Werte; alles andere sammelt „Weitere Dokumente" ein — eine unbekannte
// Kategorie darf weder verschwinden noch die Oberfläche zerlegen. Die
// Reihenfolge ist fest: Versand → Zoll → Geschäftsdokumente → Weitere.
export const CATEGORY_LABELS = {
  SHIPPING: "Versand",
  CUSTOMS: "Zoll",
  ORDER: "Geschäftsdokumente",
};
export const CATEGORY_ORDER = ["SHIPPING", "CUSTOMS", "ORDER"];
export const OTHER_CATEGORY = "OTHER";
export const OTHER_CATEGORY_LABEL = "Weitere Dokumente";

// Reihenfolge INNERHALB einer Gruppe. Ein unbekannter Typ hängt sich hinten an,
// in der Reihenfolge der Serverantwort — er wird nicht unterschlagen.
// TG-F5: das Abholetikett steht direkt hinter den Versandetiketten — es gehört zur Übergabe
// an den Carrier, nicht zu den Geschäftsunterlagen.
const TYPE_ORDER = ["LABEL", "COLLECTION_LABEL", "DELIVERY_NOTE", "PROFORMA", "ORDER_CONFIRMATION"];

// Ersatzbeschriftung, falls der Server ausnahmsweise keine mitschickt. Der
// Server liefert `label` — das hier ist nur das Netz darunter, damit nie eine
// namenlose Zeile entsteht.
const TYPE_FALLBACK_LABELS = {
  LABEL: "Versandlabel",
  COLLECTION_LABEL: "Abholetikett",
  DELIVERY_NOTE: "Lieferschein",
  PROFORMA: "Proforma-Rechnung",
  ORDER_CONFIRMATION: "Auftragsbestätigung",
};

// Ein Iconsatz aus derselben Familie (components/ui/Icon.jsx) — bewusst KEINE
// zweite Bildsprache je Dokument und keine Emojis.
const TYPE_ICONS = {
  LABEL: "printer",
  COLLECTION_LABEL: "truck",
  DELIVERY_NOTE: "form",
  PROFORMA: "invoice",
  ORDER_CONFIRMATION: "seal",
};
export const DEFAULT_DOCUMENT_ICON = "form";
export const documentIcon = (type) => TYPE_ICONS[type] || DEFAULT_DOCUMENT_ICON;

// Neutraler Rückfalldateiname je Typ. Er greift NUR, wenn der Browser den
// serverseitigen `Content-Disposition`-Namen nicht freigibt. Es wird nie eine
// Belegnummer zusammengebaut und keine interne ID verwendet.
const TYPE_FILENAMES = {
  LABEL: "versandlabel.pdf",
  COLLECTION_LABEL: "abholetikett.pdf",
  DELIVERY_NOTE: "lieferschein.pdf",
  PROFORMA: "proforma-rechnung.pdf",
  ORDER_CONFIRMATION: "auftragsbestaetigung.pdf",
};
export const DEFAULT_DOCUMENT_FILENAME = "dokument.pdf";
// TG-F5: bei Belegen mit Ordnungszahl trägt der Rückfallname sie + 1 („versandlabel-2.pdf"),
// damit drei Etiketten nicht unter demselben Namen landen. Es ist die CE-Reihenfolge des
// Servers, keine Paketnummer. Ohne Ordnungszahl bleibt der Name, wie er war.
export const documentFallbackFilename = (type, ordinal) => {
  const name = TYPE_FILENAMES[type];
  if (!name) return DEFAULT_DOCUMENT_FILENAME;
  if (typeof ordinal !== "number" || !Number.isInteger(ordinal) || ordinal < 0) return name;
  return name.replace(/\.pdf$/, `-${ordinal + 1}.pdf`);
};

/**
 * Anzeigezustand eines Dokuments.
 *
 * `ready` verlangt ZWEI Dinge: der Server meldet `ready` UND er liefert einen
 * benutzbaren Pfad. Ein „ready" ohne (oder mit fremdem) Pfad ist nichts, worauf
 * man klicken kann — und kein Fehler, den es zu melden gäbe. Alles Unbekannte
 * gilt ebenfalls als `processing`, nie als ladbar.
 */
export function documentViewState(doc) {
  if (!doc || typeof doc !== "object") return DOC_STATUS.PROCESSING;
  if (doc.status === DOC_STATUS.FAILED) return DOC_STATUS.FAILED;
  if (doc.status === DOC_STATUS.READY && isSafeApiPath(doc.downloadPath)) return DOC_STATUS.READY;
  return DOC_STATUS.PROCESSING;
}

/** Der servergelieferte Downloadpfad — nur im Zustand `ready`, sonst `null`. */
export function documentDownloadPath(doc) {
  return documentViewState(doc) === DOC_STATUS.READY ? doc.downloadPath.trim() : null;
}

/** Sichtbarer Name: der Servertext, sonst die Ersatzbeschriftung des Typs. */
export function documentLabel(doc) {
  const l = doc && typeof doc.label === "string" ? doc.label.trim() : "";
  if (l) return l;
  return (doc && TYPE_FALLBACK_LABELS[doc.type]) || "Dokument";
}

/**
 * Die Belegnummer — oder `null`. Fehlt sie, entsteht KEIN leerer Platzhalter.
 */
export function documentNumber(doc) {
  const n = doc && typeof doc.number === "string" ? doc.number.trim() : "";
  return n || null;
}

/**
 * Die Ordnungszahl eines Belegs innerhalb seiner Art — oder `null` (TG-F5).
 *
 * Sie ordnet mehrere Belege derselben Art (ein Etikett je Paket) und macht ihre Rückfallnamen
 * unterscheidbar. Sie ist KEINE Paketnummer und wird nie als solche angezeigt.
 */
export function documentOrdinal(doc) {
  const n = doc ? doc.ordinal : undefined;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : null;
}

// Eine Carrier-Sendungsnummer, wie sie auf dem Etikett steht: kurz und technisch. Dieselbe
// Formregel wie serverseitig — was sie nicht erfüllt, wird nicht gezeigt.
const CARRIER_REFERENCE_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$/;

/**
 * Die Carrier-Sendungsnummer eines Versandbelegs — oder `null` (TG-F5).
 *
 * Sie unterscheidet mehrere Etiketten derselben Sendung. Fehlt sie oder ist sie unbrauchbar,
 * entsteht KEIN Platzhalter.
 */
export function documentCarrierReference(doc) {
  const r = doc && typeof doc.carrierReference === "string" ? doc.carrierReference.trim() : "";
  return CARRIER_REFERENCE_RE.test(r) ? r : null;
}

/**
 * Die Serverantwort in stabil sortierte Gruppen übersetzen.
 *
 * Defensiv gegen jede Antwortform: fehlender Body, fehlendes Array, kaputte
 * Einträge. Es wird nichts ergänzt und nichts erfunden — eine leere Antwort
 * ergibt eine leere Liste, nicht eine Gruppe mit Platzhaltern.
 *
 * @returns {Array<{key:string, label:string, documents:Array}>}
 */
export function groupShipmentDocuments(body) {
  const roh = body && Array.isArray(body.documents) ? body.documents : [];
  const brauchbar = roh.filter((d) => d && typeof d === "object" && typeof d.type === "string" && d.type !== "");

  const eimer = new Map();
  for (const kategorie of CATEGORY_ORDER) eimer.set(kategorie, []);
  for (const doc of brauchbar) {
    const kategorie = typeof doc.category === "string" && CATEGORY_LABELS[doc.category] ? doc.category : OTHER_CATEGORY;
    if (!eimer.has(kategorie)) eimer.set(kategorie, []);
    eimer.get(kategorie).push(doc);
  }

  const reihenfolge = [...CATEGORY_ORDER, ...[...eimer.keys()].filter((k) => !CATEGORY_ORDER.includes(k))];
  const gruppen = [];
  for (const kategorie of reihenfolge) {
    const liste = eimer.get(kategorie) || [];
    if (liste.length === 0) continue; // leere Gruppe = keine Überschrift
    const sortiert = [...liste].sort((a, b) => {
      const ia = TYPE_ORDER.indexOf(a.type), ib = TYPE_ORDER.indexOf(b.type);
      // Unbekannte Typen ans Ende, untereinander in Serverreihenfolge.
      const art = (ia === -1 ? TYPE_ORDER.length : ia) - (ib === -1 ? TYPE_ORDER.length : ib);
      if (art !== 0) return art;
      // TG-F5: mehrere Belege DERSELBEN Art nach ihrer Ordnungszahl. Fehlt sie, bleibt die
      // Serverreihenfolge — es wird keine Reihenfolge erfunden.
      const oa = documentOrdinal(a), ob = documentOrdinal(b);
      return oa !== null && ob !== null ? oa - ob : 0;
    });
    gruppen.push({
      key: kategorie,
      label: CATEGORY_LABELS[kategorie] || OTHER_CATEGORY_LABEL,
      documents: sortiert,
    });
  }
  return gruppen;
}

/** Entsteht gerade noch mindestens ein Beleg? Nur dann wird nachgeladen. */
export function hasProcessingDocument(gruppen) {
  if (!Array.isArray(gruppen)) return false;
  return gruppen.some((g) => Array.isArray(g.documents)
    && g.documents.some((d) => documentViewState(d) === DOC_STATUS.PROCESSING));
}

// ─── Sichtbare Texte ─────────────────────────────────────────────────────────
// Alles, was der Kunde liest, steht hier — nicht im JSX. Kein Fehlercode, kein
// Codepunkt, kein Status, kein Providername, keine interne ID.
export const DOCUMENTS_TEXT = {
  title: "Dokumente",
  action: "Dokumente",
  close: "Dokumente schließen",
  loading: "Dokumente werden geladen …",
  empty: "Für diese Sendung sind derzeit keine Dokumente verfügbar.",
  loadError: "Dokumente konnten derzeit nicht geladen werden.",
  retry: "Erneut versuchen",
  download: "Herunterladen",
  downloading: "Wird geladen …",
  processing: "Wird erstellt …",
  failed: "Derzeit nicht verfügbar",
};

// Texte des Downloadversuchs. Kuratiert nach Fehlercode; der Serverfreitext wird
// bewusst NICHT angezeigt (Auditbefund #3 des Labeldownloads: dort stand
// wortwörtlich „Fehler" im Kundenbanner).
export const DOCUMENT_DOWNLOAD_TEXT = {
  netz: "Das Dokument konnte nicht geladen werden. Bitte prüfen Sie Ihre Verbindung.",
  fehlt: "Dieses Dokument ist für diese Sendung nicht verfügbar.",
  nochNicht: "Das Dokument wird noch erstellt. Bitte versuchen Sie es in Kürze erneut.",
  zuViele: "Zu viele Anfragen. Bitte versuchen Sie es in einigen Minuten erneut.",
  allgemein: "Das Dokument konnte nicht geladen werden. Bitte versuchen Sie es später erneut.",
};

export function documentDownloadMessage(status, code) {
  if (typeof code === "string" && /_NOT_FOUND$/.test(code)) return DOCUMENT_DOWNLOAD_TEXT.fehlt;
  if (typeof code === "string" && /_NOT_READY$/.test(code)) return DOCUMENT_DOWNLOAD_TEXT.nochNicht;
  if (status === 404) return DOCUMENT_DOWNLOAD_TEXT.fehlt;
  if (status === 409) return DOCUMENT_DOWNLOAD_TEXT.nochNicht;
  if (status === 429) return DOCUMENT_DOWNLOAD_TEXT.zuViele;
  return DOCUMENT_DOWNLOAD_TEXT.allgemein;
}
