/* Zusatzoptionen im Entwurf — Wiederherstellung 1:1.
   =============================================================================
   Drei Lücken schließt dieses Paket, und dieser Test hält alle drei fest:

     P2-A  Das gebuchte Labelformat wurde nirgends festgehalten (Backendtest).
     P2-B  Ein Reload verlor die vier Optionen, weil der Schalterzustand nur
           abgeleitet und nie mitgeführt wurde.
     P2-C  „Als Entwurf speichern“ speicherte die vier Optionen gar nicht, und ein
           Sendungsentwurf ließ sich überhaupt nicht wieder öffnen.

   Die tragende Invariante über allem: AUS heißt LEER. Ein ausgeschalteter Schalter
   darf nie einen versteckten Wert mitführen, der später doch wirksam wird — weder im
   Entwurf noch im laufenden Vorgang noch im /book-Payload.

   Das gerenderte Verhalten prüft tests/e2e/draftBookingOptions.test.mjs. */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DRAFT_LABEL_FORMATS, DEFAULT_LABEL_FORMAT, DRAFT_REFERENCE_MAX_LENGTH,
  emptyDraftBookingOptions, buildDraftBookingOptions, draftBookingOptionsToFlow,
  hasAnyDraftBookingOption,
} from "./draftBookingOptions.mjs";
import { BOOKING_KEYS, normalizeBooking } from "./shippingFlowState.mjs";
import { buildShipmentEmailPayload } from "./shipmentEmailOptions.mjs";
import {
  isValidResumeDraft, isValidShipmentResumeDraft, isAnyResumeDraft,
  buildResumePayload, buildShipmentResumePayload, resumeSourceFromDraft,
  FORM_DRAFT_KIND, SHIPMENT_DRAFT_KIND,
} from "./formDraftsView.mjs";

const lies = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const bookingPage     = lies("../pages/BookingPage.jsx");
const newShipmentPage = lies("../pages/NewShipmentPage.jsx");
const draftsPage      = lies("../pages/DraftsPage.jsx");
const saveDraftAction = lies("../components/booking/SaveDraftAction.jsx");
const draftsList      = lies("../components/drafts/DraftsList.jsx");
const desktopRow      = lies("../components/drafts/DraftDesktopRow.jsx");
const draftCard       = lies("../components/drafts/DraftCard.jsx");
const client          = lies("../api/client.js");

/* ══════════ 1 — Der Erbauer: AUS heißt LEER ══════════════════════════════ */

test("1 — ein ausgeschalteter Schalter speichert NIEMALS einen Wert", () => {
  const o = buildDraftBookingOptions({
    referenceEnabled: false,          reference: "GEHEIM-4711",
    trackingEmailEnabled: false,      trackingEmail: "fremd@example.com",
    labelTrackingEmailEnabled: false, labelTrackingEmail: "auch-fremd@example.com",
    labelFormatEnabled: false,        labelFormat: "A6",
  });
  assert.equal(o.reference.value, "");
  assert.equal(o.trackingEmail.value, "");
  assert.equal(o.labelTrackingEmail.value, "");
  // Beim Format ist „aus“ nicht Weglassen, sondern der Standard: A6 hinter einem
  // ausgeschalteten Regler würde beim Fortsetzen unsichtbar wieder gelten.
  assert.equal(o.labelFormat.value, DEFAULT_LABEL_FORMAT);
  const serialisiert = JSON.stringify(o);
  for (const leck of ["GEHEIM-4711", "fremd@example.com", "auch-fremd@example.com", "A6"]) {
    assert.ok(!serialisiert.includes(leck), `${leck} steht noch im Entwurf`);
  }
});

