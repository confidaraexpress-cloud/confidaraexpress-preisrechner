import { useRef, useState } from "react";
import { partnerCreditNotePdfPath } from "../api/partnerApi";
import { downloadDocument } from "../utils/downloadDocument";
import {
  CREDIT_NOTE_DOWNLOAD_TEXT,
  creditNoteDownloadMessage,
  creditNoteFallbackFilename,
} from "../utils/salesPartnerCreditNotes.mjs";

/* PDF einer Gutschrift laden (Partnerportal): authentifizierter Blob-Abruf, kein Token in einer Adresse, nichts im
   Offline-Speicher. Gemeinsam für den Bereich „Gutschriften“ und die letzten Gutschriften der Übersicht — eine Stelle,
   ein Doppelklickschutz je Ansicht (inFlight), eine Fehlermeldung in Worten. */
export function useGutschriftDownload() {
  const [laedt, setLaedt] = useState(null);       // id der Gutschrift, deren PDF gerade lädt
  const [fehler, setFehler] = useState("");
  const inFlight = useRef(false);

  const herunterladen = async (cn) => {
    if (inFlight.current || !cn || cn.id === null) return;
    inFlight.current = true;
    setLaedt(cn.id);
    setFehler("");
    try {
      await downloadDocument(partnerCreditNotePdfPath(cn.id), {
        fallbackFilename: creditNoteFallbackFilename(cn.number),
        message: creditNoteDownloadMessage,
        errorText: CREDIT_NOTE_DOWNLOAD_TEXT,
      });
    } catch (e) {
      setFehler(e && typeof e.message === "string" && e.message ? e.message : CREDIT_NOTE_DOWNLOAD_TEXT.allgemein);
    } finally {
      inFlight.current = false;
      setLaedt(null);
    }
  };

  return { laedt, fehler, herunterladen };
}
