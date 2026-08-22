import React, { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useDialog } from "../hooks/useDialog";
import { useShippingFlow } from "../context/ShippingFlowContext";
import { packageSummaryLine } from "../utils/newShipmentForm.mjs";
import { bookingBillingNotice } from "../utils/billingModeView.mjs";
import { apiFetch, repriceInsurance, saveDraftPickupWindow, checkVoucher } from "../api/client";
import { FormAlert } from "../components/ui/FormAlert";
import { mapBookRestError, mapBookThrownError, mapBookUnreadableSuccess } from "../utils/bookingErrors.mjs";
import { Icon } from "../components/ui/Icon";
import { countries } from "../utils/countries";
import { money } from "../utils/formatters";
import { publicCarrierDisplay, publicServiceName, publicDropoffLabel } from "../utils/carrierMap";
import { downloadLabel } from "../utils/downloadLabel";
import { useAuth } from "../context/AuthContext";
import { getBookingModules } from "../utils/bookingModules";
import { pickupWindowBlocksBooking, formatDuration } from "../utils/pickupWindowClient";
import { buildCustomsInvoiceMeta } from "../utils/customsInvoiceMeta";
import { PROFORMA, COMMERCIAL, isCommercialOnly, resolveInvoiceMode, canSelectProforma, customsInvoiceFieldsValid, commercialInvoiceMutationBusy } from "../utils/customsInvoiceMode";
import { useCommercialInvoice } from "../hooks/useCommercialInvoice";
import { OfferSummaryModule } from "../components/booking/OfferSummaryModule";
import { DropoffNoticeModule } from "../components/booking/DropoffNoticeModule";
import { PickupWindowModule } from "../components/booking/PickupWindowModule";
import { SaveDraftAction } from "../components/booking/SaveDraftAction";
import { ShipmentSummaryModule } from "../components/booking/ShipmentSummaryModule";
import { AdditionalOptionsModule } from "../components/booking/AdditionalOptionsModule";
import { CustomsModule } from "../components/booking/CustomsModule";
import { InsuranceModule } from "../components/booking/InsuranceModule";
import { PriceSummaryModule } from "../components/booking/PriceSummaryModule";
import { BookingLiveSummary } from "../components/booking/BookingLiveSummary";
import { BookingStickySummary } from "../components/booking/BookingStickySummary";
import { TermsModule } from "../components/booking/TermsModule";
import { BookingActionModule } from "../components/booking/BookingActionModule";
import { VoucherModule } from "../components/booking/VoucherModule";
import { useLegalBookingContext } from "../hooks/useLegalBookingContext";
import {
  legalGateBlocks, legalBookingPayload, isLegalSetChanged,
  legalSetChangedBetween, LEGAL_SET_CHANGED_TEXT,
} from "../utils/legalBookingView.mjs";
import {
  VOUCHER_STATUS, readVoucherResponse, voucherPriceLines,
  voucherInvalidationKey, shouldInvalidateVoucher, normalizeVoucherInput,
} from "../utils/voucherView.mjs";
import {
  buildBookingPriceView, priceViewBlocksBooking, insuranceCardPrice,
  autofillInsuranceValue, goodsExceedsInsuranceMax, INSURANCE_VALUE_MAX, PRICE_STATUS,
} from "../utils/bookingPriceView.mjs";
import {
  INVOICE_DELIVERY_MODE, INVOICES_DASHBOARD_TARGET, resolveInvoiceDeliveryMode, isTerminalDeliveryMode,
  findInvoiceByNumber, invoiceDeliveryHint, BOOKING_CONFIRMATION_LINE, INVOICE_AUTOCREATE_LINE,
} from "../utils/bookingSuccessView.mjs";
import { NUMBER_LABELS } from "../utils/businessNumbers.mjs";
import { shipmentEmailError, buildShipmentEmailPayload } from "../utils/shipmentEmailOptions.mjs";
import { showsExternalDeliveryNoteField, DELIVERY_NOTE_TEXT } from "../utils/profileView.mjs";
import { downloadDeliveryNote } from "../utils/downloadDeliveryNote";
import { downloadOrderConfirmation } from "../utils/downloadOrderConfirmation";
import { CopyableNumber } from "../components/ui/CopyableNumber";
import { nextRefreshDelay } from "../utils/invoiceView.mjs";

// Serverseitige /book-Guard-Codes der Zollrechnung → klare deutsche Meldungen
// (keine Backend-Rohtexte/Stacks). Verhalten je Code steuert doBook (zurück zum
// Customs-Schritt, ggf. commercial erzwingen, genau EIN Status-GET).
const COMMERCIAL_INVOICE_BOOK_ERRORS = {
  COMMERCIAL_INVOICE_METADATA_INCOMPLETE: "Rechnungsnummer und Rechnungsdatum müssen gemeinsam angegeben werden.",
  COMMERCIAL_INVOICE_METADATA_REQUIRED: "Bei gewerblichen Waren sind Rechnungsnummer und Rechnungsdatum erforderlich.",
  COMMERCIAL_INVOICE_DOCUMENT_REQUIRED: "Für die eigene Handelsrechnung muss zuerst eine PDF erfolgreich hinterlegt werden.",
  COMMERCIAL_INVOICE_MODE_CONFLICT: "Für diese Sendung ist noch eine eigene Handelsrechnung hinterlegt. Entfernen Sie diese oder vervollständigen Sie die Angaben zur Handelsrechnung.",
};