test("2 — „an, aber noch leer“ ist ein eigener, unterscheidbarer Zustand", () => {
  // Genau dieser Fall ist der Grund, warum die Stellung überhaupt mitgeführt wird:
  // am WERT sind „Option an, Feld leer“ und „Option aus“ nicht zu unterscheiden.
  const an  = buildDraftBookingOptions({ referenceEnabled: true,  reference: "" });
  const aus = buildDraftBookingOptions({ referenceEnabled: false, reference: "" });
  assert.deepEqual(an.reference,  { enabled: true,  value: "" });
  assert.deepEqual(aus.reference, { enabled: false, value: "" });
  assert.notDeepEqual(an, aus, "beide Zustände sähen im Entwurf identisch aus");
  // Dasselbe beim Format: „ändern an, A4 gewählt“ ≠ „ändern aus“.
  const fmtAn  = buildDraftBookingOptions({ labelFormatEnabled: true,  labelFormat: "A4" });
  const fmtAus = buildDraftBookingOptions({ labelFormatEnabled: false, labelFormat: "A4" });
  assert.equal(fmtAn.labelFormat.enabled, true);
  assert.equal(fmtAus.labelFormat.enabled, false);
  assert.equal(fmtAn.labelFormat.value, fmtAus.labelFormat.value, "der Wert allein trennt sie nicht");
});

test("3 — ein unbekanntes Format wird nie durchgereicht", () => {
  for (const boese of ["A5", "a4-quer", "", null, 4, {}]) {
    const o = buildDraftBookingOptions({ labelFormatEnabled: true, labelFormat: boese });
    assert.ok(DRAFT_LABEL_FORMATS.includes(o.labelFormat.value), `${JSON.stringify(boese)} kam durch`);
  }
  assert.deepEqual(DRAFT_LABEL_FORMATS, ["A4", "A6"], "es gibt genau zwei Formate");
});

test("4 — die Referenz wird auf die Backendgrenze gekürzt", () => {
  const o = buildDraftBookingOptions({ referenceEnabled: true, reference: "X".repeat(90) });
  assert.equal(o.reference.value.length, DRAFT_REFERENCE_MAX_LENGTH);
  assert.equal(DRAFT_REFERENCE_MAX_LENGTH, 35, "muss JUMiNGO details.reference_number spiegeln");
});

test("5 — der leere Ausgangszustand ist der einzige Nullzustand", () => {
  assert.deepEqual(emptyDraftBookingOptions(), buildDraftBookingOptions({}));
  assert.deepEqual(emptyDraftBookingOptions(), buildDraftBookingOptions());
});

/* ══════════ 2 — Der Rückweg: 1:1 und ohne Wiederbelebung ═════════════════ */

test("6 — Speichern → Lesen stellt jede Kombination exakt wieder her", () => {
  // Der Kern der Zusage aus dem Abschlusspaket: „alle Werte und Schalter identisch“.
  const faelle = [
    { referenceEnabled: true,  reference: "CE-REF-1", trackingEmailEnabled: true,  trackingEmail: "a@b.de",
      labelTrackingEmailEnabled: true, labelTrackingEmail: "c@d.de", labelFormatEnabled: true, labelFormat: "A6" },
    { referenceEnabled: true,  reference: "",         trackingEmailEnabled: true,  trackingEmail: "",
      labelTrackingEmailEnabled: false, labelTrackingEmail: "",     labelFormatEnabled: true, labelFormat: "A4" },
    { referenceEnabled: false, reference: "",         trackingEmailEnabled: false, trackingEmail: "",
      labelTrackingEmailEnabled: false, labelTrackingEmail: "",     labelFormatEnabled: false, labelFormat: "A4" },
  ];
  for (const fall of faelle) {
    const zurueck = draftBookingOptionsToFlow(buildDraftBookingOptions(fall));
    for (const k of Object.keys(fall)) {
      assert.equal(zurueck[k], fall[k], `${k} kam nicht 1:1 zurück (${JSON.stringify(fall)})`);
    }
  }
});

