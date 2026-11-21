// Rechnungseditor (2026-11-21): zeichnet das echte Rechnungs-PDF des Servers mit pdf.js auf Canvas.
//
// • pdf.js wird erst beim ersten Blatt geladen (dynamischer Import → eigener Abschnitt, nicht im Hauptbündel).
// • Der Worker ist eine Datei vom eigenen Ursprung (CSP worker-src 'self'; im Build als .js, siehe vite.config.js).
//   Ein einziger Worker dient allen Blättern der Sitzung — er wird nicht bei jeder Vorschau neu gestartet.
// • pdf.js 6 kommt ohne eval und new Function aus; die CSP bleibt ohne 'unsafe-eval'
//   (Prüfung src/utils/manualInvoiceEditor.test.mjs).
// • Gezeichnet wird in Canvas außerhalb des Dokuments; die Seite tauscht erst, wenn alle Seiten fertig sind — so
//   flackert das Blatt beim Tippen nicht.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

let pdfjsLaden = null;
let werker = null;

export function ladePdfjs() {
  if (!pdfjsLaden) {
    pdfjsLaden = import("pdfjs-dist")
      .then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        return pdfjs;
      })
      .catch((e) => {
        pdfjsLaden = null;
        throw e;
      });
  }
  return pdfjsLaden;
}

function gemeinsamerWerker(pdfjs) {
  if (!werker || werker.destroyed) werker = new pdfjs.PDFWorker({ name: "ce-rechnungsblatt" });
  return werker;
}

// bytes: Uint8Array des PDFs (wird an den Worker übergeben — Aufrufer reichen eine Kopie).
// breite: Anzeigebreite einer Seite in CSS-Pixeln; pixelRatio: Bildschirmdichte (gedeckelt durch den Aufrufer).
// → Array von Canvas-Elementen (eine je Seite) oder null, wenn abgebrochen.
export async function zeichnePdf(bytes, { breite, pixelRatio = 1, abbruch = null } = {}) {
  const pdfjs = await ladePdfjs();
  if (abbruch && abbruch.aborted) return null;
  const aufgabe = pdfjs.getDocument({ data: bytes, worker: gemeinsamerWerker(pdfjs), stopAtErrors: true, enableXfa: false });
  try {
    const dokument = await aufgabe.promise;
    const seiten = [];
    for (let nr = 1; nr <= dokument.numPages; nr += 1) {
      if (abbruch && abbruch.aborted) return null;
      const seite = await dokument.getPage(nr);
      const basis = seite.getViewport({ scale: 1 });
      const skala = Math.max(0.5, Math.min(4, (breite * pixelRatio) / basis.width));
      const ansicht = seite.getViewport({ scale: skala });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(ansicht.width);
      canvas.height = Math.ceil(ansicht.height);
      await seite.render({ canvas, viewport: ansicht }).promise;
      seite.cleanup();
      seiten.push(canvas);
    }
    return seiten;
  } finally {
    aufgabe.destroy();
  }
}
