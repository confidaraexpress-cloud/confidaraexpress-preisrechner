/* Entwurfszustand der „Zusätzlichen Optionen" — reine Logik.
   =============================================================================
   Die vier Schalter der Buchungsseite (Referenznummer, die beiden Zusatzempfänger,
   Labeldruckformat) sollen einen gespeicherten Entwurf überleben. Bis dahin gingen
   sie beim Speichern verloren: der Sendungsentwurf hielt nur Adressen, Paket und
   Versanddatum, und die Optionen lebten ausschließlich im Arbeitsspeicher.

   Dieses Modul ist die EINE Übersetzung zwischen beiden Welten:

     Buchungsseite  ──buildDraftBookingOptions──▶  Entwurf (Server)
     Entwurf        ──draftBookingOptionsToFlow──▶ laufender Vorgang

   Die Form ist identisch zum Backendvertrag (lib/draftBookingOptions.js). Sie wird
   hier NICHT zweitverwaltet: das Backend normalisiert erneut und ist maßgeblich —
   dieses Modul verhindert nur, dass eine offensichtlich unbrauchbare Form überhaupt
   erst abgeschickt wird.

   ── Die tragende Invariante ────────────────────────────────────────────────
   AUS heißt LEER. Ein abgeschalteter Schalter wird immer mit leerem Wert
   gespeichert (Labelformat: mit dem Standard A4). Damit kann ein Entwurfswert
   niemals unsichtbar wieder wirksam werden, und die Adresse eines Dritten liegt
   nicht auf dem Server, wenn die Option ausgeschaltet ist.

   Der Schalterzustand wird trotzdem eigenständig mitgeführt, weil er nicht aus dem
   Wert ableitbar ist: „Option an, Feld noch leer" und „Option aus" sähen sonst
   gleich aus — ebenso „Format ändern an, aber A4 gewählt". Für die Buchung ist
   beides bedeutungslos, für die Wiederherstellung des Formulars nicht. */

export const DRAFT_LABEL_FORMATS = Object.freeze(["A4", "A6"]);
export const DEFAULT_LABEL_FORMAT = "A4";
export const DRAFT_REFERENCE_MAX_LENGTH = 35;
export const DRAFT_EMAIL_MAX_LENGTH = 255;

const str = (v) => (typeof v === "string" ? v : "");
const on = (v) => v === true;

/** Leerer Ausgangszustand — alle Schalter aus, Standardformat. */
export function emptyDraftBookingOptions() {
  return {
    reference:          { enabled: false, value: "" },
    trackingEmail:      { enabled: false, value: "" },
    labelTrackingEmail: { enabled: false, value: "" },
    labelFormat:        { enabled: false, value: DEFAULT_LABEL_FORMAT },
  };
}

/* Buchungsseite → Entwurfsform.
   Erwartet genau die Zustände, die BookingPage ohnehin führt. Die Invariante „aus
   heißt leer" wird hier durchgesetzt, nicht beim Aufrufer — sonst müsste sie an
   jeder Aufrufstelle erneut bedacht werden. */
export function buildDraftBookingOptions({
  referenceEnabled, reference,
  trackingEmailEnabled, trackingEmail,
  labelTrackingEmailEnabled, labelTrackingEmail,
  labelFormatEnabled, labelFormat,
} = {}) {
  const refOn = on(referenceEnabled);
  const trkOn = on(trackingEmailEnabled);
  const lblOn = on(labelTrackingEmailEnabled);
  const fmtOn = on(labelFormatEnabled);
  const fmt = str(labelFormat).trim().toUpperCase();
  return {
    reference:          { enabled: refOn, value: refOn ? str(reference).trim().slice(0, DRAFT_REFERENCE_MAX_LENGTH) : "" },
    trackingEmail:      { enabled: trkOn, value: trkOn ? str(trackingEmail).trim().slice(0, DRAFT_EMAIL_MAX_LENGTH) : "" },
    labelTrackingEmail: { enabled: lblOn, value: lblOn ? str(labelTrackingEmail).trim().slice(0, DRAFT_EMAIL_MAX_LENGTH) : "" },
    // Anders als die drei übrigen ist A4 ein aktiv gesendeter Wert und kein Weglassen:
    // ausgeschaltet gilt wieder der Standard, nicht das zuletzt gewählte A6.
    labelFormat:        { enabled: fmtOn, value: fmtOn && DRAFT_LABEL_FORMATS.includes(fmt) ? fmt : DEFAULT_LABEL_FORMAT },
  };
}

/* Entwurfsform → Buchungsteil des laufenden Vorgangs.
   Das Ergebnis geht unverändert in `setFlowBooking` und wird von BookingPage beim
   Mount gelesen. Defensiv gegen alles, was ein älterer oder beschädigter Entwurf
   liefern könnte: unbekannte Formen ergeben den leeren Ausgangszustand, nie einen
   Renderfehler und nie einen erfundenen Wert. */
export function draftBookingOptionsToFlow(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const block = (key) => (src[key] && typeof src[key] === "object" && !Array.isArray(src[key]) ? src[key] : {});
  const ref = block("reference");
  const trk = block("trackingEmail");
  const lbl = block("labelTrackingEmail");
  const fmt = block("labelFormat");
  const fmtValue = str(fmt.value).trim().toUpperCase();
  const fmtOn = on(fmt.enabled);
  return {
    // Werte: nur bei aktiver Option — dieselbe Regel wie beim Speichern. Ein Entwurf,
    // der (etwa durch eine ältere Fassung) doch einen Wert hinter einem ausgeschalteten
    // Schalter trüge, verliert ihn hier, statt ihn unsichtbar zurückzubringen.
    reference:          on(ref.enabled) ? str(ref.value).slice(0, DRAFT_REFERENCE_MAX_LENGTH) : "",
    trackingEmail:      on(trk.enabled) ? str(trk.value).slice(0, DRAFT_EMAIL_MAX_LENGTH) : "",
    labelTrackingEmail: on(lbl.enabled) ? str(lbl.value).slice(0, DRAFT_EMAIL_MAX_LENGTH) : "",
    labelFormat:        fmtOn && DRAFT_LABEL_FORMATS.includes(fmtValue) ? fmtValue : DEFAULT_LABEL_FORMAT,
    // Schalterstellungen: der Teil, den der Wert allein nicht ausdrücken kann.
    referenceEnabled:          on(ref.enabled),
    trackingEmailEnabled:      on(trk.enabled),
    labelTrackingEmailEnabled: on(lbl.enabled),
    labelFormatEnabled:        fmtOn,
  };
}

/* Trägt ein Entwurf überhaupt eine abweichende Einstellung?
   Nur dafür da, den Vorgang nicht ohne Not zu beschreiben — ein Entwurf ohne
   Zusatzoptionen soll den laufenden Vorgang nicht mit lauter Standardwerten füllen. */
export function hasAnyDraftBookingOption(raw) {
  const f = draftBookingOptionsToFlow(raw);
  return f.referenceEnabled || f.trackingEmailEnabled || f.labelTrackingEmailEnabled || f.labelFormatEnabled;
}