test("7 — ein Wert hinter einem ausgeschalteten Schalter wird beim Lesen verworfen", () => {
  // Ein von Hand veränderter oder aus einer älteren Fassung stammender Entwurf darf einen
  // Wert nicht unsichtbar zurückbringen — dieselbe Regel wie beim Schreiben, zweite Schicht.
  const zurueck = draftBookingOptionsToFlow({
    reference:          { enabled: false, value: "GEHEIM" },
    trackingEmail:      { enabled: false, value: "fremd@example.com" },
    labelTrackingEmail: { enabled: false, value: "fremd2@example.com" },
    labelFormat:        { enabled: false, value: "A6" },
  });
  assert.equal(zurueck.reference, "");
  assert.equal(zurueck.trackingEmail, "");
  assert.equal(zurueck.labelTrackingEmail, "");
  assert.equal(zurueck.labelFormat, "A4");
  for (const k of ["referenceEnabled", "trackingEmailEnabled", "labelTrackingEmailEnabled", "labelFormatEnabled"]) {
    assert.equal(zurueck[k], false);
  }
});

test("8 — beschädigte oder fehlende Formen ergeben den leeren Zustand, nie einen Fehler", () => {
  for (const kaputt of [null, undefined, "…", 7, [], { reference: "ja" }, { labelFormat: { enabled: true, value: "A5" } }]) {
    const z = draftBookingOptionsToFlow(kaputt);
    assert.equal(z.labelFormat, "A4", `${JSON.stringify(kaputt)} erzeugte ein anderes Format`);
    assert.equal(z.reference, "");
    assert.equal(z.referenceEnabled, false);
  }
});

test("9 — hasAnyDraftBookingOption beschreibt den Vorgang nur bei echtem Inhalt", () => {
  assert.equal(hasAnyDraftBookingOption(emptyDraftBookingOptions()), false);
  assert.equal(hasAnyDraftBookingOption(null), false);
  // „an, aber leer“ zählt: der Kunde hat den Bereich bewusst geöffnet.
  assert.equal(hasAnyDraftBookingOption(buildDraftBookingOptions({ referenceEnabled: true, reference: "" })), true);
  assert.equal(hasAnyDraftBookingOption(buildDraftBookingOptions({ labelFormatEnabled: true, labelFormat: "A4" })), true);
});

/* ══════════ 3 — Der Vorgang trägt die Stellung (P2-B) ════════════════════ */

test("10 — die vier Stellungen liegen additiv im Vorgangsschema", () => {
  for (const k of ["referenceEnabled", "trackingEmailEnabled", "labelTrackingEmailEnabled", "labelFormatEnabled"]) {
    assert.ok(BOOKING_KEYS.includes(k), `${k} fehlt in BOOKING_KEYS`);
  }
  // Die Werte selbst waren schon da und bleiben.
  for (const k of ["reference", "trackingEmail", "labelTrackingEmail", "labelFormat"]) {
    assert.ok(BOOKING_KEYS.includes(k));
  }
});

test("11 — ein Vorgang aus einem älteren Bundle verhält sich exakt wie vorher", () => {
  // Der entscheidende Punkt der additiven Erweiterung: kein Versionssprung, kein Verwerfen.
  const alt = normalizeBooking({ step: 2, reference: "R-1", labelFormat: "A6", trackingEmail: "a@b.de" });
  assert.equal(alt.referenceEnabled, false, "undefined muss zu false werden, nicht zu true");
  assert.equal(alt.labelFormatEnabled, false);
  assert.equal(alt.trackingEmailEnabled, false);
  // …und die vorhandenen WERTE bleiben unangetastet, damit die Ableitung sie weiterhin sichtbar macht.
  assert.equal(alt.reference, "R-1");
  assert.equal(alt.labelFormat, "A6");
  assert.equal(alt.trackingEmail, "a@b.de");
});

test("12 — die Stellung wird defensiv gelesen, nie roh übernommen", () => {
  for (const falsch of ["true", 1, "on", {}, []]) {
    const b = normalizeBooking({ referenceEnabled: falsch, labelFormatEnabled: falsch });
    assert.equal(b.referenceEnabled, false, `${JSON.stringify(falsch)} galt als an`);
    assert.equal(b.labelFormatEnabled, false);
  }
});