export default function BookingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { state: navState } = useLocation();

  // ── Quelle des Vorgangs, in dieser Reihenfolge ─────────────────────────────
  //   1. location.state       — der reguläre Handoff aus „Neue Sendung".
  //                             Bleibt unverändert bestehen: React Router legt
  //                             ihn in history.state.usr ab, wodurch Reload und
  //                             Browser-Vorwärts schon bisher funktionierten.
  //   2. ShippingFlowContext  — der laufende Vorgang. Greift, wenn diese Seite
  //                             ohne state erreicht wird (z. B. Browser-Vorwärts
  //                             nach einem Provider-Neuaufbau).
  //   3. sicherer leerer Zustand — „Kein Angebot ausgewählt", unverändert.
  const { shipment: flowShipment, booking: flowBooking, setBooking: setFlowBooking,
          setStep: setFlowStep, clearFlow } = useShippingFlow();
  const bookingData = useMemo(() => {
    if (navState?.tariff) return navState;
    if (flowShipment?.selected && flowShipment.shipmentId != null) {
      return {
        tariff: flowShipment.selected,
        shipmentId: flowShipment.shipmentId,
        // Der CE-Sendungshandle muss auch auf diesem Weg mitkommen, sonst
        // verschwände „Als Entwurf speichern" nach einem Reload/Browser-Vorwärts.
        ceShipmentId: flowShipment.ceShipmentId ?? null,
        form: flowShipment.form,
        customs: flowShipment.customs,
      };
    }
    return navState || null;
  }, [navState, flowShipment]);

  // Schritt 1 oder 2 aus dem laufenden Vorgang; Schritt 3 (Erfolgsbildschirm)
  // wird NIE wiederhergestellt — er gehört zu einer abgeschlossenen Buchung.
  const [step, setStep] = useState(() => (flowBooking?.step === 2 ? 2 : 1));
  // Kundengewähltes Abholzeitfenster (nur Pickup) — im Seiten-State, damit die Auswahl den
  // Schrittwechsel übersteht; die Draft-Persistenz übernimmt PickupWindowModule. {from,until}|null.
  const [pickupWindow, setPickupWindow] = useState(null);
  // P0: Hydrierungsstatus des gespeicherten Abholfensters, vom PickupWindowModule gemeldet —
  // blockiert die Buchung, solange geladen wird ODER ein Ladefehler vorliegt. pickupWindowChanged
  // hält die /book-409-Antwort (neue frische Carrier-Grenzen) für den Spezialdialog.
  const [pickupHydration, setPickupHydration] = useState({ loading: false, error: false });
  const [pickupWindowChanged, setPickupWindowChanged] = useState(null); // { availableFrom, availableUntil, minimumMinutes, adjustable } | null
  const [pickupResetting, setPickupResetting] = useState(false);
  const [pickupResetError, setPickupResetError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [booking, setBooking] = useState(null);
  const [agbAccepted, setAgbAccepted] = useState(false);
  // Separate Pflichtbestätigung „keine ausgeschlossenen Güter" (eigenständig,
  // ersetzt/schwächt die AGB-Bestätigung nicht). Reines Frontend-Buchungs-Gate.
  const [prohibitedGoodsAccepted, setProhibitedGoodsAccepted] = useState(false);
  // Legal-Buchungsschranke (Paket 4-B). Bei ausgeschalteter Schranke (Standard) liefert der
  // Server `enabled:false`, und alles Weitere verhält sich exakt wie vor diesem Paket.
  const { legalContext, reloadLegalContext } = useLegalBookingContext();
  // Wechselt das gültige Set, verfallen BEIDE Bestätigungen. Eine Zustimmung zu Fassung A ist
  // keine Zustimmung zu Fassung B — auch dann nicht, wenn der Wechsel still passiert, während
  // die Seite offen steht. Der Vergleich läuft über den zuletzt GESEHENEN Schlüssel; beim
  // ersten Laden gibt es keinen Vorgänger und damit auch nichts zurückzusetzen.
  const gesehenerSetKey = useRef(null);
  useEffect(() => {
    const vorher = { setKey: gesehenerSetKey.current };
    if (legalSetChangedBetween(vorher, legalContext)) {
      setAgbAccepted(false);
      setProhibitedGoodsAccepted(false);
    }
    if (legalContext.setKey) gesehenerSetKey.current = legalContext.setKey;
  }, [legalContext]);
  // Blockiert die Schranke die Bestellung? Nur solange geladen wird oder der Kontext nicht
  // auslieferbar ist. Bei ausgeschalteter Schranke ist der Wert false — der bestehende
  // Gate-Vertrag bleibt damit unverändert.
  const legalBlocksBooking = legalGateBlocks(legalContext);
  const [prohibitedShowError, setProhibitedShowError] = useState(false);
  const [conflict, setConflict] = useState("");
  const [addressError, setAddressError] = useState("");
  const [labelLoading, setLabelLoading] = useState(false);
  const [labelError, setLabelError] = useState("");
  // Eigener Zustand für den Lieferschein: ein fehlgeschlagener Lieferscheindownload
  // darf die Labelmeldung nicht überschreiben und umgekehrt.
  const [deliveryNoteLoading, setDeliveryNoteLoading] = useState(false);
  const [deliveryNoteError, setDeliveryNoteError] = useState("");
  const [orderConfirmationLoading, setOrderConfirmationLoading] = useState(false);
  const [orderConfirmationError, setOrderConfirmationError] = useState("");
  // Rechnungs-Zustellungsmodus für den Erfolgsscreen — aus der Serverwahrheit der SOEBEN erzeugten
  // Rechnung abgeleitet (is_test_document + document_status), NICHT clientseitig geraten. Startet
  // neutral (PENDING) und wird kurz nachgeladen, bis das Dokument einen Endzustand erreicht.
  const [invoiceDeliveryMode, setInvoiceDeliveryMode] = useState(INVOICE_DELIVERY_MODE.PENDING);
  const invoiceModeTimerRef = useRef(null);

  // Auf dem Erfolgsscreen den Rechnungs-Zustellungsmodus auflösen: kurzes, gedeckeltes Nachladen der
  // BESTEHENDEN Kundenrechnungsliste (GET /kunde/invoices — keine neue/serverseitige Änderung),
  // Rechnung per Nummer finden und den Modus aus is_test_document/document_status ableiten. Stoppt,
  // sobald ein Endzustand (produktiv/Vorschau/fehlgeschlagen) erreicht ist oder die Backoff-Obergrenze
  // (≈ 2 Min) greift. Kein Einfluss auf Buchung/Rechnung/PDF/E-Mail. Timer wird bei Unmount/
  // Schrittwechsel vollständig bereinigt.
  useEffect(() => {
    if (step !== 3 || !booking || !booking.invoiceNumber) return undefined;
    let cancelled = false;
    let attempt = 0;
    const poll = async () => {
      try {
        const r = await apiFetch(`/kunde/invoices`, { auth: true });
        if (r.ok) {
          const d = await r.json().catch(() => ({}));
          const mode = resolveInvoiceDeliveryMode(findInvoiceByNumber(d.invoices, booking.invoiceNumber));
          if (cancelled) return;
          setInvoiceDeliveryMode(mode);
          if (isTerminalDeliveryMode(mode)) return; // fertig aufgelöst → nicht weiter nachladen
        }
      } catch { /* still bleiben — neutraler PENDING-Hinweis ist nie irreführend */ }
      if (cancelled) return;
      const delay = nextRefreshDelay(attempt);
      if (delay == null) return; // Obergrenze erreicht
      attempt += 1;
      invoiceModeTimerRef.current = setTimeout(poll, delay);
    };
    // Erster Versuch nach dem ersten Backoff-Intervall (das PDF wird nach dem Commit asynchron erzeugt).
    const first = nextRefreshDelay(attempt);
    attempt += 1;
    invoiceModeTimerRef.current = setTimeout(poll, first);
    return () => {
      cancelled = true;
      if (invoiceModeTimerRef.current) { clearTimeout(invoiceModeTimerRef.current); invoiceModeTimerRef.current = null; }
    };
  }, [step, booking]);

  // ── F3: Preisdrift OHNE Versicherung — /book 409 PRICE_CHANGED ──────────────
  // Der Backend-Gate im none-Pfad vergleicht price_final. Hat sich der Preis seit
  // der Angebotsberechnung geändert, antwortet /book mit 409
  // { code:"PRICE_CHANGED", oldPrice, newPrice }. `priceChange` steuert den
  // Premium-Dialog; `confirmedFinalPriceRef` hält den vom Nutzer bewusst
  // bestätigten neuen Preis, der beim erneuten /book als price_final gesendet
  // wird (ausschließlich none-Pfad — der Versicherungspfad bleibt unberührt).
  const [priceChange, setPriceChange] = useState(null); // { oldPrice, newPrice } | null
  const confirmedFinalPriceRef = useRef(null);

  // Fokusfalle/-rückgabe/Escape der beiden Konfliktdialoge (Paket B, globales
  // Dialogsystem). Escape/Backdrop schließen NEUTRAL (nur die Anzeige) — sie
  // lösen weder eine Neuberechnung noch eine Buchung aus; die fachliche
  // Entscheidung bleibt ausschließlich den zwei Aktionen im Dialog vorbehalten.
  // Muss vor jedem frühen Return stehen (Hook-Reihenfolge).
  const priceDriftRef = useDialog({ open: !!priceChange, onClose: () => setPriceChange(null) });
  // closeOnEscape: !pickupResetting — dieselbe Regel wie überall im Projekt:
  // Escape schließt nicht während ein Request läuft (Draft-Reset läuft hier).
  const pickupDriftRef = useDialog({
    open: !!pickupWindowChanged,
    onClose: () => setPickupWindowChanged(null),
    closeOnEscape: !pickupResetting,
  });

  // ── Versicherung (F1/F2): Auswahl + Live-Repricing + Übergabe an /book ──────
  // Startwerte aus dem laufenden Vorgang (reine Frontendzustände). Bewusst NICHT
  // wiederhergestellt: AGB- und Gefahrgutbestätigung (Einwilligungen werden neu
  // gegeben), Zoll-/Handelsrechnungsfelder (hängen am serverseitigen
  // Dokumentstatus) und das Abholzeitfenster (liegt autoritativ am Backend-Draft).
  const [insuranceType, setInsuranceType]   = useState(flowBooking?.insuranceType || "none"); // "none" | "standard" | "premium"
  // Warenwert und Versicherungswert sind bewusst GETRENNT — eigener State, eigene
  // Validierung, eigene Payload-Felder: goodsValue → details.value_amount,
  // insuranceValue → value → extra_insurance_value. Beide als String-Eingabe.
  const [goodsValue, setGoodsValue]         = useState(flowBooking?.goodsValue || "");     // Warenwert (EUR)
  const [insuranceValue, setInsuranceValue] = useState(flowBooking?.insuranceValue || ""); // Versicherungswert (EUR)
  // Progressive Disclosure: der Versicherungswert spiegelt den Warenwert, bis der
  // Nutzer ihn bewusst anpasst (insValueManual); das Feld ist bei Bedarf einblendbar
  // (insValueRevealed) und wird bei Warenwert über dem Maximum automatisch gezeigt.
  const [insValueManual, setInsValueManual]     = useState(!!flowBooking?.insValueManual);
  const [insValueRevealed, setInsValueRevealed] = useState(false);
  // Anzeigezeitpunkt der Wertfehler (dieselbe Regel wie bei Zollangaben und
  // Zusatzempfängern): Die Auswahl „Standard"/„Premium" BLENDET die Felder erst
  // ein — sofort „Bitte geben Sie den Warenwert an." darunter zu schreiben,
  // meldet einen Fehler für etwas, das der Kunde noch gar nicht tun konnte.
  // Sichtbar wird der Fehler nach der ersten echten Interaktion mit dem Feld
  // (Verlassen) oder beim Versuch weiterzugehen bzw. zu buchen.
  //
  // WICHTIG: Das betrifft ausschließlich die ANZEIGE. `insValid` und damit
  // Reprice-Gate und Buchungs-Gate rechnen unverändert mit den Rohfehlern —
  // eine unvollständige Eingabe blockiert also weiterhin, sie schreit nur nicht
  // vorher.
  const [insShowErrors, setInsShowErrors] = useState(false);
  const [repriceResult, setRepriceResult]   = useState(null);
  const [repriceLoading, setRepriceLoading] = useState(false);
  const [repriceError, setRepriceError]     = useState("");
  const [repriceStale, setRepriceStale]     = useState(false);
  const repriceSeq   = useRef(0);   // ignoriert veraltete Antworten
  const repriceAbort = useRef(null); // bricht In-Flight-Requests ab

  // Beobachtungsziel der kompakten Sticky-Zusammenfassung: Sie erscheint genau
  // dann, wenn die große Live-Zusammenfassung nach oben aus dem Sichtfeld
  // läuft. Reine Darstellungsreferenz — kein Zustand, keine Buchungslogik.
  const liveSummaryRef = useRef(null);

  const [form, setForm] = useState({
    content: flowBooking?.content || "",
    reference: flowBooking?.reference || "",
  });
  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));
  // Referenznummer clientseitig an die Backend-Regeln angleichen: < und >
  // entfernen, hart auf 35 Zeichen kappen (optional → kein Fehlerzustand).
  const updReference = (v) => upd("reference", v.replace(/[<>]/g, "").slice(0, 35));

  // ── Zusatzoption: Labeldruckformat (A4/A6) ──────────────────────────────────
  // Reiner /book-Payload-Wert (Default A4), NUR A4|A6. Kein Einfluss auf Preis
  // oder Reprice — bewusst NICHT in den Reprice-Deps und ohne Stale-Gate.
  const [labelFormat, setLabelFormat] = useState(flowBooking?.labelFormat || "A4");

  /* ── Progressive Disclosure der Zusatzoptionen ────────────────────────────
     Beide Schalter sind reiner UI-Zustand. Sie werden EINMAL beim Mount aus den
     ohnehin vorhandenen Werten abgeleitet (Entwurf, laufender Vorgang,
     Zurücknavigation) — es entsteht keine zweite Businesswahrheit neben
     `form.reference` und `labelFormat`, und ein gespeicherter Wert kann nicht
     unsichtbar mitgebucht werden. Danach laufen sie eigenständig, damit ein
     eingeschalteter, aber noch leerer Bereich offen bleibt. */
  const [referenceEnabled, setReferenceEnabled] = useState(
    () => !!(flowBooking?.reference || "").trim());
  const [labelFormatEnabled, setLabelFormatEnabled] = useState(
    () => (flowBooking?.labelFormat || "A4") !== "A4");

  // Ausschalten behält die Eingabe im Formular — versehentliches Ausschalten
  // vernichtet nichts, und beim Wiedereinschalten steht sie wieder da. Gebucht
  // wird sie trotzdem nur bei aktiver Option (siehe /book-Payload unten).
  const toggleReference = (on) => setReferenceEnabled(on);

  // Anders als bei der Referenznummer: A4 ist ein aktiv gesendeter Wert, kein
  // Weglassen. „Format ändern" aus heißt deshalb, dass wirklich wieder der
  // Standard gilt — sonst bliebe A6 unsichtbar gebucht.
  const toggleLabelFormat = (on) => {
    setLabelFormatEnabled(on);
    if (!on) setLabelFormat("A4");
  };

  /* ── Zusatzempfänger für Versandinformationen ─────────────────────────────
     Zwei unabhängige Optionen: nur Tracking bzw. Tracking UND Versandlabel als
     PDF. Beide verhalten sich wie die Referenznummer — der Wert bleibt beim
     Ausschalten im Formular stehen (versehentliches Ausschalten vernichtet
     nichts), gebucht wird er nur bei aktiver Option. Anders als beim Labelformat
     gibt es hier keinen Standardwert, der sonst unsichtbar mitliefe: fehlt das
     Feld im Payload, passiert schlicht nichts.

     Auch hier werden die Schalter beim Mount aus den vorhandenen Werten
     abgeleitet — keine zweite Wahrheit neben der Adresse selbst. */
  const [trackingEmail, setTrackingEmail] = useState(flowBooking?.trackingEmail || "");
  const [trackingEmailEnabled, setTrackingEmailEnabled] = useState(
    () => !!(flowBooking?.trackingEmail || "").trim());
  const [labelTrackingEmail, setLabelTrackingEmail] = useState(flowBooking?.labelTrackingEmail || "");
  const [labelTrackingEmailEnabled, setLabelTrackingEmailEnabled] = useState(
    () => !!(flowBooking?.labelTrackingEmail || "").trim());
  // Fehler erscheinen erst, wenn der Kunde weitergehen will — nicht schon beim
  // Einschalten eines noch leeren Feldes (dieselbe Regel wie bei den Zollangaben).
  const [emailShowErrors, setEmailShowErrors] = useState(false);

  /* ── Eigene Lieferscheinnummer ──────────────────────────────────────────────
     Sichtbar NUR bei Kontomodus „Eigenes Lieferscheinsystem" UND nur bei einer
     Sendung mit Lagerbezug: ohne Warendaten gäbe es gar keinen Lieferschein, auf
     den sich eine Nummer beziehen könnte. Bewusst KEIN Schalter und KEIN neuer
     Schritt — ein einzelnes optionales Feld in den bereits vorhandenen
     Zusatzangaben, wie die Referenznummer daneben.

     Der Lagerbezug wird am Vorgang erkannt (derselbe inventoryContext, den auch
     „Neue Sendung" führt) — nicht an einem eigenen Flag. */
  const hasInventoryContext = !!flowShipment?.inventoryContext;
  const showExternalDeliveryNote = showsExternalDeliveryNoteField(user, hasInventoryContext);
  const [externalDeliveryNoteNumber, setExternalDeliveryNoteNumber] =
    useState(flowBooking?.externalDeliveryNoteNumber || "");

  // Validiert wird NUR die jeweils aktive Option; ein ausgeschalteter, evtl.
  // ungültiger Restwert darf die Buchung nicht blockieren, weil er auch nicht
  // gesendet wird. Das Frontend ersetzt die serverseitige Prüfung nicht.
  const trackingEmailProblem      = shipmentEmailError(trackingEmailEnabled, trackingEmail);
  const labelTrackingEmailProblem = shipmentEmailError(labelTrackingEmailEnabled, labelTrackingEmail);
  const shipmentEmailsValid = !trackingEmailProblem && !labelTrackingEmailProblem;

  // ── Zollangaben (Phase 2): State im Orchestrator, nur bei customsRequired ───
  const makeCustomsItem = () => ({
    description: "", value: "", quantity: "1", unitOfMeasurement: "PCS",
    netWeight: "", originCountry: bookingData?.form?.s_country || "DE", hsTariffNumber: "",
  });
  const [customsExportReason, setCustomsExportReason] = useState("");
  const [customsItems, setCustomsItems]               = useState(() => [makeCustomsItem()]);
  const [customsShowErrors, setCustomsShowErrors]     = useState(false);
  const addCustomsItem    = () => setCustomsItems(items => [...items, makeCustomsItem()]);
  const removeCustomsItem = (idx) => setCustomsItems(items => items.length > 1 ? items.filter((_, i) => i !== idx) : items);
  const updCustomsItem    = (idx, key, value) => setCustomsItems(items => items.map((it, i) => i === idx ? { ...it, [key]: value } : it));
  // Optionale Zollrechnungs-Metadaten (nur customs_invoice; ohne Einfluss auf Kundenpreis/-rechnung).
  const [customsInvoiceNumber, setCustomsInvoiceNumber] = useState("");
  const [customsInvoiceDate,   setCustomsInvoiceDate]   = useState("");
  const [customsInvoiceRemark, setCustomsInvoiceRemark] = useState("");
  // Interner Confidara-Rechnungstyp (nur UI/Validierung; KEIN /book-Key, KEIN
  // JUMiNGO-Feld). customsInvoiceMode ist die bewusste Nutzerpräferenz für nicht
  // gewerbliche Exportgründe (Default proforma); der effektive Modus wird abgeleitet.
  const [customsInvoiceMode, setCustomsInvoiceMode]     = useState(PROFORMA);
  const [proformaBlockedHint, setProformaBlockedHint]   = useState("");

  /* ── Spiegelung der Buchungsoptionen in den laufenden Vorgang ────────────
     Nur reine Frontendzustände, keine Serverdaten. Schritt 3 (Erfolg) wird
     bewusst nicht gespiegelt — nach der Buchung wird der Vorgang ohnehin
     gelöscht. Abhängigkeiten sind die Werte selbst → keine Schleife.

     Die Referenznummer wird nur gespiegelt, solange ihre Option aktiv ist: der
     Vorgang hält damit genau das, was auch gebucht würde, und die Ableitung des
     Schalters beim nächsten Mount bleibt richtig. Der bei ausgeschalteter Option
     lokal gehaltene Wert ist bewusst nur für die laufende Ansicht gedacht. */
  useEffect(() => {
    if (step === 3) return;
    setFlowBooking({
      step, labelFormat, reference: referenceEnabled ? form.reference : "", content: form.content,
      insuranceType, goodsValue, insuranceValue, insValueManual,
      // Dieselbe Regel wie bei der Referenznummer: gespiegelt wird nur, was auch
      // gebucht würde — sonst stünde ein bewusst ausgeschalteter Bereich nach der
      // Rückkehr wieder offen.
      trackingEmail: trackingEmailEnabled ? trackingEmail : "",
      labelTrackingEmail: labelTrackingEmailEnabled ? labelTrackingEmail : "",
      // Dieselbe Regel: gespiegelt wird nur, was auch gesendet würde. Ist das Feld
      // gar nicht sichtbar (anderer Kontomodus oder Sendung ohne Lagerbezug), bleibt
      // der Vorgang leer — ein unsichtbarer Restwert darf nie mitgebucht werden.
      externalDeliveryNoteNumber: showExternalDeliveryNote ? externalDeliveryNoteNumber : "",
    });
  // Reihenfolge ohne Bedeutung für React — die vier E-Mail-Abhängigkeiten stehen
  // aber bewusst am Ende: sharedShipmentEmailOptions.test.mjs (6) verankert dort.
  }, [step, labelFormat, referenceEnabled, form.reference, form.content, insuranceType,
      goodsValue, insuranceValue, insValueManual, setFlowBooking,
      showExternalDeliveryNote, externalDeliveryNoteNumber,
      trackingEmailEnabled, trackingEmail, labelTrackingEmailEnabled, labelTrackingEmail]);

  const tariff = bookingData?.tariff;

  // Paketdaten (Anzahl/Gewicht/Maße) als fertiger Anzeige-String — einmal
  // abgeleitet, in Step 1 (ShipmentSummaryModule) und Step 2 (Zusammenfassung)
  // verwendet. Der Kunde soll Gewicht UND Abmessungen vor der verbindlichen
  // Bestellung noch einmal kontrollieren können; die Ableitung liegt rein und
  // getestet in newShipmentForm.mjs. Kein erzwungener Platzhalter: null, wenn
  // nichts vorliegt.
  const packageInfo = packageSummaryLine(bookingData?.form);

  // ── Versicherung: abgeleitete Werte, Validierung, Repricing ────────────────
  const asNum = (v) => { const n = typeof v === "number" ? v : Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : null; };
  const asPos = (v) => { const n = asNum(v); return n != null && n > 0 ? n : null; };
  const asStr = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

  // Dünne Sichtbarkeits-/Modul-Konfiguration: aus belegten Tarif- (pro-Tarif) und
  // Routen-Feldern (Top-Level customsRequired) — bildet das bisherige Verhalten ab.
  // `modules.insurance` ersetzt das frühere `insurable`-Gate, `modules.customs`
  // schaltet die Zollangaben nur bei backendseitig zollpflichtiger Route.
  const modules = getBookingModules(tariff, bookingData?.customs);
  const isInsured = insuranceType === "standard" || insuranceType === "premium";
  const goodsValueNum     = asNum(goodsValue);
  const insuranceValueNum = asNum(insuranceValue);
  // Inhaltsbeschreibung: das sichtbare Feld wurde aus dem Versicherungsbereich
  // ENTFERNT. Der technische contentDescription-Vertrag bleibt UNVERÄNDERT — es wird
  // weiter der bestehende sichere Default (Sendungsinhalt → "Paket") an /reprice und
  // /book übergeben. Kein neues öffentliches Feld, keine Zoll-/Backend-Änderung.
  const contentDescription = (form.content.trim() || "Paket").slice(0, 35);

  // Read-only Anzeigewerte (Reprice-Response bevorzugt, sonst Tarif-Felder).
  const insDetails   = tariff?.insuranceDetails && typeof tariff.insuranceDetails === "object" ? tariff.insuranceDetails : null;
  const insStdPrice  = asPos(insDetails?.extraInsurancePriceBruttoPreselect);
  const insPremPrice = asPos(insDetails?.extraInsurancePremiumPriceBruttoPreselect);

  // insCards (Kartenpreise) werden nach dem zentralen Price-View-Model gebaut —
  // sie hängen von der bestätigten/gewählten Stufe ab (siehe unten, nach insValid).

  // Clientseitige Validierung (nur Standard/Premium), GETRENNT nach Backend-
  // Grenzen. Warenwert (goodsValue): 1..9.999.999. Versicherungswert (value):
  // 1..20.000. Komma-Eingaben werden über asNum() unterstützt. contentDescription
  // ist per maxLength/slice bereits ≤ 35 → keine separate Fehlermeldung nötig.
  const goodsValueError =
    !isInsured                 ? "" :
    !goodsValue.trim()         ? "Bitte geben Sie den Warenwert an." :
    goodsValueNum == null      ? "Bitte geben Sie einen gültigen Betrag ein." :
    goodsValueNum <= 0         ? "Der Warenwert muss größer als 0 € sein." :
    goodsValueNum > 9999999    ? "Der Warenwert darf höchstens 9.999.999 € betragen." :
    "";
  const insValueError =
    !isInsured                 ? "" :
    !insuranceValue.trim()     ? "Bitte geben Sie den Versicherungswert an." :
    insuranceValueNum == null  ? "Bitte geben Sie einen gültigen Betrag ein." :
    insuranceValueNum <= 0     ? "Der Versicherungswert muss größer als 0 € sein." :
    insuranceValueNum > 20000  ? "Der Versicherungswert darf höchstens 20.000 € betragen." :
    "";
  const insValid = !isInsured || (goodsValueError === "" && insValueError === "");

  // ── Gutschein (JUMiNGO-Testgutschein, Version 1) ────────────────────────────
  // Kleiner, endlicher State — kein zusätzliches State-Management. Das Frontend entscheidet
  // NIE selbst über Gültigkeit oder Rabatthöhe: `voucher` enthält ausschließlich das, was der
  // Server bestätigt hat (utils/voucherView.mjs). Es gibt hier bewusst keine Codeliste und
  // keine Prozentrechnung.
  const [voucherInput,  setVoucherInput]  = useState("");
  const [voucher,       setVoucher]       = useState({ status: VOUCHER_STATUS.IDLE, code: null, percent: null, totals: null });
  const voucherAbort = useRef(null);

  // Preis-/tarifrelevanter Fingerabdruck des aktuellen Vorgangs. Ändert er sich, verfällt ein
  // angewendeter Gutschein sofort — sonst stünde ein bestätigter Betrag neben einer inzwischen
  // anderen Sendung. Referenznummer, Labelformat und die E-Mail-Optionen stehen bewusst NICHT
  // darin (sie ändern den Preis nicht).
  const voucherKey = voucherInvalidationKey({
    tariffId: tariff?.id, shipperTariffId: tariff?.shipper_tariff_id, serviceType: tariff?.serviceType,
    insuranceType, insuranceValue, goodsValue,
    weight: bookingData?.form?.weight, length: bookingData?.form?.length,
    width: bookingData?.form?.width, height: bookingData?.form?.height,
    packageCount: bookingData?.form?.packageCount,
    senderCountry: form.s_country, senderZip: form.s_zip,
    recipientCountry: form.r_country, recipientZip: form.r_zip,
    shippingDate: bookingData?.form?.shippingDate,
    pickupWindow: pickupWindow ? `${pickupWindow.from ?? ""}-${pickupWindow.until ?? ""}` : "",
  });
  const voucherKeyRef = useRef(voucherKey);
  useEffect(() => {
    if (shouldInvalidateVoucher(voucherKeyRef.current, voucherKey)) {
      voucherKeyRef.current = voucherKey;
      // Laufende Prüfung abbrechen: ihr Ergebnis gehörte zu einem überholten Zustand.
      if (voucherAbort.current) voucherAbort.current.abort();
      setVoucher((prev) => (prev.status === VOUCHER_STATUS.IDLE ? prev
        : { status: VOUCHER_STATUS.IDLE, code: null, percent: null, totals: null }));
    } else {
      voucherKeyRef.current = voucherKey;
    }
  }, [voucherKey]);

  // Laufende Gutscheinprüfung beim Verlassen abbrechen.
  useEffect(() => () => { if (voucherAbort.current) voucherAbort.current.abort(); }, []);

  const applyVoucher = async () => {
    const code = normalizeVoucherInput(voucherInput);
    if (!code) return;
    if (voucherAbort.current) voucherAbort.current.abort();
    const controller = new AbortController();
    voucherAbort.current = controller;
    setVoucher({ status: VOUCHER_STATUS.CHECKING, code: null, percent: null, totals: null });
    try {
      const r = await checkVoucher({
        shipmentId:      bookingData?.shipmentId,
        tariffId:        tariff?.id,
        shipperTariffId: tariff?.shipper_tariff_id,
        voucherCode:     code,
      }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!r.ok) { setVoucher({ status: VOUCHER_STATUS.ERROR, code: null, percent: null, totals: null }); return; }
      const body = await r.json().catch(() => null);
      setVoucher(readVoucherResponse(body));
    } catch (e) {
      // Ein Abbruch ist kein Fehler des Nutzers und erzeugt keine Meldung.
      if (e && e.name === "AbortError") return;
      setVoucher({ status: VOUCHER_STATUS.ERROR, code: null, percent: null, totals: null });
    }
  };

  const removeVoucher = () => {
    if (voucherAbort.current) voucherAbort.current.abort();
    setVoucherInput("");
    setVoucher({ status: VOUCHER_STATUS.IDLE, code: null, percent: null, totals: null });
  };

  const voucherApplied  = voucher.status === VOUCHER_STATUS.APPLIED;
  const voucherChecking = voucher.status === VOUCHER_STATUS.CHECKING;

  // ── Zentrales Price-View-Model (Paket B) ────────────────────────────────────
  // EINZIGE Preisquelle für Live-Leiste, Versicherungskarten, Preiszusammenfassung
  // und Buchungs-Gate. Kein Preselect wird lokal zum Gesamtpreis addiert; der
  // Gesamtbetrag stammt immer aus dem Tarif (none) ODER 1:1 aus repriceResult.totals.
  const priceView = buildBookingPriceView({
    tariff, insuranceType, repriceResult, repriceLoading, repriceStale, repriceError, insValid,
  });

  // Kartenpreise: „ab"-Preselect ODER — nur für die AUSGEWÄHLTE, bestätigte Stufe —
  // der exakte Aufpreis aus dem Reprice. Keine zweite Reprice-Anfrage für die andere Stufe.
  const insCards = [
    { id: "standard", name: "Standardversicherung",    price: insuranceCardPrice({ cardType: "standard", selectedType: insuranceType, view: priceView, preselectGross: insStdPrice }) },
    { id: "premium",  name: "Premiumversicherung",     price: insuranceCardPrice({ cardType: "premium",  selectedType: insuranceType, view: priceView, preselectGross: insPremPrice }) },
    { id: "none",     name: "Keine zusätzliche Transportversicherung", price: insuranceCardPrice({ cardType: "none",     selectedType: insuranceType, view: priceView, preselectGross: null }) },
  ];

  // Progressive Disclosure des Versicherungswert-Felds + Warenwert-über-Maximum.
  const goodsOverMax = goodsExceedsInsuranceMax(goodsValue);
  const insValueFieldVisible = insValueRevealed || insValueManual || goodsOverMax;

  // Auto-Vorbelegung Versicherungswert = Warenwert, bis der Nutzer ihn manuell ändert.
  const handleGoodsValueChange = (v) => {
    setGoodsValue(v);
    const next = autofillInsuranceValue({ goodsValue: v, insuranceValueManual: insValueManual });
    if (next != null) setInsuranceValue(next);
  };
  const handleInsuranceValueChange = (v) => { setInsuranceValue(v); setInsValueManual(true); };
  const handleSelectInsuranceType = (id) => {
    setInsuranceType(id);
    if ((id === "standard" || id === "premium") && !insValueManual) setInsuranceValue(goodsValue);
  };

  // Reprice-Request mit Seq-/Abort-Schutz: veraltete Antworten überschreiben den
  // State nie. Sendet insuranceType FLACH, keine Client-Preise (Backend-Vertrag).
  const runReprice = async (type, goodsNum, insNum, content) => {
    const seq = ++repriceSeq.current;
    if (repriceAbort.current) repriceAbort.current.abort();
    const ac = new AbortController(); repriceAbort.current = ac;
    setRepriceLoading(true); setRepriceError("");
    try {
      const r = await repriceInsurance({
        shipmentId:          bookingData?.shipmentId,
        tariffId:            tariff?.id,
        shipperTariffId:     tariff?.shipper_tariff_id,
        insuranceType:       type,
        goodsValue:          goodsNum,
        extraInsuranceValue: insNum,
        contentDescription:  content,
      }, { signal: ac.signal });
      if (seq !== repriceSeq.current) return; // veraltet → ignorieren
      if (r.status === 401 || r.status === 403) { setRepriceLoading(false); return; } // zentraler Auth-Redirect
      let d = null; try { d = await r.json(); } catch { d = null; }
      if (!r.ok) {
        setRepriceResult(null); setRepriceStale(true);
        setRepriceError(
          r.status === 400 ? (asStr(d?.error) || "Die Angaben zur Versicherung sind ungültig.") :
          r.status === 409 ? "Der Preis hat sich geändert. Bitte aktualisieren Sie den Versicherungspreis." :
          r.status === 429 ? "Zu viele Anfragen. Bitte später erneut versuchen." :
          "Versicherungspreis konnte nicht bestätigt werden."
        );
        setRepriceLoading(false);
        return;
      }
      setRepriceResult(d); setRepriceStale(false); setRepriceLoading(false);
    } catch (e) {
      if (e?.name === "AbortError") return;        // durch neueren Request ersetzt
      if (seq !== repriceSeq.current) return;
      setRepriceResult(null); setRepriceStale(true);
      setRepriceError("Versicherungspreis konnte nicht bestätigt werden.");
      setRepriceLoading(false);
    }
  };

  // Auto-Reprice bei Typwechsel oder Wertänderung (debounced 500 ms). Jede
  // Änderung markiert das letzte Ergebnis als veraltet → Buchung erst nach
  // frischem Reprice. contentDescription beeinflusst den Preis nicht und ist
  // bewusst NICHT in den Deps.
  useEffect(() => {
    if (insuranceType === "none") {
      setRepriceResult(null); setRepriceStale(false); setRepriceError("");
      repriceSeq.current++; if (repriceAbort.current) repriceAbort.current.abort();
      return;
    }
    setRepriceStale(true);
    if (!insValid) { setRepriceResult(null); return; }
    const id = setTimeout(() => runReprice(insuranceType, goodsValueNum, insuranceValueNum, contentDescription), 500);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insuranceType, goodsValue, insuranceValue]);

  // Laufende Requests beim Unmount abbrechen.
  useEffect(() => () => { if (repriceAbort.current) repriceAbort.current.abort(); }, []);

  // Buchung bei versicherter Auswahl nur mit BESTÄTIGTEM Preis-View (Basis ODER
  // frischer Reprice). Identisch zum bisherigen Gate — jetzt aus der einen Quelle.
  const insuranceBlocksBooking = priceViewBlocksBooking(priceView);
  // P0: Abholfenster-Hydrierung blockiert die Buchung (nur Pickup) — laufend ODER Ladefehler.
  // Gemeinsame Wahrheit für Button-Deaktivierung (BookingActionModule) und doBook-Guard.
  const pickupHydrationBlocks = pickupWindowBlocksBooking({ serviceType: tariff?.serviceType, hydration: pickupHydration });

  // ── Zoll: Validierung (nur wenn Route zollpflichtig) ────────────────────────
  const customsRequired = modules.customs;
  const hsRequired = tariff?.hsTariffNumberRequired === true;

  // ── Zoll-Handelsrechnung: Statusautomat (GET/Upload/Delete) — nur bei
  // zollpflichtiger Route mit interner shipmentId. Der Hook lädt den Status
  // einmal und hält present/absent/… vor. ──────────────────────────────────────
  const ci = useCommercialInvoice({ shipmentId: bookingData?.shipmentId, enabled: customsRequired });
  const commercialOnly = isCommercialOnly(customsExportReason); // „Commercial"/Verkauf → Handelsrechnung zwingend
  const docActive = ci.status === "present" || ci.status === "uploading" || ci.status === "deleting";
  // Effektiver Rechnungstyp: gewerblich ODER Dokument aktiv → commercial; sonst
  // die bewusste Nutzerpräferenz (Default proforma) via resolveInvoiceMode.
  const invoiceMode = docActive ? COMMERCIAL : resolveInvoiceMode(customsExportReason, customsInvoiceMode);

  // Radio-Wechsel: Proforma bei gewerblich (disabled) oder bei vorhandenem/aktivem
  // Dokument (H-Regel) NICHT still zulassen — stattdessen klarer Hinweis.
  const selectInvoiceMode = (m) => {
    if (m === PROFORMA) {
      if (commercialOnly) return;
      if (!canSelectProforma(customsExportReason, ci.status)) {
        setProformaBlockedHint("Entfernen Sie zuerst die hinterlegte Handelsrechnung, bevor Sie zur Proforma-Rechnung wechseln.");
        return;
      }
      setProformaBlockedHint(""); setCustomsInvoiceMode(PROFORMA);
    } else {
      setProformaBlockedHint(""); setCustomsInvoiceMode(COMMERCIAL);
    }
  };

  // Exportgrund-Wechsel persistiert die gespeicherte Präferenz gemäß Confidara-
  // Regel: gewerblich → commercial; Wechsel weg von gewerblich darf commercial
  // behalten (resolveInvoiceMode ist idempotent, sobald der Effekt gelaufen ist).
  useEffect(() => {
    setCustomsInvoiceMode((prev) => resolveInvoiceMode(customsExportReason, prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customsExportReason]);

  // Ein bestätigtes Dokument fixiert commercial (H-Regel): bleibt nach einem
  // späteren Delete erhalten, bis der Nutzer bewusst Proforma wählt.
  useEffect(() => {
    if (ci.status === "present") setCustomsInvoiceMode(COMMERCIAL);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ci.status]);

  const intPos = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0; };
  const validateCustomsItem = (it) => {
    const e = {};
    if (!it.description.trim())                   e.description = "Warenbeschreibung erforderlich.";
    if (asPos(it.value) == null)                  e.value = "Warenwert größer als 0 erforderlich.";
    if (!intPos(it.quantity))                     e.quantity = "Ganze Zahl größer als 0.";
    if (asPos(it.netWeight) == null)              e.netWeight = "Gewicht größer als 0 erforderlich.";
    if (!it.originCountry)                        e.originCountry = "Ursprungsland erforderlich.";
    if (hsRequired && !it.hsTariffNumber.trim())  e.hsTariffNumber = "HS-Code erforderlich.";
    return e;
  };
  const customsItemErrors = customsItems.map(validateCustomsItem);
  const customsExportReasonError = customsRequired && !customsExportReason ? "Bitte wählen Sie einen Exportgrund." : "";
  // Optionales Rechnungsdatum: leer erlaubt; wenn gesetzt, exakt YYYY-MM-DD + echte
  // Kalendergültigkeit (spiegelt die Backend-Regel; <input type="date"> liefert i. d. R.
  // valide Werte, getippte/ungültige werden hier defensiv abgefangen). invoiceNumber/
  // -Remark sind reine Freitext-Optionalfelder ohne clientseitige Formatpflicht.
  const isValidISODate = (s) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  };
  // Rechnungsnummer/-datum sind NUR im commercial-Modus sichtbar UND dann Pflicht.
  // In proforma keine Zusatzpflicht (Felder sind ausgeblendet).
  const commercialActive = customsRequired && invoiceMode === COMMERCIAL;
  const invoiceNumberError = commercialActive && !customsInvoiceNumber.trim()
    ? "Bitte geben Sie die Rechnungsnummer an." : "";
  const invoiceDateTrim = customsInvoiceDate.trim();
  const invoiceDateValid = invoiceDateTrim !== "" && isValidISODate(invoiceDateTrim);
  const customsInvoiceDateError = commercialActive
    ? (!invoiceDateTrim
        ? "Bitte geben Sie das Rechnungsdatum an."
        : !invoiceDateValid ? "Bitte ein gültiges Datum (Format TT.MM.JJJJ) wählen." : "")
    : "";
  // ── A. Fachliche Zollrechnungs-Metadaten (dokument-UNABHÄNGIG) ──────────────
  // Die Handelsrechnungs-PDF ist optional; der Dokumentstatus ist NICHT Teil der
  // fachlichen Gültigkeit. Proforma stellt keine Zusatzpflicht, commercial
  // verlangt Rechnungsnummer + gültiges Datum (die PDF darf fehlen).
  const customsInvoiceMetaValid = customsInvoiceFieldsValid({
    mode: invoiceMode, invoiceNumber: customsInvoiceNumber, invoiceDateValid,
  });
  // ── B. Optionale Dokument-MUTATION (Upload/Löschen läuft) ───────────────────
  // Nur eine tatsächlich laufende Mutation schützt kurzfristig gegen einen Race
  // (Doppel-Submit während Upload/Löschen). Nur im commercial-Modus möglich →
  // Proforma wird nie durch einen Dokumentstatus blockiert. Initiales Loading
  // (idle/checking) und ein Statusfehler (error) blockieren bewusst NICHT.
  const commercialInvoiceBusy = commercialActive && commercialInvoiceMutationBusy(ci.status);
  const customsInvoiceBusyMessage =
    ci.status === "uploading" ? "Die Handelsrechnung wird noch hochgeladen. Bitte warten Sie einen Moment." :
    ci.status === "deleting"  ? "Die Handelsrechnung wird noch entfernt. Bitte warten Sie einen Moment." :
    "";
  // Fachliche Zollformular-Gültigkeit (A): Exportgrund + Warenpositionen (inkl.
  // HS-Code, wenn tarifbedingt erforderlich) + Rechnungsmetadaten. KEIN
  // Dokumentstatus. Die kurzfristige Mutations-Sperre (B) ist bewusst getrennt.
  const customsFieldsValid = !customsRequired || (
    !customsExportReasonError &&
    customsItems.length >= 1 &&
    customsItemErrors.every(e => Object.keys(e).length === 0) &&
    customsInvoiceMetaValid
  );
  const customsValid = customsFieldsValid && !commercialInvoiceBusy;

  const buildParty = (p) => {
    const f = bookingData?.form || {};
    return {
      ...(f[`${p}_company`]  ? { company:         f[`${p}_company`]  } : {}),
      fullName:        f[`${p}_fullName`],
      streetAndNumber: f[`${p}_street`],
      ...(f[`${p}_addition`] ? { addressAddition: f[`${p}_addition`] } : {}),
      postalCode:      f[`${p}_zip`],
      city:            f[`${p}_city`],
      country:         f[`${p}_country`],
      ...(f[`${p}_phone`] ? { phone: f[`${p}_phone`] } : {}),
      ...(f[`${p}_email`] ? { email: f[`${p}_email`] } : {}),
    };
  };

  const fmtAddr = (p) => {
    const f = bookingData?.form || {};
    const parts = [];
    if (f[`${p}_company`])  parts.push(f[`${p}_company`]);
    parts.push(f[`${p}_fullName`]);
    parts.push(f[`${p}_street`]);
    if (f[`${p}_addition`]) parts.push(f[`${p}_addition`]);
    const zipCity = [f[`${p}_zip`], f[`${p}_city`]].filter(Boolean).join(" ");
    if (zipCity) parts.push(zipCity);
    const cName = countries.find(c => c.code === f[`${p}_country`])?.name || f[`${p}_country`];
    parts.push(cName);
    return parts.filter(Boolean).join(", ");
  };

  const doBook = async () => {
    if (!agbAccepted) return;
    // Legal-Buchungsschranke: solange der Kontext lädt oder nicht auslieferbar ist, wird nicht
    // bestellt. Rein defensiv — der Bestellknopf ist ohnehin deaktiviert. KEIN Rückfall auf die
    // statischen AGB-Seiten: bei aktiver Schranke ist die versionierte Fassung die einzige,
    // die serverseitig als Nachweis entsteht.
    if (legalBlocksBooking) return;
    // Während einer laufenden Gutscheinprüfung nicht buchen: der angezeigte Betrag steht
    // in diesem Moment nicht fest. Rein defensiv — der Bestellknopf ist ohnehin deaktiviert.
    if (voucherChecking) return;
    // Ausschlussgüter-Bestätigung ist Pflicht — zweite Sicherung gegen einen
    // programmatisch ausgelösten Submit (der Buchen-Button ist zusätzlich
    // deaktiviert). Fehlt sie, klare, an der Checkbox aria-verknüpfte Meldung.
    if (!prohibitedGoodsAccepted) {
      setProhibitedShowError(true);
      return;
    }
    // Abholzeitfenster: nicht buchen, solange das gespeicherte Fenster noch geladen
    // wird ODER ein Ladefehler vorliegt (kein unbemerktes Buchen mit einem anderen
    // als dem angezeigten Fenster). Nur Pickup betroffen; der finale /book bleibt
    // zusätzlich der autoritative fail-closed Gate (409 PICKUP_WINDOW_CHANGED).
    if (pickupHydrationBlocks) {
      setError(pickupHydration.error
        ? "Das gespeicherte Abholzeitfenster konnte nicht geladen werden. Bitte laden Sie die Seite neu."
        : "Das Abholzeitfenster wird noch geladen. Bitte einen Moment warten.");
      return;
    }
    // Zweite Hälfte der Absicherung für die Zusatzempfänger (erste ist goToStep2).
    // Das Backend lehnt eine ungültige Adresse ohnehin VOR der Buchung ab; hier
    // wird der Kunde zurück zu Schritt 1 geführt, wo das Feld sichtbar ist.
    if (!shipmentEmailsValid) {
      setEmailShowErrors(true);
      setStep(1);
      setError("Bitte prüfen Sie die zusätzliche E-Mail-Adresse, bevor Sie buchen.");
      return;
    }
    // Bei versicherter Auswahl nur mit frischem, gültigem Reprice buchen (die
    // exakt gerepricte Auswahl wird gebucht — nie ein veralteter Stand).
    if (isInsured && (repriceStale || !repriceResult || repriceLoading || !insValid)) {
      // Falls die Ursache ein leerer/ungültiger Wert ist: den Feldfehler
      // sichtbar machen, damit der Kunde auf Schritt 1 sieht, WAS fehlt.
      // Die Gate-Bedingung selbst ist unverändert.
      if (!insValid) setInsShowErrors(true);
      setError("Bitte aktualisieren Sie den Versicherungspreis, bevor Sie buchen.");
      return;
    }
    // Bei zollpflichtiger Sendung erst buchen, wenn die FACHLICHEN Zollangaben
    // vollständig sind (dieselbe zentrale Regel wie das Weiter-Gate). Der optionale
    // Dokumentstatus (PDF) ist NICHT Teil dieser Prüfung; nur eine tatsächlich
    // laufende Upload-/Löschmutation schützt kurzfristig gegen einen Race. Gilt auch
    // bei direktem Funktionsaufruf → kein /book-Request.
    if (customsRequired && !customsValid) {
      setCustomsShowErrors(true);
      setError(
        commercialInvoiceBusy
          ? customsInvoiceBusyMessage
          : "Bitte vervollständigen Sie die Angaben zum Wareninhalt."
      );
      return;
    }
    setError(""); setConflict(""); setAddressError(""); setLoading(true);
    try {
      // /book erwartet insuranceSelection VERSCHACHTELT (nicht wie /reprice flach).
      // confirmedTotalGross ist reines Drift-Gate (nie Preisquelle) — nur bei
      // Standard/Premium senden. Für "none" nur { type: "none" }.
      const insurancePayload = isInsured
        ? {
            insuranceSelection: {
              type:               repriceResult?.selectedInsurance || insuranceType,
              value:              insuranceValueNum, // → extra_insurance_value
              goodsValue:         goodsValueNum,     // → details.value_amount
              contentDescription,
            },
            confirmedTotalGross: repriceResult?.totals?.customerTotalGross,
          }
        : { insuranceSelection: { type: "none" } };
      // customsData NUR bei zollpflichtiger Route (Backend-Vertrag). Sonst bleibt
      // der bestehende Payload unverändert (EU/DE ohne customsData).
      const customsPayload = customsRequired
        ? {
            customsData: {
              exportReason: customsExportReason,
              currency: "EUR",
              items: customsItems.map((it) => ({
                description:   it.description.trim(),
                quantity:      Number(it.quantity),
                netWeight:     Number(String(it.netWeight).replace(",", ".")),
                value:         Number(String(it.value).replace(",", ".")),
                originCountry: it.originCountry,
                unitOfMeasurement: it.unitOfMeasurement,
                ...(it.hsTariffNumber.trim() ? { hsTariffNumber: it.hsTariffNumber.trim() } : {}),
              })),
              // Rechnungs-Metadaten je nach internem Modus (KEIN invoiceMode-Key, KEIN
              // document/Upload-Key): Proforma sendet invoiceNumber/invoiceDate NICHT
              // (nur remarks), Commercial sendet Nummer (getrimmt) + Datum + remarks.
              // Der Helper lässt leere Werte weg (kein "" / kein null).
              ...buildCustomsInvoiceMeta({
                invoiceNumber: invoiceMode === COMMERCIAL ? customsInvoiceNumber : "",
                invoiceDate:   invoiceMode === COMMERCIAL ? customsInvoiceDate : "",
                invoiceRemark: customsInvoiceRemark,
              }),
            },
          }
        : {};
      const r = await apiFetch(`/api/jumingo/book`, {
        method: "POST", auth: true,
        body: JSON.stringify({
          shipmentId:      bookingData?.shipmentId,
          tariffId:        tariff?.id,
          shipperTariffId: tariff?.shipper_tariff_id,
          // F3: Bei bewusst bestätigter Preisänderung (nur none-Pfad) den neuen
          // Serverpreis als price_final senden — sonst der ursprüngliche
          // Tarifpreis. Der Versicherungspfad nutzt weiterhin tariff.finalPrice
          // (Drift-Gate dort ist confirmedTotalGross, unverändert).
          price_final:     (!isInsured && confirmedFinalPriceRef.current != null)
                             ? confirmedFinalPriceRef.current
                             : tariff?.finalPrice,
          sender:          buildParty("s"),
          recipient:       buildParty("r"),
          weight:          bookingData?.form?.weight,
          // `content` bleibt unveränderter Teil des /book-Payloads. Das wirkungs-
          // lose Eingabefeld wurde aus „Sendungsdetails" entfernt; der State
          // `form.content` bleibt bewusst intern bestehen (Default "") und dient
          // weiterhin als Fallback der Versicherungs-Inhaltsbeschreibung
          // (contentDescription). Kein neu erzeugter content-Wert in diesem Slice.
          content:         form.content,
          // Optionale Referenznummer nur senden, wenn die Option aktiv ist UND
          // nach trim ein Wert vorliegt → leerer Fall lässt den bestehenden
          // Payload unverändert. Der Schalter ist damit die einzige Stelle, an
          // der ein noch im Formular liegender Wert wirksam wird.
          ...(referenceEnabled && form.reference.trim() ? { referenceNumber: form.reference.trim() } : {}),
          // Optionale Zusatzempfänger — nur bei aktiver Option und befülltem Feld.
          // Gesendet wird die Adresse selbst, NICHT der Schalterzustand: eine
          // vorhandene Adresse IST die Aktivierung (so der Backendvertrag).
          ...buildShipmentEmailPayload({
            trackingEmailEnabled, trackingEmail,
            labelTrackingEmailEnabled, labelTrackingEmail,
          }),
          // Eigene Lieferscheinnummer — nur wenn das Feld überhaupt sichtbar war und
          // etwas darinsteht. Ein unsichtbarer Restwert wird nie mitgebucht. Der Wert
          // geht ausschließlich in die lokale Sendung, nie an den Provider.
          ...(showExternalDeliveryNote && externalDeliveryNoteNumber.trim()
            ? { externalDeliveryNoteNumber: externalDeliveryNoteNumber.trim() } : {}),
          // Labeldruckformat immer mitsenden (Default A4, sonst A6) — reiner
          // Fulfillment-Parameter ohne Preis-/Drift-Einfluss.
          labelFormat,
          // Gutschein: NUR der Code, und nur wenn er serverseitig bestätigt wurde. Es werden
          // ausdrücklich KEINE Beträge, Prozentwerte oder Rabatthöhen mitgesendet — der Server
          // ignorierte sie ohnehin und prüft den Gutschein unmittelbar vor der Bestellung
          // erneut vollständig gegen den Provider. Der Code ist ein Wunsch, keine Zusage.
          ...(voucherApplied && voucher.code ? { voucherCode: voucher.code } : {}),
          // Legal-Buchungsschranke: NUR bei aktiver Schranke entstehen hier Felder — der
          // gesehene Setschlüssel und die beiden Bestätigungen. Ist die Schranke aus (Standard),
          // bleibt das Objekt leer und der Payload exakt der bisherige. Gesendet wird weder ein
          // Zeitpunkt noch eine Dokument-ID: beides bestimmt der Server.
          ...legalBookingPayload(legalContext, { agbAccepted, prohibitedGoodsAccepted }),
          ...insurancePayload,
          ...customsPayload,
        }),
      });
      // Body defensiv lesen: leerer Body oder eine HTML-Fehlerseite (Proxy/502)
      // warf hier früher einen rohen JSON-Parserfehler bis ins Kundenbanner.
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      // Serverseitiger Zollrechnungs-Guard (stabile Codes, statusunabhängig). Zurück
      // zum Customs-/Übersichtsschritt, Felder markieren, KEIN Auto-Retry/-Upload/
      // -Delete/-Book. Bei DOCUMENT_REQUIRED/MODE_CONFLICT genau EIN kontrollierter GET.
      if (d?.code && COMMERCIAL_INVOICE_BOOK_ERRORS[d.code]) {
        setLoading(false);
        setStep(1);
        setCustomsShowErrors(true);
        setError(COMMERCIAL_INVOICE_BOOK_ERRORS[d.code]);
        if (d.code === "COMMERCIAL_INVOICE_METADATA_INCOMPLETE"
          || d.code === "COMMERCIAL_INVOICE_METADATA_REQUIRED"
          || d.code === "COMMERCIAL_INVOICE_DOCUMENT_REQUIRED") {
          setCustomsInvoiceMode(COMMERCIAL); // commercial erzwingen/erhalten
        }
        if (d.code === "COMMERCIAL_INVOICE_DOCUMENT_REQUIRED"
          || d.code === "COMMERCIAL_INVOICE_MODE_CONFLICT") {
          ci.refreshStatus(); // genau EIN GET; present-Effekt setzt danach ggf. commercial
        }
        return;
      }
      if (r.status === 409) {
        // P0 — Abholzeitfenster-Drift: das gespeicherte individuelle Fenster ist
        // gegen den frischen Tarif nicht mehr gültig. Eigener Code (NICHT Duplikat/
        // Preis) → Spezialdialog mit den neuen verfügbaren Grenzen; Buchung gestoppt,
        // das Fenster wird NICHT still überschrieben. Erst nach bewusster Bestätigung
        // wird der Wunsch verworfen (NULL/NULL) und eine erneute Buchung erlaubt.
        // Paket 4-B — Fassungswechsel zwischen Anzeige und Bestellung. Eigener Pfad, bewusst
        // VOR allen anderen 409-Zweigen: er darf niemals im Duplikat-, Preisdrift- oder
        // Versicherungszweig landen, denn deren Handlungsanweisungen („Zu meinen Sendungen",
        // „Preis aktualisieren") reparieren hier nichts. Es wird NICHT automatisch erneut
        // gebucht — der Kunde muss die neue Fassung sehen und selbst erneut bestätigen.
        if (isLegalSetChanged(r.status, d)) {
          setAgbAccepted(false);
          setProhibitedGoodsAccepted(false);
          setProhibitedShowError(false);
          reloadLegalContext();          // neue Fassung holen und anzeigen
          setStep(2);                    // zurück an die Bestätigungsstelle
          setError(LEGAL_SET_CHANGED_TEXT);
          setLoading(false);
          return;
        }
        if (d?.code === "PICKUP_WINDOW_CHANGED") {
          setPickupWindowChanged({
            availableFrom: d.availableFrom,
            availableUntil: d.availableUntil,
            minimumMinutes: d.minimumMinutes,
            adjustable: d.adjustable,
          });
          setLoading(false);
          return;
        }
        // F3 — Preisdrift OHNE Versicherung: zuerst und getrennt von Duplikat-/
        // Versicherungskonflikten abfangen. Nur dieser Konflikt trägt den Code
        // "PRICE_CHANGED" (Duplikate/Versicherungsdrift tun das nicht) → sauber
        // unterscheidbar, kein Duplikat-Text. Öffnet den Preisdrift-Dialog.
        if (d?.code === "PRICE_CHANGED") {
          setPriceChange({ oldPrice: d.oldPrice, newPrice: d.newPrice });
          setLoading(false);
          return;
        }
        // Bei versicherter Buchung deutet 409 auf Preis-Drift → Reprice erzwingen
        // (auf der Seite bleiben). Ohne Versicherung bleibt das bisherige
        // Duplikat-Verhalten (Sendung bereits verarbeitet) unverändert.
        if (isInsured) {
          setRepriceStale(true);
          setError(asStr(d.error) || "Der Preis hat sich geändert. Bitte aktualisieren Sie den Versicherungspreis und bestätigen Sie erneut.");
          setLoading(false);
          return;
        }
        setConflict(d.error || "Diese Sendung wurde bereits verarbeitet oder befindet sich bereits in Bearbeitung.");
        setLoading(false);
        return;
      }
      if (r.status === 401 || r.status === 403) { setLoading(false); return; } // globaler Auth-Redirect übernimmt
      if (r.status === 400 || r.status === 422) {
        const backendMsg = asStr(d.error);
        // Zusatzempfänger: das Backend prüft die beiden Adressen serverseitig VOR
        // jedem Providerkontakt und nennt im Ablehnungsfall das Feld. Diese Fälle
        // dürfen NICHT in den Adressen-Zweig darunter laufen — der würde „Absender-
        // oder Empfängeradresse … Preise neu berechnen" behaupten, also die falsche
        // Ursache UND eine Handlung, die nichts repariert. Die serverseitige Regel
        // ist strenger als die clientseitige (sie weist zusätzlich Adresslisten und
        // Steuerzeichen ab); dieser Zweig ist also erreichbar, obwohl der Client
        // vorher geprüft hat.
        if (d?.field === "trackingEmail" || d?.field === "labelTrackingEmail") {
          setEmailShowErrors(true);
          setStep(1);
          setError(backendMsg || "Bitte prüfen Sie die zusätzliche E-Mail-Adresse.");
          setLoading(false);
          return;
        }
        // Bei zollpflichtiger Sendung stammt ein 400 typischerweise aus dem
        // Customs-Gate → konkrete Backend-Meldung anzeigen und auf der Seite
        // bleiben (NICHT in den Adressen-"neu berechnen"-Flow leiten).
        if (customsRequired) {
          setCustomsShowErrors(true);
          setError(backendMsg || "Die Zollangaben sind unvollständig oder ungültig. Bitte prüfen Sie die Angaben zum Wareninhalt.");
          setLoading(false);
          return;
        }
        // Sonst wie bisher: das Backend lehnt unvollständige/ungültige Adressdaten
        // früh ab → kundentaugliche Meldung + Rückführung zur Adresseingabe.
        setAddressError(
          backendMsg ||
          "Die Absender- oder Empfängeradresse ist unvollständig oder ungültig. Bitte vervollständigen Sie alle Pflichtfelder und berechnen Sie die Preise neu."
        );
        setLoading(false);
        return;
      }
      if (!r.ok) {
        // Restpfad (404/429/5xx/unlesbarer Body): früher ein Sammelwurf mit
        // rohem d.error — jetzt klare, unterscheidbare Meldungen. Der Kunde
        // bleibt auf Schritt 2, alle Angaben bleiben erhalten, der Button wird
        // über setLoading(false) unten wieder frei.
        setError(mapBookRestError(r.status, d));
        setLoading(false);
        return;
      }
      if (!d || typeof d !== "object") {
        // 2xx ohne lesbares Buchungsobjekt: KEIN Erfolg, keine Navigation.
        setError(mapBookUnreadableSuccess());
        setLoading(false);
        return;
      }
      setBooking(d); setStep(3);
      // Der Vorgang ist abgeschlossen: temporären Zustand (Context UND
      // sessionStorage) löschen. Der Erfolgsbildschirm lebt ab hier
      // ausschließlich aus `booking` — Sendungs-/Geschäftsnummer, Label und
      // Rechnungshinweis bleiben davon unberührt sichtbar.
      clearFlow();
    } catch (e) {
      // Netzabbruch/Timeout: kein „Failed to fetch" mehr im Banner.
      setError(mapBookThrownError(e));
    }
    setLoading(false);
  };

  // F3 — „Angebote neu berechnen": den nun veralteten Buchungs-Flow bewusst
  // verlassen und zur „+ Neue Sendung"-Seite führen, wo frische Angebote
  // berechnet werden. Kein erneuter /book, keine alte Buchung, keine kaputte
  // Navigation (gleicher Zielpfad wie „Zurück").
  const handlePriceChangeRecalculate = () => {
    setPriceChange(null);
    navigate("/dashboard?page=new");
  };

  // F3 — „Zum neuen Preis fortfahren": den bestätigten neuen Preis als price_final
  // festhalten und erneut buchen. Der nächste /book sendet nie wieder den alten
  // Preis. Ändert sich der Preis erneut, öffnet doBook den Dialog mit den neuen
  // Werten; bei Erfolg greift der normale Erfolgspfad. Keine Endlosschleife —
  // jede Bestätigung nutzt den aktuellen Serverpreis, der Nutzer entscheidet
  // je Runde bewusst.
  const continueWithNewPrice = () => {
    const np = asNum(priceChange?.newPrice);
    if (np == null) return;                  // ungültiger newPrice → nur Neuberechnung möglich
    confirmedFinalPriceRef.current = np;     // neuer price_final für den nächsten /book
    setPriceChange(null);
    doBook();
  };

  // P0 — „Angebote neu berechnen" aus dem Abholfenster-Dialog: den nun veralteten
  // Buchungs-Flow bewusst verlassen und frische Angebote berechnen (gleiches Ziel
  // wie „Zurück"). Kein erneuter /book, kein Draft-Reset.
  const handlePickupWindowRecalculate = () => {
    setPickupWindowChanged(null);
    navigate("/dashboard?page=new");
  };

  // P0 — „Neues Zeitfenster übernehmen": den gespeicherten individuellen Wunsch
  // bewusst verwerfen (Draft NULL/NULL → volles frisches Carrier-Fenster) und den
  // Dialog schließen. KEIN Auto-Rebook — erst nach dieser Bestätigung ist eine
  // erneute Buchung möglich (der Nutzer klickt bewusst erneut „Kostenpflichtig
  // buchen"). Schlägt das Zurücksetzen fehl, bleibt der Dialog offen: der alte
  // Wunsch bliebe sonst gespeichert und würde beim nächsten /book erneut 409 → das
  // ist fail-closed und wird als Fehler im Dialog gemeldet.
  const acceptNewPickupWindow = async () => {
    const sid = bookingData?.shipmentId;
    setPickupResetError("");
    setPickupResetting(true);
    try {
      if (sid) {
        const r = await saveDraftPickupWindow({ shipmentId: sid, pickupTimeFrom: null, pickupTimeUntil: null });
        if (r.status === 401 || r.status === 403) { setPickupResetting(false); return; } // zentraler Auth-Redirect
        if (!r.ok) { setPickupResetting(false); setPickupResetError("Das Zeitfenster konnte nicht zurückgesetzt werden. Bitte erneut versuchen."); return; }
      }
      setPickupWindow(null);
      setPickupWindowChanged(null);
      setPickupResetting(false);
    } catch {
      setPickupResetting(false);
      setPickupResetError("Das Zeitfenster konnte nicht zurückgesetzt werden. Bitte erneut versuchen.");
    }
  };

  const handleDownloadLabel = async () => {
    // Der Label-Abruf läuft über den ConfidaraExpress-Sendungshandle
    // (`ceShipmentId` aus der Buchungsantwort), nicht über die Providerreferenz
    // in `shipmentId` — das ist der Wert, den DIESER Client gesendet hat.
    if (!booking?.ceShipmentId) return;
    setLabelLoading(true); setLabelError("");
    try {
      await downloadLabel(booking.ceShipmentId, booking.businessOrderNumber);
    } catch (e) {
      if (e?.status !== 401 && e?.status !== 403) setLabelError(e.message); // globaler Auth-Redirect übernimmt sonst
    }
    setLabelLoading(false);
  };

  // Lieferschein — derselbe Weg wie das Label: Sendungshandle aus der Buchungsantwort,
  // Blob-Download, eigener Fehlerzustand. Der Knopf erscheint NUR, wenn die
  // Buchungsantwort tatsächlich einen Lieferschein meldet (`booking.deliveryNote`) —
  // nie anhand des Kontomodus geraten.
  const handleDownloadDeliveryNote = async () => {
    if (!booking?.ceShipmentId || !booking?.deliveryNote?.number) return;
    setDeliveryNoteLoading(true); setDeliveryNoteError("");
    try {
      await downloadDeliveryNote(booking.ceShipmentId, booking.deliveryNote.number);
    } catch (e) {
      if (e?.status !== 401 && e?.status !== 403) setDeliveryNoteError(e.message);
    }
    setDeliveryNoteLoading(false);
  };

  // Auftragsbestätigung — derselbe Weg wie Label und Lieferschein: Sendungshandle aus
  // der Buchungsantwort, Blob-Download, eigener Fehlerzustand. Der Knopf erscheint NUR,
  // wenn die Buchungsantwort tatsächlich eine Auftragsbestätigung meldet
  // (`booking.orderConfirmation`) — nie unterstellt.
  const handleDownloadOrderConfirmation = async () => {
    if (!booking?.ceShipmentId || !booking?.orderConfirmation?.number) return;
    setOrderConfirmationLoading(true); setOrderConfirmationError("");
    try {
      await downloadOrderConfirmation(booking.ceShipmentId, booking.orderConfirmation.number);
    } catch (e) {
      if (e?.status !== 401 && e?.status !== 403) setOrderConfirmationError(e.message);
    }
    setOrderConfirmationLoading(false);
  };

  /* ── Sichtbares „Zurück" ─────────────────────────────────────────────────
     Es führt IMMER zum Angebotsvergleich — unabhängig davon, was im
     Browserverlauf davor liegt.

     Die frühere Fassung nutzte `navigate(-1)`, sobald ein Flow-Marker im
     location.state lag. Das war fachlich falsch: welcher Dashboard-Bereich
     hinter dem vorherigen History-Eintrag steckt, ist nicht garantiert. Die
     Sidebar-Navigation setzt nur den lokalen page-State und fasst die History
     überhaupt nicht an — wer über „Übersicht", „Rechnungen", „Entwürfe" oder
     „Profil" zu „Neue Sendung" gewechselt war, landete deshalb mit einem
     Klick auf „Zurück" wieder dort statt bei seinen Angeboten.

     Jetzt wird gezielt navigiert. `replace: true`, damit kein Kreislauf
     Angebote → Buchung → Zurück → Buchung entsteht und die History bei
     wiederholtem Zurückgehen nicht wächst. Es werden KEINE personenbezogenen
     Daten in den History-Eintrag kopiert — nur der Zielbereich und der
     Rückkehrwunsch; die Sendungsdaten kommen aus dem ShippingFlowContext. */
  const goBackToOffers = () => {
    setFlowStep("offers");
    navigate("/dashboard", {
      replace: true,
      state: { page: "new", returnTarget: "offers" },
    });
  };

  const addrReady =
    !!bookingData?.form?.s_fullName && !!bookingData?.form?.s_street &&
    !!bookingData?.form?.s_zip      && !!bookingData?.form?.s_city   &&
    !!bookingData?.form?.r_fullName && !!bookingData?.form?.r_street &&
    !!bookingData?.form?.r_zip      && !!bookingData?.form?.r_city;

  if (!tariff) return (
    <div className="page-with-navbar booking-no-tariff">
      <div className="text-center">
        <p className="text-muted mb-16">Kein Angebot ausgewählt</p>
        <button className="btn btn-primary" onClick={() => navigate("/calculator")}>Zum Versandkostenrechner</button>
      </div>
    </div>
  );

  if (!addrReady) return (
    <div className="page-with-navbar booking-no-tariff">
      <div className="text-center">
        <p className="text-muted mb-16">Adressdaten unvollständig — bitte im Versandkostenrechner ausfüllen</p>
        <button className="btn btn-primary" onClick={() => navigate("/calculator")}>Zum Versandkostenrechner</button>
      </div>
    </div>
  );

  // Weiter-Gate (Step 1 → 2): bei zollpflichtiger Sendung erst fortfahren, wenn die
  // Zollangaben vollständig sind — inkl. commercial (Nummer/Datum/bestätigtes Dokument).
  // Erste Hälfte der doppelten Absicherung; die zweite ist der Guard in doBook.
  const goToStep2 = () => {
    // Abholfenster-Ladefehler: auf Step 1 bleiben, wo die Fehlermeldung des Moduls
    // (mit Reload-Hinweis) sichtbar ist. Ein laufender Ladevorgang ist kurz und wird
    // hier nicht blockiert — der finale Buchungs-Guard fängt beide Fälle ohnehin ab.
    if (tariff?.serviceType === "pickup" && pickupHydration.error) {
      setError("Das gespeicherte Abholzeitfenster konnte nicht geladen werden. Bitte laden Sie die Seite neu, bevor Sie fortfahren.");
      return;
    }
    // Zusatzempfänger: eine aktivierte Option braucht eine gültige Adresse. Der
    // Fehler wird erst hier sichtbar — ein gerade eingeschaltetes, noch leeres
    // Feld soll nicht sofort rot sein. Das Backend prüft dieselbe Regel erneut
    // und lehnt VOR der Buchung ab; dies erspart dem Kunden nur den Umweg.
    if (!shipmentEmailsValid) {
      setEmailShowErrors(true);
      setError("Bitte prüfen Sie die zusätzliche E-Mail-Adresse, bevor Sie fortfahren.");
      return;
    }
    // Versicherungswerte: ab hier sind fehlende/ungültige Beträge kein „noch
    // nicht ausgefüllt" mehr, sondern ein echter Befund — sie werden sichtbar.
    // Das Weiter-Gate selbst bleibt unverändert (es hat Versicherungswerte nie
    // blockiert; das tut der Buchungs-Guard).
    if (!insValid) setInsShowErrors(true);
    if (customsRequired && !customsValid) {
      setCustomsShowErrors(true);
      // Blockiert wird ausschließlich wegen unvollständiger FACHLICHER Zollangaben
      // ODER einer aktuell laufenden Dokument-Mutation (Upload/Löschen). Ein
      // fehlendes/ungeklärtes/fehlerhaftes Dokument blockiert NICHT (PDF optional).
      setError(
        commercialInvoiceBusy
          ? customsInvoiceBusyMessage
          : "Bitte vervollständigen Sie die Zollangaben, bevor Sie fortfahren."
      );
      return;
    }
    setError(""); setStep(2);
  };

  const steps = ["Übersicht", "Buchung", "Fertig"];

  return (
    <div className="page-with-navbar">
      <div className="booking-wrap">
        {/* Seitentitel kommt aus dem PageHeader der App-Shell (DashboardLayout,
            ROUTE_HEADERS.booking) — kein zweiter Titel hier (Paket B). */}

        {/* Step-Indicator */}
        <div className="steps-bar mb-24">
          {steps.map((s, i) => (
            <div key={i} className="step-item">
              <div className="step-wrap">
                <div className={`step-circle ${i + 1 === step ? "active" : i + 1 < step ? "done" : ""}`}>
                  {i + 1 < step ? <Icon n="check" s={14} /> : i + 1}
                </div>
                <span className={`step-label ${i + 1 === step ? "active" : i + 1 < step ? "done" : ""}`}>{s}</span>
              </div>
              {i < steps.length - 1 && <div className={`step-line ${i + 1 < step ? "done" : ""}`} />}
            </div>
          ))}
        </div>

        {/* Permanente Live-Zusammenfassung (Schritt 1 + 2) — dieselbe Preisquelle
            wie Karten und Preiszusammenfassung (zentrales Price-View-Model).
            Sie scrollt normal mit; sobald sie oben aus dem Sichtfeld läuft,
            übernimmt die kompakte Leiste darunter. Der Wrapper trägt nur die
            Referenz für deren IntersectionObserver — er hat weder Rahmen noch
            Innenabstand, der Außenabstand der Leiste bleibt unverändert. */}
        {(step === 1 || step === 2) && (
          <>
            <div ref={liveSummaryRef}>
              <BookingLiveSummary tariff={tariff} priceView={priceView} pickupWindow={pickupWindow} />
            </div>
            <BookingStickySummary tariff={tariff} priceView={priceView} observeRef={liveSummaryRef} />
          </>
        )}

        {error && (typeof error === "object"
          ? <FormAlert tone="error" title={error.title} message={error.message} className="mb-16" />
          : <div className="alert alert-error mb-16" role="alert">{error}</div>)}

        {/* ── Step 1: Übersicht ── */}
        {step === 1 && (
          <div>
            <OfferSummaryModule tariff={tariff} />

            {tariff.serviceType === "dropoff" && (
              <DropoffNoticeModule
                tariff={tariff}
                senderPrefill={{
                  postCode: bookingData?.form?.s_zip,
                  city:     bookingData?.form?.s_city,
                  country:  bookingData?.form?.s_country,
                  street:   bookingData?.form?.s_street,
                }}
              />
            )}

            {tariff.serviceType === "pickup" && tariff.pickupTimeFrom && tariff.pickupTimeUntil && (
              <PickupWindowModule
                tariff={tariff}
                shipmentId={bookingData?.shipmentId}
                value={pickupWindow}
                onChange={setPickupWindow}
                onHydrationChange={setPickupHydration}
              />
            )}

            <ShipmentSummaryModule
              senderAddr={fmtAddr("s")}
              recipientAddr={fmtAddr("r")}
              packageInfo={packageInfo}
            />

            <AdditionalOptionsModule
              reference={form.reference}
              onReferenceChange={updReference}
              referenceEnabled={referenceEnabled}
              onReferenceEnabledChange={toggleReference}
              labelFormatEnabled={labelFormatEnabled}
              onLabelFormatEnabledChange={toggleLabelFormat}
              trackingEmail={trackingEmail}
              onTrackingEmailChange={setTrackingEmail}
              trackingEmailEnabled={trackingEmailEnabled}
              onTrackingEmailEnabledChange={setTrackingEmailEnabled}
              trackingEmailError={emailShowErrors ? trackingEmailProblem : null}
              labelTrackingEmail={labelTrackingEmail}
              onLabelTrackingEmailChange={setLabelTrackingEmail}
              labelTrackingEmailEnabled={labelTrackingEmailEnabled}
              onLabelTrackingEmailEnabledChange={setLabelTrackingEmailEnabled}
              labelTrackingEmailError={emailShowErrors ? labelTrackingEmailProblem : null}
              labelFormat={labelFormat}
              onLabelFormatChange={setLabelFormat}
              showExternalDeliveryNote={showExternalDeliveryNote}
              externalDeliveryNoteNumber={externalDeliveryNoteNumber}
              onExternalDeliveryNoteNumberChange={setExternalDeliveryNoteNumber}
              deliveryNoteText={DELIVERY_NOTE_TEXT}
            />

            {modules.customs && (
              <CustomsModule
                exportReason={customsExportReason}
                onExportReasonChange={setCustomsExportReason}
                items={customsItems}
                onItemChange={updCustomsItem}
                onAddItem={addCustomsItem}
                onRemoveItem={removeCustomsItem}
                hsRequired={hsRequired}
                itemErrors={customsItemErrors}
                exportReasonError={customsExportReasonError}
                showErrors={customsShowErrors}
                invoiceMode={invoiceMode}
                onSelectInvoiceMode={selectInvoiceMode}
                commercialOnly={commercialOnly}
                proformaHint={docActive ? proformaBlockedHint : ""}
                invoiceNumber={customsInvoiceNumber}
                onInvoiceNumberChange={setCustomsInvoiceNumber}
                invoiceNumberError={invoiceNumberError}
                invoiceDate={customsInvoiceDate}
                onInvoiceDateChange={setCustomsInvoiceDate}
                invoiceDateError={customsInvoiceDateError}
                invoiceRemark={customsInvoiceRemark}
                onInvoiceRemarkChange={setCustomsInvoiceRemark}
                ci={{
                  status: ci.status,
                  message: ci.message,
                  messageType: ci.messageType,
                  errorScope: ci.errorScope,
                  onFileSelected: ci.upload,
                  onRemove: ci.remove,
                  onRetryStatus: ci.refreshStatus,
                }}
              />
            )}

            <SaveDraftAction
              // AUSSCHLIESSLICH der ConfidaraExpress-Sendungshandle (shipments.id).
              // Hier stand bookingData.shipmentId — die JUMiNGO-Referenz
              // ("s_"+32 Hex). POST /api/kunde/drafts/:id/save löst aber nur
              // shipments.id auf, und hasSavableShipmentId() verwarf die
              // Providerform korrekt: die Aktion war dadurch dauerhaft unsichtbar.
              shipmentId={bookingData?.ceShipmentId}
              onNavigateDrafts={() => navigate("/dashboard?page=drafts")}
              // Auch der zweite Entwurfspfad beendet nach bestätigtem Erfolg
              // den aktiven temporären ShippingFlow (seit dem Paket „leerer
              // Nullzustand" nur noch der Context — es wird nichts mehr in den
              // sessionStorage gespiegelt)
              // — derselbe Grund wie beim Formularentwurf: der Vorgang ist
              // jetzt sicher unter „Entwürfe" gespeichert, „Neue Sendung" darf
              // ihn nicht mehr resurrektieren. `location.state` (bookingData)
              // bleibt unangetastet — diese Seite bleibt bis zur nächsten
              // Navigation vollständig funktionsfähig.
              onSaved={clearFlow}
            />

            <div className="flex gap-12">
              <button className="btn btn-outline" onClick={goBackToOffers}>← Zurück</button>
              <button className="btn btn-primary btn-grow" onClick={goToStep2}>
                Weiter: Buchung <Icon n="arrow" s={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Buchung ── */}
        {step === 2 && (
          <div>
            <div className="calc-panel booking-confirm-panel mb-16">
              <div className="calc-panel-header booking-confirm-header">
                <Icon n="shield" s={18} c="var(--ce-color-brand-ink)" />
                <h3>Verbindliche Bestellung</h3>
              </div>
              <div className="calc-panel-body">
                {/* ── Zusatzversicherung (Modul) — Sichtbarkeit über die Config ── */}
                {modules.insurance ? (
                  <InsuranceModule
                    insCards={insCards}
                    insuranceType={insuranceType}
                    onSelectType={handleSelectInsuranceType}
                    isInsured={isInsured}
                    tariff={tariff}
                    goodsValue={goodsValue}
                    onGoodsValueChange={handleGoodsValueChange}
                    onGoodsValueBlur={() => setInsShowErrors(true)}
                    goodsValueError={insShowErrors ? goodsValueError : ""}
                    insuranceValue={insuranceValue}
                    onInsuranceValueChange={handleInsuranceValueChange}
                    onInsuranceValueBlur={() => setInsShowErrors(true)}
                    insValueError={insShowErrors ? insValueError : ""}
                    insValueFieldVisible={insValueFieldVisible}
                    onRevealInsValue={() => setInsValueRevealed(true)}
                    goodsOverMax={goodsOverMax}
                    insuranceValueMax={INSURANCE_VALUE_MAX}
                    repriceError={repriceError}
                    isRepricing={priceView.isRepricing}
                    isStale={priceView.isStale}
                    repriceConfirmed={priceView.status === PRICE_STATUS.REPRICE_CONFIRMED}
                  />
                ) : (
                  <p className="booking-ins-unavailable">
                    Für diesen Tarif ist keine Zusatzversicherung verfügbar.
                  </p>
                )}

                <div className="booking-confirm-box">
                  <div className="booking-confirm-row">
                    <span className="text-sm text-muted">Carrier</span>
                    <span className="text-sm font-bold booking-confirm-val">{publicCarrierDisplay(tariff).name} — {publicServiceName(tariff)}</span>
                  </div>
                  {tariff.serviceType && (
                    <div className="booking-confirm-row">
                      <span className="text-sm text-muted">Serviceart</span>
                      <span className="text-sm font-bold booking-confirm-val">
                        {tariff.serviceType === "pickup" ? "Abholung" : "Shopabgabe"}{publicDropoffLabel(tariff) ? ` · ${publicDropoffLabel(tariff)}` : ""}
                      </span>
                    </div>
                  )}
                  <div className="booking-confirm-row">
                    <span className="text-sm text-muted">Absender</span>
                    <span className="text-sm font-bold booking-confirm-val">{fmtAddr("s")}</span>
                  </div>
                  <div className={`booking-confirm-row${packageInfo ? "" : " mb-16"}`}>
                    <span className="text-sm text-muted">Empfänger</span>
                    <span className="text-sm font-bold booking-confirm-val">{fmtAddr("r")}</span>
                  </div>
                  {packageInfo && (
                    <div className="booking-confirm-row mb-16">
                      <span className="text-sm text-muted">Paket</span>
                      <span className="text-sm font-bold booking-confirm-val">{packageInfo}</span>
                    </div>
                  )}
                  <PriceSummaryModule
                    priceView={priceView}
                    paymentTerm={user?.payment_term || 7}
                    voucherLines={voucherApplied ? voucherPriceLines({ voucher, fallbackGross: priceView.totalGross }) : null}
                  />
                  {/* Gutscheinfeld: unter der Preisaufstellung, VOR Bestätigungen und
                      Bestellknopf. Bewusst innerhalb derselben Übersichtskarte. */}
                  <VoucherModule
                    status={voucher.status}
                    code={voucher.code}
                    percent={voucher.percent}
                    inputCode={voucherInput}
                    onInputChange={setVoucherInput}
                    onApply={applyVoucher}
                    onRemove={removeVoucher}
                    disabled={loading}
                  />
                </div>
                {voucherApplied && (
                  <div className="booking-test-note" role="note">
                    <Icon n="info" s={15} c="currentColor" />
                    <span>
                      Testsendung: Diese Buchung wird als Test ausgeführt. Das erzeugte
                      Versandlabel ist ein <strong>Testlabel</strong> und darf nicht für den
                      realen Versand verwendet werden.
                    </span>
                  </div>
                )}
                {modules.printerNote && (
                  <div className="booking-printer-note" role="note">
                    <Icon n="printer" s={15} c="currentColor" />
                    <span>
                      Für diesen Tarif ist ein Drucker erforderlich, da das Versandlabel
                      vor Übergabe ausgedruckt werden muss.
                    </span>
                  </div>
                )}
                <TermsModule
                  legalContext={legalContext}
                  accepted={agbAccepted}
                  onChange={setAgbAccepted}
                  prohibitedAccepted={prohibitedGoodsAccepted}
                  onProhibitedChange={(v) => { setProhibitedGoodsAccepted(v); if (v) setProhibitedShowError(false); }}
                  prohibitedError={prohibitedShowError && !prohibitedGoodsAccepted
                    ? "Bitte bestätigen Sie, dass die Sendung keine ausgeschlossenen Gegenstände enthält."
                    : ""}
                />
                <BookingActionModule
                  error={error}
                  conflict={conflict}
                  addressError={addressError}
                  loading={loading}
                  agbAccepted={agbAccepted}
                  prohibitedGoodsAccepted={prohibitedGoodsAccepted}
                  insuranceBlocksBooking={insuranceBlocksBooking}
                  pickupBlocksBooking={pickupHydrationBlocks}
                  voucherChecking={voucherChecking}
                  legalBlocksBooking={legalBlocksBooking}
                  onBook={doBook}
                  onNavigateShipments={() => navigate("/dashboard?page=shipments")}
                  onNavigateNew={() => navigate("/dashboard?page=new")}
                  userEmail={user?.email}
                />
              </div>
            </div>
            <button className="btn btn-outline btn-full" onClick={() => setStep(1)} disabled={loading}>← Zurück zur Übersicht</button>
          </div>
        )}

        {/* ── Step 3: Buchung erfolgreich ── */}
        {step === 3 && booking && (
          <div className="booking-success-wrap">
            <div className="booking-success-icon"><Icon n="check" s={40} /></div>
            <h2 className="booking-success-title">Sendung erfolgreich gebucht!</h2>
            {/* Die Confidara-Bestellnummer ist die primäre Vorgangsnummer und steht zuerst;
                die Rechnungsnummer wird getrennt daneben ausgewiesen und dient NICHT mehr als
                allgemeine Vorgangsnummer. Fehlt die Bestellnummer (Legacy-/Bestandsfall), wird
                die Zeile ausgelassen — es wird keine Ersatznummer erzeugt. */}
            <div className="booking-success-numbers mb-16" style={{ display: "flex", flexWrap: "wrap", gap: "10px 32px", justifyContent: "center" }}>
              {booking.businessOrderNumber && (
                <div>
                  <div className="text-muted" style={{ fontSize: 12 }}>{NUMBER_LABELS.businessOrder}</div>
                  <CopyableNumber value={booking.businessOrderNumber} label={NUMBER_LABELS.businessOrder} size="lg" />
                </div>
              )}
              {/* Bei Sammelabrechnung gibt es zu DIESER Sendung noch keine Rechnung —
                  Nummer und Fälligkeit werden deshalb gar nicht erst angezeigt. Ein
                  Platzhalter wäre eine Behauptung über einen Beleg, den es nicht gibt.
                  Der Hinweis darunter sagt stattdessen, wo der Betrag erscheinen wird. */}
              {bookingBillingNotice(booking).showsInvoiceNumber && (
                <div>
                  <div className="text-muted" style={{ fontSize: 12 }}>{NUMBER_LABELS.invoice}</div>
                  <CopyableNumber value={booking.invoiceNumber} label={NUMBER_LABELS.invoice} size="lg" />
                </div>
              )}
            </div>
            {/* Klare Trennung: Buchungsbestätigung (bereits versendet) ≠ spätere Rechnung/Rechnungs-E-Mail. */}
            <div className="booking-success-delivery mb-16">
              <p className="text-muted mb-4">{BOOKING_CONFIRMATION_LINE}{user?.email ? ` (an ${user.email})` : ""}</p>
              {/* Der Standardsatz zur automatischen Rechnungserstellung gilt nur für die
                  Einzelabrechnung; bei Sammelabrechnung tritt der Sammelhinweis an seine
                  Stelle, statt beide nebeneinander zu behaupten. */}
              {bookingBillingNotice(booking).consolidated
                ? <p className="text-muted mb-8">{bookingBillingNotice(booking).text}</p>
                : <p className="text-muted mb-8">{INVOICE_AUTOCREATE_LINE}</p>}
              {!bookingBillingNotice(booking).consolidated && (() => {
                const hint = invoiceDeliveryHint(invoiceDeliveryMode);
                const cls = hint.tone === "success" ? "alert-success" : hint.tone === "error" ? "alert-error" : "alert-info";
                const icon = hint.tone === "success" ? "check" : "info";
                return (
                  <div className={`alert ${cls}`} role="status" aria-live="polite">
                    <Icon n={icon} s={16} />{hint.text}
                  </div>
                );
              })()}
            </div>

            {/* Kompakter Recap — ausschließlich aus bereits vorhandenem Tarif-/
                Formular-State abgeleitet, keine neue Server-Anfrage. */}
            <div className="calc-panel booking-success-recap mb-16">
              <div className="calc-panel-header"><Icon n="invoice" s={18} c="var(--ce-color-brand-ink)" /><h3>Ihre Buchung</h3></div>
              <div className="calc-panel-body">
                <div className="summary-detail-row summary-detail-row-border">
                  <span className="text-sm text-muted summary-detail-key">Carrier</span>
                  <span className="text-sm font-bold summary-detail-val">{publicCarrierDisplay(tariff).name} — {publicServiceName(tariff)}</span>
                </div>
                <div className="summary-detail-row summary-detail-row-border">
                  <span className="text-sm text-muted summary-detail-key">Route</span>
                  <span className="text-sm font-bold summary-detail-val">{bookingData.form.s_city} → {bookingData.form.r_city}</span>
                </div>
                {tariff.serviceType && (
                  <div className="summary-detail-row summary-detail-row-border">
                    <span className="text-sm text-muted summary-detail-key">Serviceart</span>
                    <span className="text-sm font-bold summary-detail-val">{tariff.serviceType === "pickup" ? "Abholung" : "Shopabgabe"}</span>
                  </div>
                )}
                <PriceSummaryModule priceView={priceView} paymentTerm={user?.payment_term || 7} />
              </div>
            </div>

            {labelError && <div className="alert alert-error mb-16" role="alert">{labelError}</div>}
            {booking?.ceShipmentId && (
              <button className="btn btn-primary btn-full mb-16" onClick={handleDownloadLabel} disabled={labelLoading}>
                {labelLoading ? <><span className="spinner" /> Label wird geladen…</> : "Label herunterladen"}
              </button>
            )}
            {/* Auftragsbestätigung — erscheint NUR, wenn die Buchungsantwort tatsächlich
                eine gemeldet hat. Sie steht VOR dem Lieferschein: sie betrifft jede
                Buchung, der Lieferschein nur Konten mit Lagerbezug. Die Bestätigung
                kommt zusätzlich per E-Mail; der Knopf ist die Sofortkopie. */}
            {orderConfirmationError && <div className="alert alert-error mb-16" role="alert">{orderConfirmationError}</div>}
            {booking?.ceShipmentId && booking?.orderConfirmation?.number && (
              <button className="btn btn-outline btn-full mb-16" onClick={handleDownloadOrderConfirmation} disabled={orderConfirmationLoading}>
                {orderConfirmationLoading
                  ? <><span className="spinner spinner-dark" /> Auftragsbestätigung wird geladen…</>
                  : <>Auftragsbestätigung {booking.orderConfirmation.number} herunterladen</>}
              </button>
            )}
            {/* Lieferschein — erscheint NUR, wenn die Buchungsantwort tatsächlich einen
                gemeldet hat. Ohne Lieferschein bleibt hier keine leere Zeile stehen. */}
            {deliveryNoteError && <div className="alert alert-error mb-16" role="alert">{deliveryNoteError}</div>}
            {booking?.ceShipmentId && booking?.deliveryNote?.number && (
              <button className="btn btn-outline btn-full mb-16" onClick={handleDownloadDeliveryNote} disabled={deliveryNoteLoading}>
                {deliveryNoteLoading
                  ? <><span className="spinner spinner-dark" /> Lieferschein wird geladen…</>
                  : <>Lieferschein {booking.deliveryNote.number} herunterladen</>}
              </button>
            )}
            {/* Ruhiger Hinweis — bewusst KEIN sofortiger Tracking-Call/Polling
                direkt nach der Buchung (Status wäre ohnehin „new"/nicht verfügbar).
                Der Trackingstatus erscheint später in „Meine Sendungen". Ist
                trackingAvailable am Tarif explizit false, würde der optimistische
                Text irreführen — dann ehrlicher Hinweis statt „wird vorbereitet". */}
            {tariff.trackingAvailable === false ? (
              <p className="booking-tracking-note">
                <Icon n="truck" s={15} c="currentColor" />
                <span>Für diesen Tarif ist keine Sendungsverfolgung verfügbar.</span>
              </p>
            ) : (
              <p className="booking-tracking-note">
                <Icon n="truck" s={15} c="currentColor" />
                <span>
                  Tracking wird vorbereitet. Die Sendungsverfolgung erscheint in Ihren
                  Sendungen, sobald der Versanddienstleister die Sendung übernommen hat.
                </span>
              </p>
            )}
            {/* Aktionspriorität (Paket B): Label steht bereits oben, sofern verfügbar.
                Danach Sendung ansehen → weitere Sendung erstellen → Rechnungen als
                sekundärer Weg. Ziele/Links unverändert, nur Reihenfolge/Gewichtung. */}
            <div className="flex-center gap-12" style={{ flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={() => navigate("/dashboard?page=shipments", { state: { justBooked: true } })}>
                <Icon n="package" s={16} /> Zu meinen Sendungen
              </button>
              {/* Bewusster Neustart: der alte Vorgang ist beim Buchungserfolg
                  bereits gelöscht — der erneute Aufruf schützt den Fall, dass
                  der Kunde diesen Bildschirm über Browser-Zurück wieder
                  erreicht und dann neu beginnt. */}
              <button className="btn btn-outline" onClick={() => { clearFlow(); navigate("/calculator"); }}>Neue Sendung</button>
              <button className="btn btn-outline" onClick={() => navigate(INVOICES_DASHBOARD_TARGET)}>
                <Icon n="invoice" s={16} /> Zu meinen Rechnungen
              </button>
            </div>
          </div>
        )}

      </div>

      {/* ── F3: Preisdrift-Dialog („Preisänderung erkannt") — Premium-Overlay ──
          Erscheint bei /book-Antwort 409 PRICE_CHANGED (none-Pfad). Ruhige,
          nicht-aggressive Optik; der Nutzer entscheidet bewusst zwischen
          Neuberechnung und Fortfahren zum neuen Preis. */}
      {priceChange && (
        <div
          className="price-drift-overlay"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setPriceChange(null); }}
        >
          <div
            className="price-drift-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="price-drift-title"
            aria-describedby="price-drift-desc"
            ref={priceDriftRef}
          >
            <div className="price-drift-badge" aria-hidden="true"><Icon n="info" s={24} c="var(--ce-color-brand-ink)" /></div>
            <h2 id="price-drift-title" className="price-drift-title">Preisänderung erkannt</h2>
            <p id="price-drift-desc" className="price-drift-desc">
              Der Preis hat sich seit Ihrer Angebotsberechnung geändert.
            </p>

            <div className="price-drift-compare">
              <div className="price-drift-col">
                <span className="price-drift-col-label">Bisheriger Preis</span>
                <span className="price-drift-old">{money(priceChange.oldPrice)}</span>
              </div>
              <span className="price-drift-arrow" aria-hidden="true"><Icon n="arrow" s={18} c="var(--ce-color-text-muted)" /></span>
              <div className="price-drift-col price-drift-col--new">
                <span className="price-drift-col-label">Neuer Preis</span>
                <span className="price-drift-new">{money(priceChange.newPrice)}</span>
              </div>
            </div>

            <div className="price-drift-actions">
              <button
                type="button"
                className="btn btn-outline price-drift-btn"
                onClick={handlePriceChangeRecalculate}
                disabled={loading}
              >
                Angebote neu berechnen
              </button>
              <button
                type="button"
                className="btn btn-primary price-drift-btn"
                onClick={continueWithNewPrice}
                disabled={loading || asNum(priceChange.newPrice) == null}
              >
                {loading ? <><span className="spinner" /> Wird gebucht…</> : "Zum neuen Preis fortfahren"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── P0: Abholzeitfenster-Drift-Dialog („Abholzeitfenster geändert") ──
          Erscheint bei /book-Antwort 409 PICKUP_WINDOW_CHANGED. Zeigt die neuen
          verfügbaren Grenzen, stoppt die Buchung und überschreibt das gewählte
          Fenster NICHT still. Der Nutzer entscheidet bewusst: Angebote neu
          berechnen ODER das neue vollständige Fenster übernehmen (Draft NULL/NULL,
          erst danach erneut buchbar). Bewusst KEINE generische Duplikatmeldung. */}
      {pickupWindowChanged && (
        <div
          className="price-drift-overlay"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget && !pickupResetting) setPickupWindowChanged(null); }}
        >
          <div
            className="price-drift-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pickup-drift-title"
            aria-describedby="pickup-drift-desc"
            ref={pickupDriftRef}
          >
            <div className="price-drift-badge" aria-hidden="true"><Icon n="clock" s={24} c="var(--ce-color-brand-ink)" /></div>
            <h2 id="pickup-drift-title" className="price-drift-title">Abholzeitfenster geändert</h2>
            <p id="pickup-drift-desc" className="price-drift-desc">
              Das verfügbare Abholzeitfenster hat sich seit Ihrer Auswahl geändert. Ihr zuvor
              gewähltes Fenster ist nicht mehr verfügbar.
            </p>

            <div className="price-drift-compare" style={{ justifyContent: "center" }}>
              <div className="price-drift-col price-drift-col--new">
                <span className="price-drift-col-label">Neu verfügbar</span>
                <span className="price-drift-new">{pickupWindowChanged.availableFrom}–{pickupWindowChanged.availableUntil} Uhr</span>
              </div>
            </div>
            {Number.isFinite(pickupWindowChanged.minimumMinutes) && pickupWindowChanged.minimumMinutes > 0 && (
              <p className="price-drift-desc">Mindestdauer des Fensters: {formatDuration(pickupWindowChanged.minimumMinutes)}.</p>
            )}

            {pickupResetError && <div className="alert alert-error mb-16">{pickupResetError}</div>}

            <div className="price-drift-actions">
              <button
                type="button"
                className="btn btn-outline price-drift-btn"
                onClick={handlePickupWindowRecalculate}
                disabled={pickupResetting}
              >
                Angebote neu berechnen
              </button>
              <button
                type="button"
                className="btn btn-primary price-drift-btn"
                onClick={acceptNewPickupWindow}
                disabled={pickupResetting}
              >
                {pickupResetting ? <><span className="spinner" /> Wird übernommen…</> : "Neues Zeitfenster übernehmen"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
