import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { Icon } from "../components/ui/Icon";
import { countries } from "../utils/countries";
import { money, fmtDelivery } from "../utils/formatters";
import { publicCarrierChipLabel } from "../utils/carrierMap";
import { validatePostalCode, postalCodeExample, postalCodeInputMode, postalCodeMaxLength, isPostalCodeRequired } from "../utils/postalCode";
import { OffersList } from "../components/offers/OffersList";
import { PremiumBackground } from "../components/dashboard/PremiumBackground";
import { useAuth } from "../context/AuthContext";
import { todayISO, addDaysISO, labelForDate, fmtShortDE } from "../utils/date";
import { DateCalendar } from "../components/common/DateCalendar";
import { getFormDraft } from "../api/formDraftsApi";
import { hasSavableShipmentId } from "../utils/draftsView.mjs";
import {
  buildResumeInitialState, resumeSourceFromDraft, isValidResumeDraft, buildResumePayload,
  classifyFormDraftTransition, mapFormDraftStartError, SHIPMENT_PERSISTENCE_FAILED_MESSAGE,
} from "../utils/formDraftsView.mjs";

// ─── Validation ───────────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Paket 1: länderspezifische PLZ-Fehlermeldung über den zentralen Helfer
// (src/utils/postalCode.mjs → generierte Regeln). Kein eigenes Regex hier.
function postalErr(country, value) {
  const pc = validatePostalCode(country, value);
  if (pc.valid) return null;
  if (pc.code === "POSTAL_CODE_REQUIRED") return "PLZ ist ein Pflichtfeld.";
  const ex = postalCodeExample(country);
  return ex ? `PLZ passt nicht zum Landesformat (Beispiel: ${ex}).` : "PLZ ist ungültig.";
}

// Buchungsrelevante Felder lösen bei Änderung ein Verwerfen alter Ergebnisse
// aus. Nur die rein clientseitigen Anzeige-Filter (max_price, latestDeliveryDate)
// lassen Tarife + shipmentId unangetastet — sie filtern lediglich die bereits
// berechnete Liste, ohne die Buchungsgrundlage zu ändern.
const FILTER_ONLY_FIELDS = new Set(["max_price", "latestDeliveryDate"]);

function getErrors(form) {
  const e = {};

  if (!form.s_fullName?.trim())             e.s_fullName = "Name ist ein Pflichtfeld.";
  else if (form.s_fullName.length > 100)    e.s_fullName = "Name darf maximal 100 Zeichen enthalten.";
  if (form.s_company?.length > 200)         e.s_company  = "Unternehmen darf maximal 200 Zeichen enthalten.";
  if (!form.s_street?.trim())               e.s_street   = "Straße ist ein Pflichtfeld.";
  else if (form.s_street.length > 200)      e.s_street   = "Straße darf maximal 200 Zeichen enthalten.";
  if (form.s_addition?.length > 100)        e.s_addition = "Adresszusatz darf maximal 100 Zeichen enthalten.";
  { const m = postalErr(form.s_country, form.s_zip); if (m) e.s_zip = m; }
  if (!form.s_city?.trim())                 e.s_city     = "Stadt ist ein Pflichtfeld.";
  else if (form.s_city.length > 100)        e.s_city     = "Stadt darf maximal 100 Zeichen enthalten.";
  if (form.s_email) {
    if (form.s_email.length > 254)          e.s_email    = "E-Mail darf maximal 254 Zeichen enthalten.";
    else if (!EMAIL_RE.test(form.s_email))  e.s_email    = "E-Mail-Adresse ist ungültig.";
  }

  if (!form.r_fullName?.trim())             e.r_fullName = "Name ist ein Pflichtfeld.";
  else if (form.r_fullName.length > 100)    e.r_fullName = "Name darf maximal 100 Zeichen enthalten.";
  if (form.r_company?.length > 200)         e.r_company  = "Unternehmen darf maximal 200 Zeichen enthalten.";
  if (!form.r_street?.trim())               e.r_street   = "Straße ist ein Pflichtfeld.";
  else if (form.r_street.length > 200)      e.r_street   = "Straße darf maximal 200 Zeichen enthalten.";
  if (form.r_addition?.length > 100)        e.r_addition = "Adresszusatz darf maximal 100 Zeichen enthalten.";
  { const m = postalErr(form.r_country, form.r_zip); if (m) e.r_zip = m; }
  if (!form.r_city?.trim())                 e.r_city     = "Stadt ist ein Pflichtfeld.";
  else if (form.r_city.length > 100)        e.r_city     = "Stadt darf maximal 100 Zeichen enthalten.";
  if (form.r_email) {
    if (form.r_email.length > 254)          e.r_email    = "E-Mail darf maximal 254 Zeichen enthalten.";
    else if (!EMAIL_RE.test(form.r_email))  e.r_email    = "E-Mail-Adresse ist ungültig.";
  }

  if (!form.packageCount) {
    e.packageCount = "Anzahl muss zwischen 1 und 99 liegen.";
  } else {
    const pc = Number(form.packageCount);
    if (!Number.isInteger(pc) || pc < 1 || pc > 99) e.packageCount = "Anzahl muss zwischen 1 und 99 liegen.";
  }
  if (!form.weight) {
    e.weight = "Gewicht ist ein Pflichtfeld.";
  } else {
    const w = Number(form.weight);
    if (isNaN(w) || w < 0.1 || w > 1000) e.weight = "Gewicht muss zwischen 0,1 und 1.000 kg liegen.";
  }
  if (form.length) { const v = Number(form.length); if (isNaN(v) || v < 0.1 || v > 300) e.length = "Länge muss zwischen 0,1 und 300 cm liegen."; }
  if (form.width)  { const v = Number(form.width);  if (isNaN(v) || v < 0.1 || v > 300) e.width  = "Breite muss zwischen 0,1 und 300 cm liegen."; }
  if (form.height) { const v = Number(form.height); if (isNaN(v) || v < 0.1 || v > 300) e.height = "Höhe muss zwischen 0,1 und 300 cm liegen."; }

  return e;
}

// ─── Filter / Sort options ─────────────────────────────────────────────────────
const SERVICE_OPTIONS = [
  { id: "all",          icon: "dashboard", label: "Alle Dienstleistungen", desc: "Tarife für die Abholung Zuhause / im Büro und für die Shopabgabe anzeigen" },
  { id: "pickup",       icon: "truck",     label: "Nur Abholung",          desc: "Tarife für die Abholung Zuhause / im Büro anzeigen"  },
  { id: "dropoff",      icon: "map",       label: "Nur Abgabe",            desc: "Tarife für die Abgabe in einem Paketshop anzeigen"      },
  { id: "pickup_today", icon: "zap",       label: "Abholung heute",        desc: "Tarife mit Abholung noch heute anzeigen" },
];