test("13 — ein vorhandener Wert öffnet seinen Bereich auch OHNE gespeicherte Stellung", () => {
  // Die Sicherheitseigenschaft der Oder-Kette in BookingPage, hier am Quelltext verankert:
  // ein gespeicherter Wert kann nie unsichtbar wirksam werden.
  const paare = [
    [/flowBooking\?\.referenceEnabled === true \|\| !!\(flowBooking\?\.reference \|\| ""\)\.trim\(\)/, "Referenz"],
    [/flowBooking\?\.trackingEmailEnabled === true \|\| !!\(flowBooking\?\.trackingEmail \|\| ""\)\.trim\(\)/, "Tracking-Adresse"],
    [/flowBooking\?\.labelTrackingEmailEnabled === true \|\| !!\(flowBooking\?\.labelTrackingEmail \|\| ""\)\.trim\(\)/, "Label-Adresse"],
    [/flowBooking\?\.labelFormatEnabled === true \|\| \(flowBooking\?\.labelFormat \|\| "A4"\) !== "A4"/, "Labelformat"],
  ];
  for (const [re, name] of paare) {
    assert.match(bookingPage, re, `${name}: die Wertableitung fehlt oder steht nicht als Oder-Zweig`);
  }
  // Keine Und-Verknüpfung: die würde einen vorhandenen Wert verbergen.
  assert.ok(!/Enabled === true &&/.test(bookingPage), "eine Und-Verknüpfung würde einen Wert verbergen");
});

test("14 — die Stellung wird gespiegelt, aber ein ausgeschalteter Wert nicht", () => {
  const eff = bookingPage.slice(bookingPage.indexOf("setFlowBooking({"), bookingPage.indexOf("const tariff = bookingData"));
  assert.match(eff, /referenceEnabled, trackingEmailEnabled, labelTrackingEmailEnabled, labelFormatEnabled,/,
    "die Schalterstellungen werden nicht gespiegelt — ein Reload verlöre sie wieder");
  // Und die Werte weiterhin nur bei aktiver Option (unveränderte Regel).
  assert.match(eff, /reference: referenceEnabled \? form\.reference : ""/);
  assert.match(eff, /trackingEmail: trackingEmailEnabled \? trackingEmail : ""/);
  assert.match(eff, /labelTrackingEmail: labelTrackingEmailEnabled \? labelTrackingEmail : ""/);
});

test("15 — die Stellung hat KEINE Buchungswirkung", () => {
  // Sie steht im Vorgang, aber in keinem /book-Payload: gebucht wird ein WERT, nie ein Schalter.
  // Der Payloadbauer der beiden Adressen sagt das als Erstes — er bekommt die Schalter, gibt
  // aber ausschließlich Adressen aus (eine vorhandene Adresse IST die Aktivierung, so der
  // Backendvertrag).
  const voll = buildShipmentEmailPayload({
    trackingEmailEnabled: true,      trackingEmail: "a@b.de",
    labelTrackingEmailEnabled: true, labelTrackingEmail: "c@d.de",
  });
  assert.deepEqual(Object.keys(voll).sort(), ["labelTrackingEmail", "trackingEmail"]);
  // Ausgeschaltet: gar kein Feld — kein `false`, das serverseitig gedeutet werden müsste.
  assert.deepEqual(buildShipmentEmailPayload({
    trackingEmailEnabled: false,      trackingEmail: "a@b.de",
    labelTrackingEmailEnabled: false, labelTrackingEmail: "c@d.de",
  }), {});

  // Und im Payloadliteral selbst taucht kein Schalter mehr auf, nachdem die beiden legitimen
  // Verwendungen entfernt sind: die Übergabe an den Payloadbauer und die Referenz-Bedingung.
  const start = bookingPage.indexOf("const doBook");
  const payload = bookingPage.slice(start, start + 9000)
    .replace(/buildShipmentEmailPayload\(\{[\s\S]*?\}\)/g, "")
    .replace(/referenceEnabled && form\.reference\.trim\(\)/g, "");
  for (const k of ["referenceEnabled", "trackingEmailEnabled", "labelTrackingEmailEnabled", "labelFormatEnabled"]) {
    assert.ok(!payload.includes(k), `${k} steht im Buchungspayload`);
  }
});

/* ══════════ 4 — Entwurf speichern und fortsetzen (P2-C) ══════════════════ */

test("16 — „Als Entwurf speichern“ bekommt alle vier Optionen mit", () => {
  assert.match(bookingPage, /import \{ buildDraftBookingOptions \} from "\.\.\/utils\/draftBookingOptions\.mjs"/);
  const aufruf = bookingPage.slice(bookingPage.indexOf("<SaveDraftAction"), bookingPage.indexOf("<SaveDraftAction") + 1400);
  assert.match(aufruf, /bookingOptions=\{buildDraftBookingOptions\(\{/,
    "die Aufrufstelle reicht die Optionen nicht durch");
  for (const feld of ["referenceEnabled", "trackingEmailEnabled", "labelTrackingEmailEnabled", "labelFormatEnabled",
                      "reference: form.reference", "trackingEmail", "labelTrackingEmail", "labelFormat"]) {
    assert.ok(aufruf.includes(feld), `${feld} fehlt am Aufruf`);
  }
  // Die Invariante wird im Erbauer erzwungen, nicht an der Aufrufstelle: sonst müsste sie
  // an jeder künftigen Aufrufstelle erneut bedacht werden.
  assert.ok(!/referenceEnabled \? form\.reference/.test(aufruf),
    "die Aufrufstelle baut die Invariante selbst nach");
});

test("17 — die Komponente sendet die Optionen weiter, ohne sie zu deuten", () => {
  assert.match(saveDraftAction, /\{ shipmentId, bookingOptions, onNavigateDrafts, onSaved \}/);
  assert.match(saveDraftAction, /saveDraft\(shipmentId, bookingOptions\)/);
  // Kein zweites Regelwerk in der Komponente.
  assert.ok(!/A4|A6|enabled:/.test(saveDraftAction), "die Komponente kennt Optionsdetails");
});

test("18 — der Client sendet den Block nur, wenn der Aufrufer ihn kennt", () => {
  // Anker mit „(id“: „export function saveDraft“ allein trifft zuerst saveDraftPickupWindow.
  const start = client.indexOf("export function saveDraft(id");
  const fn = client.slice(start, start + 500);
  assert.match(fn, /bookingOptions/);
  // Ein älterer Aufrufer (ohne Block) darf keinen leeren Entwurfszustand schreiben.
  assert.match(fn, /bookingOptions === undefined|typeof bookingOptions|bookingOptions \?/,
    "der Block wird bedingungslos gesendet");
  assert.match(client, /export function getShipmentDraft/);
  assert.match(client, /\/api\/kunde\/drafts\/\$\{encodeURIComponent\(String\(id\)\)\}/);
});

test("19 — ein Sendungsentwurf ist ein eigener Resume-Payload ohne Formularentwurfs-Metadaten", () => {
  const p = buildShipmentResumePayload({ id: 42, formData: { sender: {} }, bookingOptions: emptyDraftBookingOptions() });
  assert.equal(p.kind, SHIPMENT_DRAFT_KIND);
  assert.equal(p.sourceShipmentDraftId, 42);
  assert.equal(isValidShipmentResumeDraft(p), true);
  // Er ist KEIN Formularentwurf: keine Revision, kein serverseitiger Verbrauch.
  assert.equal(isValidResumeDraft(p), false, "ein Sendungsentwurf gilt als Formularentwurf");
  assert.equal(resumeSourceFromDraft(p), null, "es entstünde ein calculate-price-Quellbezug");
  assert.equal(p.sourceFormDraftId, undefined);
  assert.equal(p.sourceFormDraftRevision, undefined);
  // Und umgekehrt bleibt der Formularentwurf, was er war.
  const f = buildResumePayload({ id: 9, revision: 3, schemaVersion: 1, formData: {} });
  assert.equal(isValidShipmentResumeDraft(f), false);
  assert.equal(isValidResumeDraft(f), true);
  assert.deepEqual(resumeSourceFromDraft(f), { id: 9, revision: 3, schemaVersion: 1 });
  // Beide sind fortsetzbar — das ist die einzige gemeinsame Aussage.
  assert.equal(isAnyResumeDraft(p), true);
  assert.equal(isAnyResumeDraft(f), true);
  assert.equal(isAnyResumeDraft({ kind: FORM_DRAFT_KIND }), false);
});

test("20 — der Payload trägt keinen Preis, keinen Tarif und keine Providerreferenz", () => {
  const p = buildShipmentResumePayload({
    id: 42, formData: {}, bookingOptions: null,
    jumingoShipmentId: "s_" + "a".repeat(32), price_final: 12.72, selectedCarrier: "DPD", trackingNumber: "0735",
  });
  assert.deepEqual(Object.keys(p).sort(), ["bookingOptions", "formData", "kind", "sourceShipmentDraftId"]);
  const s = JSON.stringify(p);
  for (const leck of ["s_aaaa", "12.72", "DPD", "0735"]) {
    assert.ok(!s.includes(leck), `${leck} steht im Resume-Payload`);
  }
});

test("21 — beide Entwurfsarten laufen durch EINE Fortsetzen-Funktion", () => {
  const fn = draftsPage.slice(draftsPage.indexOf("const onResume = async"), draftsPage.indexOf("const items = useMemo"));
  assert.match(fn, /const isForm = draft\.kind === FORM_DRAFT_KIND/, "der Zweig hängt nicht am kind");
  assert.match(fn, /isForm \? await getFormDraft\(draft\.id\) : await getShipmentDraft\(draft\.id\)/);
  assert.match(fn, /isForm \? buildResumePayload\(d\?\.draft\) : buildShipmentResumePayload\(d\?\.draft\)/);
  assert.match(fn, /isForm \? isValidResumeDraft\(payload\) : isValidShipmentResumeDraft\(payload\)/);
  // Getrennte Namensräume: form:7 ≠ shipment:7 — der Zweig darf nie an der id hängen.
  assert.ok(!/draft\.id > |Number\(draft\.id\)/.test(fn), "die Art wird aus der id geraten");
  // Und ein 404 entfernt die Zeile aus der RICHTIGEN Liste.
  assert.match(fn, /if \(isForm\) setFormItems/);
  assert.match(fn, /else setShipmentItems/);
});

test("22 — die Fortsetzen-Aktion steht bei beiden Entwurfsarten gleich", () => {
  for (const [datei, name] of [[desktopRow, "DraftDesktopRow"], [draftCard, "DraftCard"]]) {
    assert.match(datei, /\{ draft, busy, resuming, onDelete, onResume \}/, `${name}: Props fehlen`);
    assert.match(datei, /onClick=\{\(\) => onResume\(draft\)\}/, `${name}: kein Auslöser`);
    assert.match(datei, /disabled=\{anyBusy\}/, `${name}: kein Doppelklickschutz`);
    assert.match(datei, /Fortsetzen/, `${name}: keine Beschriftung`);
    // Löschen bleibt die sekundäre Aktion im Kebab — die Hierarchie ändert sich nicht.
    assert.match(datei, /<DraftActionsMenu draft=\{draft\} busy=\{busy\} disabled=\{resuming\}/, `${name}`);
  }
  // Und die Liste reicht beides an BEIDE Varianten durch.
  assert.equal((draftsList.match(/onResume=\{onResume\}/g) || []).length, 4,
    "nicht alle vier Zeilen-/Kartenvarianten bekommen die Aktion");
});

test("23 — der wiederhergestellte Zustand landet im Buchungsbereich, nicht im Formular", () => {
  const eff = newShipmentPage.slice(newShipmentPage.indexOf('if (!isValidShipmentResumeDraft(resumeDraft)) return;'),
                                    newShipmentPage.indexOf('if (!isValidShipmentResumeDraft(resumeDraft)) return;') + 400);
  assert.match(eff, /hasAnyDraftBookingOption\(resumeDraft\.bookingOptions\)/,
    "ein Entwurf ohne Optionen beschriebe den Vorgang grundlos");
  assert.match(eff, /setFlowBooking\(draftBookingOptionsToFlow\(resumeDraft\.bookingOptions\)\)/,
    "die Optionen werden nicht in den Buchungsbereich geschrieben");
});

test("24 — die Reihenfolge stimmt: erst leeren, DANN wiederherstellen", () => {
  // clearScope("shipment") setzt den Buchungsbereich mit zurück (ein Entwurf ersetzt den
  // Vorgang vollständig). Stünde die Wiederherstellung davor, wäre sie sofort wieder weg.
  const leeren = newShipmentPage.indexOf('clearFlowScope("shipment");');
  const setzen = newShipmentPage.indexOf("setFlowBooking(draftBookingOptionsToFlow(");
  assert.ok(leeren > -1 && setzen > -1);
  assert.ok(leeren < setzen,
    "die Wiederherstellung steht VOR dem Leeren — der Buchungsbereich wäre sofort wieder leer");
});

test("25 — beide Entwurfsarten rehydrieren das Formular über DIESELBE Funktion", () => {
  const init = newShipmentPage.slice(newShipmentPage.indexOf("const resumeInitRef = useRef(undefined);"),
                                     newShipmentPage.indexOf("const resumeInit = resumeInitRef.current;"));
  assert.match(init, /isValidResumeDraft\(resumeDraft\) \|\| isValidShipmentResumeDraft\(resumeDraft\)/);
  assert.equal((init.match(/buildResumeInitialState\(/g) || []).length, 1,
    "es gibt einen zweiten Rehydrationsweg");
  // Und weiterhin nur EIN Mount-once-Initialisierer — nie feldweise über upd().
  assert.match(newShipmentPage, /resumeInitRef\.current === undefined/);
});

/* ══════════ 5 — Was NICHT passieren darf ═════════════════════════════════ */

test("26 — es entsteht kein neuer Speicherweg im Browser", () => {
  // Gespeichert wird über die vorhandene Entwurfs- und Vorgangsinfrastruktur — kein zweites
  // System daneben. Kommentare zählen nicht: mehrere Stellen ERKLÄREN, dass der Vorgang seit
  // dem Nullzustandspaket nichts mehr in den sessionStorage spiegelt.
  const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  for (const [datei, name] of [[bookingPage, "BookingPage"], [newShipmentPage, "NewShipmentPage"],
                               [draftsPage, "DraftsPage"], [saveDraftAction, "SaveDraftAction"],
                               [lies("./draftBookingOptions.mjs"), "draftBookingOptions.mjs"]]) {
    assert.ok(!/localStorage|sessionStorage|indexedDB/.test(ohneKommentare(datei)),
      `${name}: eigener Speicher statt der vorhandenen Entwurfs-/Vorgangsinfrastruktur`);
  }
});

test("27 — das Frontend erfindet keine zweite Wertregel", () => {
  // Die Werte stehen an genau einer Stelle; Backend und Frontend müssen sie teilen, aber das
  // Backend bleibt maßgeblich (es normalisiert erneut).
  const modul = lies("./draftBookingOptions.mjs");
  for (const datei of [bookingPage, saveDraftAction, draftsPage]) {
    assert.ok(!/\["A4", ?"A6"\]/.test(datei), "eine zweite Formatliste");
  }
  assert.match(modul, /DRAFT_LABEL_FORMATS = Object\.freeze\(\["A4", "A6"\]\)/);
});

test("28 — kein Preis, kein Tarif und keine Providerreferenz im Entwurfszustand", () => {
  const modul = lies("./draftBookingOptions.mjs");
  for (const verboten of ["price", "tariff", "carrier", "jumingo", "voucher", "insurance"]) {
    assert.ok(!new RegExp(verboten, "i").test(modul.replace(/\/\*[\s\S]*?\*\//g, "")),
      `${verboten} gehört nicht in den Entwurfszustand der Zusatzoptionen`);
  }
});