const SHIPPING_MODE_OPTIONS = [
  { id: "all",      icon: "package", label: "Alle Versandarten", desc: "Standard, Express und Economy anzeigen" },
  { id: "standard", icon: "truck",   label: "Standard",          desc: "Regulärer Versand ohne Aufpreis"        },
  { id: "express",  icon: "zap",     label: "Express",           desc: "Schnellste verfügbare Zustellung"       },
  { id: "economy",  icon: "clock",   label: "Economy",           desc: "Günstigster Tarif, längere Laufzeit"    },
];

export default function NewShipmentPage({ prefillAddress, onPrefillApplied, resumeDraft, onResumeApplied } = {}) {
  const { authed, user } = useAuth();
  const navigate = useNavigate();

  // ── Fortsetzen eines Formularentwurfs (mount-once) ───────────────────────────
  // Ein gültiger Resume-Payload rehydriert das Formular aus dem Snapshot und hat
  // Vorrang vor dem Profil-Prefill (das Profil wird dann NICHT als Sender-Seed
  // verwendet). Einmalig beim Mount berechnet — Prop-Änderungen (das Zurücksetzen
  // im Elternteil über onResumeApplied) lösen KEINE erneute Anwendung aus.
  const resumeInitRef = useRef(undefined);
  if (resumeInitRef.current === undefined) {
    resumeInitRef.current = isValidResumeDraft(resumeDraft)
      ? buildResumeInitialState(resumeDraft.formData, { today: todayISO() })
      : null;
  }
  const resumeInit = resumeInitRef.current;

  // ── Filters ──
  const [serviceFilter, setServiceFilter]         = useState(resumeInit ? resumeInit.serviceFilter : "all");
  const [serviceFilterOpen, setServiceFilterOpen] = useState(false);
  const [shippingModeFilter, setShippingModeFilter] = useState(resumeInit ? resumeInit.shippingModeFilter : "all");
  const [shippingModeOpen, setShippingModeOpen]     = useState(false);
  const [shippingDate, setShippingDate]             = useState(() => (resumeInit && resumeInit.shippingDate) ? resumeInit.shippingDate : todayISO());
  const [datePickerOpen, setDatePickerOpen]         = useState(false);
  const [selectedPublicCarrierIds, setSelectedPublicCarrierIds] = useState(resumeInit ? resumeInit.selectedPublicCarrierIds : []);
  const [carrierDropdownOpen, setCarrierDropdownOpen] = useState(false);
  const [publicCarriers, setPublicCarriers]         = useState([]);
  const carrierRef = useRef(null);

  // ── Späteste Lieferzeit — Popover-Status (Wert latestDeliveryDate liegt im form) ──
  const [latestOpen, setLatestOpen] = useState(false);

  // ── Sort ──
  const [sortMode, setSortMode] = useState("recommended");

  // ── VAT display mode ──
  const [vatMode, setVatMode] = useState("net");

  // ── Form ──
  // Resume-Fall: Formular kommt vollständig aus dem Snapshot (resumeInit.form).
  // Normalfall: unverändert aus dem Profil geseedet (synchron beim Mount).
  const [form, setForm] = useState(() => resumeInit ? resumeInit.form : ({
    s_company:  user?.company_name || "",
    s_fullName: user?.name         || "",
    s_street:   user?.street       || "",
    s_addition: "",
    s_zip:      user?.zip          || "",
    s_city:     user?.city         || "",
    s_country:  user?.country      || "DE",
    s_phone:    user?.phone        || "",
    s_email:    user?.email        || "",
    r_company:  "",
    r_fullName: "",
    r_street:   "",
    r_addition: "",
    r_zip:      "",
    r_city:     "",
    r_country:  "CH",
    r_phone:    "",
    r_email:    "",
    packageCount: "1",
    weight: "", length: "", width: "", height: "",
    max_price: "", latestDeliveryDate: "",
  }));

  // ── Results ──
  const [tariffs, setTariffs]       = useState([]);
  const [shipmentId, setShipmentId] = useState(null);
  // Zoll-Top-Level aus calculate-price (routenbezogen, NICHT pro Tarif) — nur
  // gespeichert und an BookingPage weitergereicht. Keine eigene EU-Logik hier.
  const [customs, setCustoms]       = useState(null);
  const [selected, setSelected]     = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [hasResults, setHasResults] = useState(false);
  const [errors, setErrors]         = useState({});
  // Paket 1: anstehender Länderwechsel mit vorhandenen Adressdaten → Bestätigungsdialog.
  const [pendingCountry, setPendingCountry] = useState(null); // { party:"s"|"r", from, to } | null

  // ── Fortsetzen-Status (nur aktiv, wenn ein Formularentwurf fortgesetzt wird) ──
  // resumeSource trägt die Übergangs-Metadaten (interne Formularentwurf-ID +
  // Revision), die beim nächsten „Preise berechnen" EINMALIG mitgesendet werden.
  const [resumeSource, setResumeSource]       = useState(() => resumeSourceFromDraft(resumeDraft)); // { id, revision } | null
  const [resumeNotice, setResumeNotice]       = useState("");     // nicht blockierender Hinweis
  const [resumeConflict, setResumeConflict]   = useState(false);  // 409 Konflikt → „Aktuelle Version laden"
  const [reloadingResume, setReloadingResume] = useState(false);

  // ── Race-Schutz für /calculate-price (Audit F1) ──
  // Verhindert, dass eine spät eintreffende Antwort neuere Eingaben überschreibt.
  //  • calcSeq    — steigende Sequence; nur die Antwort des jeweils neuesten
  //                 Aufrufs darf State/Loading verändern.
  //  • calcAbort  — bricht einen noch laufenden Request ab, sobald ein neuer
  //                 startet (und beim Unmount). Genau ein aktiver Request.
  //  • calcKeyRef — Live-Schlüssel der Payload-bestimmenden Eingaben (bei jedem
  //                 Render aktualisiert); erkennt, ob sich die Eingaben seit dem
  //                 Absenden geändert haben → veraltete Antwort verwerfen.
  const calcSeq    = useRef(0);
  const calcAbort  = useRef(null);
  const calcKeyRef = useRef("");

  const selectedOption       = SERVICE_OPTIONS.find(o => o.id === serviceFilter)             || SERVICE_OPTIONS[0];
  const selectedShippingMode = SHIPPING_MODE_OPTIONS.find(o => o.id === shippingModeFilter)  || SHIPPING_MODE_OPTIONS[0];

  // Filter-State enthält ausschließlich öffentliche IDs; die deduplizierte
  // publicCarriers-Liste des Backends wird unverändert für die Chips verwendet.
  const selectedPublicSet = useMemo(() => new Set(selectedPublicCarrierIds), [selectedPublicCarrierIds]);
  const selectedLabels = useMemo(
    () => publicCarriers.filter(pc => selectedPublicSet.has(pc.id)).map(publicCarrierChipLabel),
    [publicCarriers, selectedPublicSet]
  );

  const carrierLabel =
    selectedPublicCarrierIds.length === 0 ? "Alle Dienstleister" :
    selectedLabels.length <= 2  ? selectedLabels.join(", ") :
    `${selectedPublicCarrierIds.length} ausgewählt`;

  const upd = (k, v) => {
    setForm(p => ({ ...p, [k]: v }));
    setErrors(p => { if (!p[k]) return p; const n = { ...p }; delete n[k]; return n; });
    // Stale-State-Schutz: Ändert sich ein buchungsrelevantes Feld (Absender-,
    // Empfänger-, Paket- oder Routendaten), werden alte Tarife UND die
    // shipmentId verworfen. So kann niemals ein veralteter Tarif / eine alte
    // shipmentId mit nachträglich geänderten Daten an /book gehen — der Nutzer
    // muss zwingend erneut „Preise berechnen“ ausführen.
    if (!FILTER_ONLY_FIELDS.has(k)) invalidateResults();
  };

  const volWeight = form.length && form.width && form.height
    ? ((Number(form.length) * Number(form.width) * Number(form.height)) / 5000).toFixed(2) : null;
  const chargeWeight = volWeight && form.weight
    ? Math.max(Number(form.weight), Number(volWeight)).toFixed(2) : form.weight || null;

  const calcValid = Object.keys(getErrors(form)).length === 0;

  const buildParty = (p) => ({
    ...(form[`${p}_company`]  ? { company:         form[`${p}_company`]  } : {}),
    fullName:        form[`${p}_fullName`],
    streetAndNumber: form[`${p}_street`],
    ...(form[`${p}_addition`] ? { addressAddition: form[`${p}_addition`] } : {}),
    postalCode:      form[`${p}_zip`],
    city:            form[`${p}_city`],
    country:         form[`${p}_country`],
    ...(form[`${p}_phone`] ? { phone: form[`${p}_phone`] } : {}),
    ...(form[`${p}_email`] ? { email: form[`${p}_email`] } : {}),
  });

  const resetResults = () => {
    setHasResults(false);
    setTariffs([]);
    setSelected(null);
    setShipmentId(null); // alte shipmentId mit verwerfen → nie mit neuen Daten buchbar
    setCustoms(null);    // alte Zollentscheidung mit verwerfen
    setError("");
  };

  // Verwirft ein vorhandenes Ergebnis nur, wenn überhaupt eines existiert.
  // Vermeidet unnötige Re-Renders bei jedem Tastendruck im noch leeren
  // Formular (vor der ersten Preisberechnung gibt es nichts zu invalidieren).
  const invalidateResults = () => {
    if (hasResults || shipmentId || tariffs.length > 0 || selected) resetResults();
  };

  // ── Adressbuch → „Neue Sendung": optionaler Werte-Patch ─────────────────────
  // Reiner Wertekopie in das bestehende Formular (s_*/r_*-Felder) — KEINE
  // dauerhafte addressId-Referenz, KEINE automatische Preisberechnung/Buchung.
  // Wird genau einmal beim Mount angewendet (Effekt feuert nur, wenn
  // prefillAddress tatsächlich gesetzt ist) und danach über onPrefillApplied
  // im Elternteil zurückgesetzt — ein erneuter Mount ohne neues Prefill
  // wendet also nichts an. Ohne die Props (Default undefined) ist dieser
  // Effekt ein No-Op → bestehendes Verhalten bleibt vollständig unverändert.
  useEffect(() => {
    if (!prefillAddress) return;
    setForm((prev) => ({ ...prev, ...prefillAddress }));
    invalidateResults();
    onPrefillApplied?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillAddress]);

  // ── Paket 1: sicherer Länderwechsel ──────────────────────────────────────────
  // Beim MANUELLEN Wechsel des Landes dürfen landabhängige Felder (Straße, Zusatz,
  // PLZ, Ort) nicht unbemerkt stehen bleiben (bewiesene stale-data-Ursache: DE-PLZ
  // mit FR-Land). Sind solche Felder befüllt, erst per Dialog bestätigen. Firmen-/
  // Kontaktfelder (Unternehmen, Ansprechpartner, Telefon, E-Mail) bleiben erhalten.
  // Ein Bundesland-/Regionfeld existiert im Formular nicht → nichts zu leeren.
  const countryName = (code) => countries.find(c => c.code === code)?.name || code;
  const partyHasAddressData = (p) =>
    ["street", "addition", "zip", "city"].some(k => (form[`${p}_${k}`] || "").trim() !== "");
  const requestCountryChange = (p, next) => {
    if (!next || next === form[`${p}_country`]) return;
    if (partyHasAddressData(p)) setPendingCountry({ party: p, from: form[`${p}_country`], to: next });
    else upd(`${p}_country`, next); // keine Adressdaten → direkt wechseln, kein Dialog
  };
  const confirmCountryChange = () => {
    if (!pendingCountry) return;
    const p = pendingCountry.party, to = pendingCountry.to;
    setForm(prev => ({ ...prev, [`${p}_country`]: to, [`${p}_street`]: "", [`${p}_addition`]: "", [`${p}_zip`]: "", [`${p}_city`]: "" }));
    setErrors(prev => {
      const n = { ...prev };
      for (const k of ["country", "street", "addition", "zip", "city"]) delete n[`${p}_${k}`];
      return n;
    });
    invalidateResults(); // buchungsrelevante Änderung → alte Tarife/shipmentId verwerfen
    setPendingCountry(null);
  };
  const cancelCountryChange = () => setPendingCountry(null); // Abbruch: nichts ändern

  const handleTogglePublicCarrier = (id) => {
    setSelectedPublicCarrierIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    resetResults();
  };

  const clearFilters = () => {
    upd("max_price", "");
  };

  useEffect(() => {
    if (!carrierDropdownOpen) return;
    const onOutside = (e) => {
      if (carrierRef.current && !carrierRef.current.contains(e.target))
        setCarrierDropdownOpen(false);
    };
    const onEscape = (e) => { if (e.key === "Escape") setCarrierDropdownOpen(false); };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [carrierDropdownOpen]);

  // Der Versanddienst-Filter wird ausschließlich aus der publicCarriers-Liste der
  // calculate-price-Antwort gespeist (öffentlicher Carrier-Vertrag). Vor der ersten
  // Berechnung bleibt er bewusst leer (neutraler Hinweis) — keine Rohwert-Vorbefüllung.

  // Laufenden /calculate-price-Request beim Unmount abbrechen (kein setState
  // nach Unmount, keine hängende Antwort).
  useEffect(() => () => { if (calcAbort.current) calcAbort.current.abort(); }, []);

  // Mounted-Schutz für den „Aktuelle Version laden"-Pfad (kein AbortController).
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  // Resume-Payload genau EINMAL annehmen und im Elternteil zurücksetzen, damit
  // ein späteres normales Öffnen von „Neue Sendung" nicht erneut rehydriert.
  const resumeAppliedRef = useRef(false);
  useEffect(() => {
    if (resumeDraft && !resumeAppliedRef.current) {
      resumeAppliedRef.current = true;
      onResumeApplied?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `filtered` ist vollständig aus tariffs + den reinen Client-Filtern
  // (max_price, späteste Lieferzeit) ableitbar → als useMemo statt State +
  // useEffect + setFiltered. Das spart pro Filteränderung (v. a. Preis-Slider)
  // den zusätzlichen zweiten Render (setFiltered). Filterbedingungen und
  // Reihenfolge sind unverändert; tariffs wird nie mutiert (Kopie via Spread).
  const filtered = useMemo(() => {
    let f = [...tariffs];
    if (form.max_price) f = f.filter(t => t.netPrice != null && t.netPrice <= Number(form.max_price));
    // Client-Filter „Späteste Lieferzeit": spätestes Lieferdatum (deliveryDateMax →
    // deliveryDate). Tarife ohne Lieferdatum bleiben sichtbar (kein gültiges Angebot
    // ausblenden). Rein clientseitig — kein Recalc, kein /calculate-price-Request.
    if (form.latestDeliveryDate) f = f.filter(t => {
      const dd = t.deliveryDateMax || t.deliveryDate;
      if (!dd) return true;
      return String(dd).split("T")[0] <= form.latestDeliveryDate;
    });
    return f;
  }, [tariffs, form.max_price, form.latestDeliveryDate]);

  const sorted = React.useMemo(() => {
    if (sortMode === "recommended") return filtered;
    const copy = [...filtered];
    if (sortMode === "cheapest") return copy.sort((a, b) => (a.netPrice ?? Infinity) - (b.netPrice ?? Infinity));
    if (sortMode === "priciest") return copy.sort((a, b) => (b.netPrice ?? -1) - (a.netPrice ?? -1));
    if (sortMode === "fastest")  return copy.sort((a, b) => {
      const aMax = a.transitDaysMax ?? 999, bMax = b.transitDaysMax ?? 999;
      if (aMax !== bMax) return aMax - bMax;
      return (a.transitDaysMin ?? 999) - (b.transitDaysMin ?? 999);
    });
    return copy;
  }, [filtered, sortMode]);

  const handleServiceFilter = (id) => { setServiceFilter(id); setServiceFilterOpen(false); resetResults(); };
  const handleShippingMode  = (id) => { setShippingModeFilter(id); setShippingModeOpen(false); resetResults(); };
  const handleDateChange    = (iso) => {
    if (!iso || iso < todayISO()) return;
    setShippingDate(iso); setDatePickerOpen(false);
    // Späteste Lieferzeit darf nie vor dem Versanddatum liegen → ungültige
    // Auswahl beim Vorziehen des Versanddatums verwerfen.
    if (form.latestDeliveryDate && form.latestDeliveryDate < iso) upd("latestDeliveryDate", "");
    resetResults();
  };

  // Auswahl im „Späteste Lieferzeit"-Kalender (reiner Client-Filter, kein Recalc).
  const handleLatestDeliveryChange = (iso) => {
    upd("latestDeliveryDate", iso || "");
    setLatestOpen(false);
  };

  // Live-Schlüssel der Payload-bestimmenden Eingaben (bewusst OHNE die reinen
  // Client-Filter max_price/latestDeliveryDate — diese lösen keinen Recalc aus
  // und dürfen eine laufende Antwort nicht verwerfen). Bei jedem Render gesetzt.
  calcKeyRef.current = JSON.stringify({
    packageCount: form.packageCount, weight: form.weight,
    length: form.length, width: form.width, height: form.height,
    s: [form.s_company, form.s_fullName, form.s_street, form.s_addition, form.s_zip, form.s_city, form.s_country, form.s_phone, form.s_email],
    r: [form.r_company, form.r_fullName, form.r_street, form.r_addition, form.r_zip, form.r_city, form.r_country, form.r_phone, form.r_email],
    serviceFilter, shippingModeFilter, shippingDate, publicCarrierIds: selectedPublicCarrierIds,
  });

  const calculate = async () => {
    setHasResults(false); setTariffs([]);
    const errs = getErrors(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      setError("Bitte korrigieren Sie die markierten Felder.");
      return;
    }
    setErrors({});
    setError(""); setLoading(true); setSelected(null);
    setResumeNotice(""); setResumeConflict(false);

    // Race-Schutz: diesen Aufruf als neuesten markieren, laufenden Request
    // abbrechen und die aktuellen Eingaben als Referenz festhalten.
    const seq    = ++calcSeq.current;
    const reqKey = calcKeyRef.current;
    // Fortsetzen: Übergangs-Metadaten dieses Aufrufs festhalten (einmalig; werden
    // NUR bei einem fortgesetzten Formularentwurf mitgesendet).
    const sourceAtSend = resumeSource;
    if (calcAbort.current) calcAbort.current.abort();
    const ac = new AbortController();
    calcAbort.current = ac;

    try {
      const r = await apiFetch(`/api/jumingo/calculate-price`, {
        method: "POST", auth: true, signal: ac.signal,
        body: JSON.stringify({
          packageCount: Number(form.packageCount),
          weight: Number(form.weight), length: Number(form.length) || 30,
          width: Number(form.width) || 20, height: Number(form.height) || 15,
          sender:             buildParty("s"),
          recipient:          buildParty("r"),
          serviceFilter:      serviceFilter,
          shippingModeFilter: shippingModeFilter,
          shippingDate:       shippingDate,
          publicCarrierIds:   selectedPublicCarrierIds,
          // Fortsetzen: Source-Felder AUSSCHLIESSLICH aus der geladenen Detail-
          // response (resumeSource) — nie aus URL-Parametern oder Form-State.
          ...(sourceAtSend ? { sourceFormDraftId: sourceAtSend.id, sourceFormDraftRevision: sourceAtSend.revision } : {}),
        })
      });
      if (seq !== calcSeq.current) return;                              // durch neueren Aufruf ersetzt
      // Session ungültig/abgelaufen (Backend-Auth-Guard): apiFetch(auth:true) hat den
      // Token entfernt und den zentralen Auth-Redirect (AuthContext) bereits ausgelöst
      // → hier nur sauber aussteigen (kein irreführender Preisfehler, kein hängendes Loading).
      if (r.status === 401 || r.status === 403) { setLoading(false); return; }
      const d = await r.json();
      if (seq !== calcSeq.current) return;                              // während des Parsens ersetzt
      if (reqKey !== calcKeyRef.current) { setLoading(false); return; } // Eingaben geändert → verwerfen

      // Fortsetzen — Start-Konflikte des Übergangs (nur wenn Source mitgesendet):
      // FORM_DRAFT_CONFLICT / FORM_DRAFT_NOT_FOUND / FORM_DRAFT_CONVERSION_IN_PROGRESS.
      // Niemals automatisch erneut senden.
      if (!r.ok) {
        const startErr = sourceAtSend ? mapFormDraftStartError(d?.code) : null;
        if (startErr) {
          if (startErr.clearsSource) setResumeSource(null);          // NOT_FOUND → nächster Versuch = normal
          if (startErr.kind === "conflict") setResumeConflict(true); // „Aktuelle Version laden" anbieten
          else if (startErr.kind === "notFound") setResumeNotice(startErr.message);
          else setError(startErr.message);                           // CONVERSION_IN_PROGRESS → Hinweis am CTA
          setLoading(false);
          return;
        }
        // Paket 1: der providerneutrale PLZ-422 trägt `message` statt `error` — mit abfangen,
        // damit die konkrete Meldung erscheint (die Inline-Validierung greift zwar vorher).
        throw new Error(d.error || d.message || "Fehler bei Preisberechnung");
      }

      // Fortsetzen — Übergang nach erfolgreicher Berechnung. Die Source ist
      // „einmalig": danach laufen Neuberechnungen als normaler Neuversand.
      if (sourceAtSend) {
        const t = classifyFormDraftTransition(d.formDraftTransition);
        setResumeSource(null);
        // Sicherheits-Guard: ohne verlässliche interne Shipment-ID (z. B.
        // shipment_persistence_failed) KEINE buchbaren Angebote zeigen — die
        // Buchbarkeit darf nicht auf einer fehlenden Sendungsgrundlage beruhen.
        if (t.blocking || !hasSavableShipmentId(d.shipmentId)) {
          setError(SHIPMENT_PERSISTENCE_FAILED_MESSAGE);
          setLoading(false);
          return;
        }
        if (t.notice) setResumeNotice(t.notice); // revision_changed / cleanup_failed (nicht blockierend)
      }

      // Öffentliche Carrier-Liste (deduplziert vom Backend) übernehmen; die
      // bestehende Auswahl bleibt erhalten, auf noch verfügbare IDs gefiltert.
      const newPublicCarriers = Array.isArray(d.publicCarriers) ? d.publicCarriers : [];
      setPublicCarriers(newPublicCarriers);
      if (newPublicCarriers.length > 0) {
        const validIds = new Set(newPublicCarriers.map(pc => pc.id));
        setSelectedPublicCarrierIds(prev => prev.filter(id => validIds.has(id)));
      }
      setTariffs(d.tariffs || []);
      setShipmentId(d.shipmentId);
      // Zoll-Felder additiv übernehmen (Backend entscheidet customsRequired).
      setCustoms({
        customsRequired:   d.customsRequired === true,
        fromCountryCode:   d.fromCountryCode ?? null,
        toCountryCode:     d.toCountryCode ?? null,
        exportDeclaration: d.exportDeclaration ?? null,
      });
      setHasResults(true);
      setLoading(false);
    } catch (e) {
      if (e?.name === "AbortError") return;      // abgebrochen (neuer Request/Unmount) → kein Fehler, Loading gehört dem neuen Request
      if (seq !== calcSeq.current) return;       // veralteter Request → ignorieren
      setError(e.message === "Keine Preise gefunden"
        ? "Für die angegebenen Maße oder das Gewicht ist aktuell kein passender Tarif verfügbar."
        : e.message);
      setLoading(false);
    }
  };

  // „Aktuelle Version laden" (nach 409 FORM_DRAFT_CONFLICT): den Snapshot bewusst
  // per Nutzerklick neu holen und Formular/Filter daraus ersetzen (keine stillen
  // Überschreibungen ohne Klick). Aktualisiert die Revision und verwirft alte
  // Ergebnisse — der Nutzer berechnet danach neu.
  const reloadFormDraft = async () => {
    if (!resumeSource?.id || reloadingResume) return;
    setReloadingResume(true);
    try {
      const r = await getFormDraft(resumeSource.id);
      if (!mountedRef.current) return;
      if (r.status === 401 || r.status === 403) { setReloadingResume(false); return; }
      if (r.status === 404) {
        setResumeSource(null); setResumeConflict(false);
        setResumeNotice("Dieser Entwurf ist nicht mehr verfügbar. Du kannst die aktuellen Angaben als neue Sendung weiterverwenden.");
        setReloadingResume(false); return;
      }
      let d = null; try { d = await r.json(); } catch { d = null; }
      if (!mountedRef.current) return;
      const payload = buildResumePayload(d?.draft);
      if (!r.ok || !isValidResumeDraft(payload)) throw new Error("Die aktuelle Version konnte nicht geladen werden. Bitte versuchen Sie es erneut.");
      const init = buildResumeInitialState(payload.formData, { today: todayISO() });
      setForm(init.form);
      setShippingDate(init.shippingDate || todayISO());
      setServiceFilter(init.serviceFilter);
      setShippingModeFilter(init.shippingModeFilter);
      setSelectedPublicCarrierIds(init.selectedPublicCarrierIds);
      resetResults();                                  // frische Grundlage → alte Ergebnisse verwerfen
      setResumeSource(resumeSourceFromDraft(payload)); // aktualisierte Revision
      setResumeConflict(false); setResumeNotice("");
    } catch (e) {
      if (mountedRef.current) setError(e?.message || "Die aktuelle Version konnte nicht geladen werden. Bitte versuchen Sie es erneut.");
    }
    if (mountedRef.current) setReloadingResume(false);
  };

  // useCallback mit vollständigen Dependencies: Der Buchungs-Payload (tariff,
  // shipmentId, form, customs) bleibt exakt gleich; die Referenz ist nur stabil,
  // solange sich diese Werte nicht ändern → memoisierte OfferCards rendern durch
  // onBook nicht unnötig neu (bei reinen Angebots-Interaktionen ändern sie sich
  // nicht). setSelected ist als State-Setter stabil.
  const handleBook = useCallback((tariff) => {
    setSelected(tariff);
    if (authed) {
      navigate("/booking", { state: { tariff, shipmentId, form, customs } });
    } else {
      navigate("/login");
    }
  }, [authed, shipmentId, form, customs, navigate]);

  // Stabiles senderPrefill-Objekt (nur Paketshop-Suche bei Dropoff nutzt es) →
  // sonst bräche ein neues Objekt bei jedem Render den React.memo-Vergleich der
  // OfferCards. Werte 1:1 wie zuvor.
  const senderPrefill = useMemo(
    () => ({ postCode: form.s_zip, city: form.s_city, country: form.s_country, street: form.s_street }),
    [form.s_zip, form.s_city, form.s_country, form.s_street]
  );

  // ── Address field helpers ──
  const addrField = (p, key, label, type = "text", placeholder = "", optional = false) => {
    const fk = `${p}_${key}`;
    const errMsg = errors[fk];
    return (
      <div className="field">
        <label className="field-label">
          {label}{optional && <span className="field-optional"> (optional)</span>}
        </label>
        <input
          className={`field-input${errMsg ? " field-input-error" : ""}`}
          type={type} value={form[fk]}
          onChange={e => upd(fk, e.target.value)}
          placeholder={placeholder}
        />
        {errMsg && <span className="field-error">{errMsg}</span>}
      </div>
    );
  };

  const countrySelect = (p) => (
    <div className="field">
      <label className="field-label">Land</label>
      <select
        className="field-input field-select"
        value={form[`${p}_country`]}
        onChange={e => requestCountryChange(p, e.target.value)}
      >
        {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
      </select>
    </div>
  );

  return (
    <div className="page-with-navbar">
      <PremiumBackground variant="neutral" />

      {/* Paket 1: Bestätigungsdialog für den Länderwechsel mit vorhandenen Adressdaten.
          Abbrechen → nichts ändert sich. Bestätigen → Land setzen + Straße/Zusatz/PLZ/Ort
          leeren (Firmen-/Kontaktfelder bleiben). Reuse der price-drift-Overlay-Optik. */}
      {pendingCountry && (
        <div className="price-drift-overlay" role="presentation">
          <div className="price-drift-card" role="dialog" aria-modal="true" aria-labelledby="cc-title" aria-describedby="cc-desc">
            <div className="price-drift-badge" aria-hidden="true"><Icon n="mapPin" s={24} c="#1D4ED8" /></div>
            <h2 id="cc-title" className="price-drift-title">Land wechseln?</h2>
            <p id="cc-desc" className="price-drift-desc">
              Sie ändern das Land der {pendingCountry.party === "s" ? "Absender" : "Empfänger"}adresse von{" "}
              <strong>{countryName(pendingCountry.from)}</strong> zu <strong>{countryName(pendingCountry.to)}</strong>.
              Straße, Adresszusatz, PLZ und Ort werden geleert, damit keine unpassende Land-/PLZ-Kombination
              entsteht. Unternehmen, Ansprechpartner, Telefon und E-Mail bleiben erhalten.
            </p>
            <div className="price-drift-actions">
              <button type="button" className="btn btn-outline price-drift-btn" onClick={cancelCountryChange}>Abbrechen</button>
              <button type="button" className="btn btn-primary price-drift-btn" onClick={confirmCountryChange}>
                Land wechseln &amp; Felder leeren
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="container calc-page-wrap">
        <div className="mb-24">
          <h1 className="heading calc-page-title">Versandpreis berechnen</h1>
          <p className="calc-page-sub">Vergleichen Sie Preise von 8+ Carriern in Echtzeit</p>
        </div>

        {/* ── Form section ── */}
        <div className="offers-form-section">

          {/* Fortsetzen-Kontext (nur bei aktivem Formularentwurf-Übergang). */}
          {resumeSource && !resumeConflict && (
            <div className="dft-resume-note" role="note">
              <Icon n="form" s={16} c="#1D4ED8" />
              <span>Sie setzen einen gespeicherten Formularentwurf fort. Prüfen Sie die Angaben und berechnen Sie die Preise neu.</span>
            </div>
          )}
          {resumeConflict && (
            <div className="dft-resume-conflict" role="alert">
              <Icon n="info" s={16} c="currentColor" />
              <span className="dft-resume-conflict-text">Dieser Entwurf wurde inzwischen geändert. Lade die aktuelle Version neu, bevor du fortfährst.</span>
              <button type="button" className="btn btn-outline btn-sm" onClick={reloadFormDraft} disabled={reloadingResume}>
                {reloadingResume ? <><span className="spinner spinner-dark" style={{ width: 13, height: 13 }} /> Wird geladen …</> : "Aktuelle Version laden"}
              </button>
            </div>
          )}
          {resumeNotice && (
            <div className="dft-resume-info" role="status">
              <Icon n="info" s={16} c="currentColor" /><span>{resumeNotice}</span>
            </div>
          )}

          {/* Obere Premium-Filterleiste: fünf Filter nebeneinander (Desktop),
              responsives Grid auf Tablet/Mobile. Reine Darstellung. */}
          <div className="calc-filter-bar mb-16">
            {/* Service Filter */}
            <div className="calc-panel">
              <button
                className="service-filter-trigger"
                onClick={() => setServiceFilterOpen(o => !o)}
                aria-expanded={serviceFilterOpen}
              >
                <div className="service-filter-trigger-left">
                  <Icon n={selectedOption.icon} s={15} c="#1D4ED8" />
                  <div>
                    <div className="service-filter-trigger-title">Abholung / Shopabgabe</div>
                    <div className="service-filter-trigger-val">{selectedOption.label}</div>
                  </div>
                </div>
                <div className={`service-filter-chevron ${serviceFilterOpen ? "open" : ""}`}>
                  <Icon n="chevron" s={16} c="#64748b" />
                </div>
              </button>
              {serviceFilterOpen && (
                <div className="service-filter-dropdown" role="radiogroup" aria-label="Abholung / Shopabgabe">
                  {SERVICE_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      className={`service-filter-option service-filter-option--radio ${serviceFilter === opt.id ? "selected" : ""}`}
                      onClick={() => handleServiceFilter(opt.id)}
                      role="radio"
                      aria-checked={serviceFilter === opt.id}
                    >
                      <span className="service-filter-radio" aria-hidden="true" />
                      <div className="service-filter-option-text">
                        <div className="service-filter-option-label">{opt.label}</div>
                        <div className="service-filter-option-desc">{opt.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Versanddatum */}
            <div className="calc-panel">
              <button
                className="service-filter-trigger"
                onClick={() => setDatePickerOpen(o => !o)}
                aria-expanded={datePickerOpen}
              >
                <div className="service-filter-trigger-left">
                  <Icon n="clock" s={15} c="#1D4ED8" />
                  <div>
                    <div className="service-filter-trigger-title">Versanddatum</div>
                    <div className="service-filter-trigger-val">{labelForDate(shippingDate)}</div>
                  </div>
                </div>
                <div className={`service-filter-chevron ${datePickerOpen ? "open" : ""}`}>
                  <Icon n="chevron" s={16} c="#64748b" />
                </div>
              </button>
              {datePickerOpen && (
                <div className="date-picker-body">
                  <div className="date-quick-options">
                    <button className={`date-quick-btn ${shippingDate === todayISO()    ? "active" : ""}`} onClick={() => handleDateChange(todayISO())}>Heute</button>
                    <button className={`date-quick-btn ${shippingDate === addDaysISO(1) ? "active" : ""}`} onClick={() => handleDateChange(addDaysISO(1))}>Morgen</button>
                    <button className={`date-quick-btn ${shippingDate === addDaysISO(2) ? "active" : ""}`} onClick={() => handleDateChange(addDaysISO(2))}>Übermorgen</button>
                  </div>
                  <DateCalendar
                    value={shippingDate}
                    onSelect={handleDateChange}
                    minDate={todayISO()}
                    onClose={() => setDatePickerOpen(false)}
                  />
                </div>
              )}
            </div>

            {/* Carrier Filter */}
            <div className="calc-panel" ref={carrierRef}>
              <button
                className="service-filter-trigger"
                onClick={() => setCarrierDropdownOpen(o => !o)}
                aria-expanded={carrierDropdownOpen}
              >
                <div className="service-filter-trigger-left">
                  <Icon n="truck" s={15} c="#1D4ED8" />
                  <div>
                    <div className="service-filter-trigger-title">Versanddienst</div>
                    <div className="service-filter-trigger-val">{carrierLabel}</div>
                  </div>
                  {selectedPublicCarrierIds.length > 0 && (
                    <span className="carrier-badge">{selectedPublicCarrierIds.length}</span>
                  )}
                </div>
                <div className={`service-filter-chevron ${carrierDropdownOpen ? "open" : ""}`}>
                  <Icon n="chevron" s={16} c="#64748b" />
                </div>
              </button>
              {carrierDropdownOpen && (
                <div className="carrier-dropdown" role="group" aria-label="Versanddienst">
                  {/* Multi-Select mit Premium-Radio-Optik (wie „Versandart"): runder
                      Auswahlkreis + Label. role="checkbox" behält die Mehrfachauswahl-
                      Semantik; Chip-Key = publicCarrier.id, Label = publicCarrier.name
                      („other" → „Versanddienstleister"). */}
                  <button
                    type="button"
                    className={`service-filter-option service-filter-option--radio ${selectedPublicCarrierIds.length === 0 ? "selected" : ""}`}
                    role="checkbox"
                    aria-checked={selectedPublicCarrierIds.length === 0}
                    onClick={() => { setSelectedPublicCarrierIds([]); resetResults(); }}
                  >
                    <span className="service-filter-radio" aria-hidden="true" />
                    <div className="service-filter-option-text">
                      <div className="service-filter-option-label">Alle Dienstleister</div>
                    </div>
                  </button>
                  {publicCarriers.length === 0 ? (
                    <div className="carrier-empty-hint">Noch keine Versanddienstleister verfügbar</div>
                  ) : (
                    <>
                      <div className="carrier-divider" />
                      {publicCarriers.map(pc => (
                        <button
                          key={pc.id}
                          type="button"
                          className={`service-filter-option service-filter-option--radio ${selectedPublicSet.has(pc.id) ? "selected" : ""}`}
                          role="checkbox"
                          aria-checked={selectedPublicSet.has(pc.id)}
                          onClick={() => handleTogglePublicCarrier(pc.id)}
                        >
                          <span className="service-filter-radio" aria-hidden="true" />
                          <div className="service-filter-option-text">
                            <div className="service-filter-option-label">{publicCarrierChipLabel(pc)}</div>
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Versandart */}
            <div className="calc-panel">
              <button
                className="service-filter-trigger"
                onClick={() => setShippingModeOpen(o => !o)}
                aria-expanded={shippingModeOpen}
              >
                <div className="service-filter-trigger-left">
                  <Icon n={selectedShippingMode.icon} s={15} c="#1D4ED8" />
                  <div>
                    <div className="service-filter-trigger-title">Versandart</div>
                    <div className="service-filter-trigger-val">{selectedShippingMode.label}</div>
                  </div>
                </div>
                <div className={`service-filter-chevron ${shippingModeOpen ? "open" : ""}`}>
                  <Icon n="chevron" s={16} c="#64748b" />
                </div>
              </button>
              {shippingModeOpen && (
                <div className="service-filter-dropdown" role="radiogroup" aria-label="Versandart">
                  {SHIPPING_MODE_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      className={`service-filter-option service-filter-option--radio ${shippingModeFilter === opt.id ? "selected" : ""}`}
                      onClick={() => handleShippingMode(opt.id)}
                      role="radio"
                      aria-checked={shippingModeFilter === opt.id}
                    >
                      <span className="service-filter-radio" aria-hidden="true" />
                      <div className="service-filter-option-text">
                        <div className="service-filter-option-label">{opt.label}</div>
                        <div className="service-filter-option-desc">{opt.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Späteste Lieferzeit — collapsible (reiner Client-Filter, kein Recalc) ── */}
            <div className="calc-panel">
              <button
                className="service-filter-trigger"
                onClick={() => setLatestOpen(o => !o)}
                aria-expanded={latestOpen}
              >
                <div className="service-filter-trigger-left">
                  <Icon n="calendar" s={15} c="#1D4ED8" />
                  <div>
                    <div className="service-filter-trigger-title">Späteste Lieferzeit</div>
                    <div className="service-filter-trigger-val">{form.latestDeliveryDate ? fmtShortDE(form.latestDeliveryDate) : "Beliebig"}</div>
                  </div>
                </div>
                <div className={`service-filter-chevron ${latestOpen ? "open" : ""}`}>
                  <Icon n="chevron" s={16} c="#64748b" />
                </div>
              </button>
              {latestOpen && (
                <div className="date-picker-body date-picker-body--latest">
                  <div className="date-quick-options">
                    <button className={`date-quick-btn ${!form.latestDeliveryDate ? "active" : ""}`} onClick={() => { upd("latestDeliveryDate", ""); setLatestOpen(false); }}>Beliebig</button>
                  </div>
                  <DateCalendar
                    value={form.latestDeliveryDate}
                    onSelect={handleLatestDeliveryChange}
                    minDate={shippingDate}
                    onClose={() => setLatestOpen(false)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Versandroute */}
          <div className="calc-panel mb-16">
            <div className="calc-panel-header"><Icon n="globe" s={18} c="#1D4ED8" /><h3>Versandroute</h3></div>
            <div className="calc-panel-body">
              <div className="booking-addr-grid">
                <div>
                  <div className="calc-section-title">Absender</div>
                  {addrField("s", "company",  "Unternehmen",         "text",  "Firma GmbH",       true)}
                  {addrField("s", "fullName", "Vor- und Nachname *", "text",  "Max Mustermann")}
                  {addrField("s", "street",   "Straße & Hausnr. *",  "text",  "Musterstraße 1")}
                  {addrField("s", "addition", "Adresszusatz",        "text",  "Etage, c/o …",     true)}
                  <div className="field-row field-row-2">
                    <div className="field">
                      <label className="field-label">PLZ *</label>
                      <input className={`field-input${errors.s_zip  ? " field-input-error" : ""}`} value={form.s_zip}  onChange={e => upd("s_zip",  e.target.value)}
                        placeholder={postalCodeExample(form.s_country) || "PLZ"} inputMode={postalCodeInputMode(form.s_country)} maxLength={postalCodeMaxLength()} />
                      {errors.s_zip
                        ? <span className="field-error">{errors.s_zip}</span>
                        : (postalCodeExample(form.s_country)
                            ? <span className="field-hint">Beispiel: {postalCodeExample(form.s_country)}</span>
                            : (!isPostalCodeRequired(form.s_country) ? <span className="field-hint">Für dieses Land optional.</span> : null))}
                    </div>
                    <div className="field">
                      <label className="field-label">Stadt *</label>
                      <input className={`field-input${errors.s_city ? " field-input-error" : ""}`} value={form.s_city} onChange={e => upd("s_city", e.target.value)} placeholder="Stuttgart" />
                      {errors.s_city && <span className="field-error">{errors.s_city}</span>}
                    </div>
                  </div>
                  {countrySelect("s")}
                  {addrField("s", "phone", "Telefon", "tel",   "+49 711 …",    true)}
                  {addrField("s", "email", "E-Mail",  "email", "max@firma.de", true)}
                </div>
                <div>
                  <div className="calc-section-title">Empfänger</div>
                  {addrField("r", "company",  "Unternehmen",         "text",  "Firma AG",           true)}
                  {addrField("r", "fullName", "Vor- und Nachname *", "text",  "Erika Muster")}
                  {addrField("r", "street",   "Straße & Hausnr. *",  "text",  "Beispielweg 5")}
                  {addrField("r", "addition", "Adresszusatz",        "text",  "Etage, c/o …",       true)}
                  <div className="field-row field-row-2">
                    <div className="field">
                      <label className="field-label">PLZ *</label>
                      <input className={`field-input${errors.r_zip  ? " field-input-error" : ""}`} value={form.r_zip}  onChange={e => upd("r_zip",  e.target.value)}
                        placeholder={postalCodeExample(form.r_country) || "PLZ"} inputMode={postalCodeInputMode(form.r_country)} maxLength={postalCodeMaxLength()} />
                      {errors.r_zip
                        ? <span className="field-error">{errors.r_zip}</span>
                        : (postalCodeExample(form.r_country)
                            ? <span className="field-hint">Beispiel: {postalCodeExample(form.r_country)}</span>
                            : (!isPostalCodeRequired(form.r_country) ? <span className="field-hint">Für dieses Land optional.</span> : null))}
                    </div>
                    <div className="field">
                      <label className="field-label">Stadt *</label>
                      <input className={`field-input${errors.r_city ? " field-input-error" : ""}`} value={form.r_city} onChange={e => upd("r_city", e.target.value)} placeholder="Zürich" />
                      {errors.r_city && <span className="field-error">{errors.r_city}</span>}
                    </div>
                  </div>
                  {countrySelect("r")}
                  {addrField("r", "phone", "Telefon", "tel",   "+41 44 …",       true)}
                  {addrField("r", "email", "E-Mail",  "email", "erika@firma.ch", true)}
                </div>
              </div>
            </div>
          </div>

          {/* Paketdaten */}
          <div className="calc-panel mb-16">
            <div className="calc-panel-header"><Icon n="package" s={18} c="#1D4ED8" /><h3>Paketdaten</h3></div>
            <div className="calc-panel-body">
              {/* Reihenfolge: Anzahl · Gewicht · Länge · Höhe · Breite (nur Anzeige;
                  Bindings/State-Keys/Validierung unverändert). Anzahl = Anzahl
                  identischer Pakete (pro Paket: Gewicht + Maße), nur an /calculate-price. */}
              <div className="field-row field-row-5">
                <div className="field">
                  <label className="field-label">Anzahl</label>
                  <input className={`field-input${errors.packageCount ? " field-input-error" : ""}`} type="number" min="1" max="99" step="1" value={form.packageCount} onChange={e => upd("packageCount", e.target.value)} placeholder="1" />
                  {errors.packageCount
                    ? <span className="field-error">{errors.packageCount}</span>
                    : <span className="field-hint">Identische Pakete</span>}
                </div>
                <div className="field">
                  <label className="field-label">Gewicht kg *</label>
                  <input className={`field-input${errors.weight ? " field-input-error" : ""}`} type="number" value={form.weight} onChange={e => upd("weight", e.target.value)} placeholder="5" />
                  {errors.weight && <span className="field-error">{errors.weight}</span>}
                </div>
                <div className="field">
                  <label className="field-label">Länge cm</label>
                  <input className={`field-input${errors.length ? " field-input-error" : ""}`} type="number" value={form.length} onChange={e => upd("length", e.target.value)} placeholder="30" />
                  {errors.length && <span className="field-error">{errors.length}</span>}
                </div>
                <div className="field">
                  <label className="field-label">Höhe cm</label>
                  <input className={`field-input${errors.height ? " field-input-error" : ""}`} type="number" value={form.height} onChange={e => upd("height", e.target.value)} placeholder="15" />
                  {errors.height && <span className="field-error">{errors.height}</span>}
                </div>
                <div className="field">
                  <label className="field-label">Breite cm</label>
                  <input className={`field-input${errors.width  ? " field-input-error" : ""}`} type="number" value={form.width}  onChange={e => upd("width",  e.target.value)} placeholder="20" />
                  {errors.width  && <span className="field-error">{errors.width}</span>}
                </div>
              </div>
              <p className="pkg-count-note">
                <Icon n="info" s={13} c="currentColor" />
                <span>Gewicht und Maße gelten je Paket. Der Preis gilt für alle Pakete zusammen.</span>
              </p>
              {volWeight && (
                <div className="vol-weight-box">
                  <span className="vol-weight-label">Volumengewicht: {volWeight} kg</span>
                  <span className="vol-weight-value">Abrechn.: {chargeWeight} kg</span>
                </div>
              )}
            </div>
          </div>

          {/* Calculate CTA */}
          <div className="offers-calc-cta">
            <button
              className="btn btn-primary btn-full"
              onClick={calculate}
              disabled={loading || !calcValid}
            >
              {loading
                ? <><span className="spinner" /> Berechne…</>
                : <><Icon n="zap" s={18} /> Angebote vergleichen</>
              }
            </button>
            {error && <div className="alert alert-error mt-16"><Icon n="x" s={16} />{error}</div>}
          </div>
        </div>

        {/* ── Offers section ── */}
        {(hasResults || loading) && (
          <OffersList
            sorted={sorted}
            filtered={filtered}
            tariffs={tariffs}
            loading={loading}
            hasResults={hasResults}
            selected={selected}
            onSelect={setSelected}
            onBook={handleBook}
            sortMode={sortMode}
            onSortChange={setSortMode}
            onRecalculate={calculate}
            maxPrice={form.max_price}
            onMaxPriceChange={v => upd("max_price", v)}
            onClearFilters={clearFilters}
            vatMode={vatMode}
            onVatToggle={setVatMode}
            senderPrefill={senderPrefill}
          />
        )}
      </div>
    </div>
  );
}
