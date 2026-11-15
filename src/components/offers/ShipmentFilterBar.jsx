import { useEffect, useRef } from "react";
import { DateCalendar } from "../common/DateCalendar";
import DeliveryTimeSelect from "./DeliveryTimeSelect.jsx";
import { todayISO, addDaysISO, labelForDate, fmtShortDE } from "../../utils/date";
import { latestDeliveryFieldValue } from "../../utils/deliveryTimeView.mjs";
import { publicCarrierChipLabel } from "../../utils/carrierMap";

/* ── ShipmentFilterBar ───────────────────────────────────────────────────────
   Die gemeinsame Filterleiste von „Neue Sendung" und Versandkostenrechner:
   fünf aufklappbare Panels (Abholung/Shopabgabe · Versanddatum · Versanddienst ·
   Versandart · Späteste Lieferzeit). Bis zur Modularisierung Phase 2 stand
   dieses Markup wortgleich in BEIDEN Seiten (222 Zeilen je Seite, gemessen
   31 Zeilen Diff — davon 4 Kommentare, der Leer-Hinweis des Carrier-Panels,
   das idPrefix und Blockenden). Es ist eine reine DARSTELLUNG: sämtlicher
   Zustand, alle Handler und die Optionslisten bleiben in den Seiten und kommen
   als Props — die Filterlogik (FILTER_ONLY_FIELDS, clearFilters, calcKeyRef)
   ist bewusst NICHT Teil dieses Bauteils.

   Redesign 2026-10: keine Symbole in den Filtern. Jeder Auslöser trägt
   Beschriftung + aktuellen Wert als Text; dass er aufklappt, zeigt eine kleine,
   rein per CSS gezeichnete Klappmarke (kein Icon) und aria-expanded. Werte
   werden vollständig gezeigt — sie brechen um, statt abgeschnitten zu werden.

   Bediensystem (Betreiberauftrag 2026-11-14): Es ist immer höchstens EIN Panel
   offen. Öffnen schließt die anderen; ein Druck außerhalb des offenen Panels,
   Escape und ein Fokuswechsel aus dem Panel heraus schließen es; nach Escape
   steht der Fokus wieder auf dem Auslöser (nur wenn er zuvor im Panel lag).
   Ein Druck auf den Auslöser eines anderen Filters wechselt mit dem Klick.
   Das ist reiner Bedienzustand der Panels — die Seiten behalten Zustand und
   Handler, und kein Filterwert ändert sich dadurch. Außendruck und Escape
   liegen nur hier (die Seiten hatten sie früher für den Carrierfilter). */
export function ShipmentFilterBar({
  serviceFilterOpen, setServiceFilterOpen, selectedOption, SERVICE_OPTIONS, serviceFilter, handleServiceFilter,
  datePickerOpen, setDatePickerOpen, shippingDate, handleDateChange,
  carrierDropdownOpen, setCarrierDropdownOpen, carrierLabel,
  selectedPublicCarrierIds, setSelectedPublicCarrierIds, resetResults,
  publicCarriers, selectedPublicSet, handleTogglePublicCarrier,
  shippingModeOpen, setShippingModeOpen, selectedShippingMode, SHIPPING_MODE_OPTIONS, shippingModeFilter, handleShippingMode,
  latestOpen, setLatestOpen, form, handleLatestDeliveryChange, handleLatestDeliveryTimeChange, zeitOptionen,
  idPrefix, carrierEmptyHint, dateError,
}) {
  // Versanddatum als Formularfeld (Auftrag 1, P11): `data-field` ist das Ziel von
  // focusFirstError(); ein Fehler steht sichtbar unter dem Auslöser und ist per
  // aria-describedby verbunden. Ohne `dateError` ist das Markup unverändert.
  const datumFehlerId = `${idPrefix || "filter"}-date-err`;

  // ── Höchstens ein offenes Panel ──
  const panels = [
    ["service", serviceFilterOpen, setServiceFilterOpen],
    ["date", datePickerOpen, setDatePickerOpen],
    ["carrier", carrierDropdownOpen, setCarrierDropdownOpen],
    ["mode", shippingModeOpen, setShippingModeOpen],
    ["latest", latestOpen, setLatestOpen],
  ];
  const offen = panels.find(([, istOffen]) => istOffen)?.[0] ?? null;
  const schliesseOffenes = useRef(() => {});
  schliesseOffenes.current = () => panels.forEach(([, istOffen, setze]) => { if (istOffen) setze(false); });
  const ausloeser = useRef({});
  const panelKnoten = useRef({});
  // Der letzte Druck, der im React-Baum durch ein Panel lief — auch aus einem Portal heraus (die Uhrzeitliste von
  // DeliveryTimeSelect hängt an document.body und ist kein DOM-Nachfahre des Panels). React stellt das mousedown am
  // Wurzel- bzw. Portalcontainer zu, VOR dem Dokument-Listener unten; verglichen wird das Ereignisobjekt selbst.
  // `aufAusloeser`: der Druck traf den Auslöser dieses Panels. Mit dem Loslassen ist der Druck vorbei.
  const druck = useRef(null);
  const merkeDruck = (schluessel) => (e) => {
    druck.current = { schluessel, ereignis: e.nativeEvent, aufAusloeser: !!ausloeser.current[schluessel]?.contains(e.target) };
  };
  useEffect(() => {
    const losgelassen = () => { druck.current = null; };
    document.addEventListener("mouseup", losgelassen);
    return () => document.removeEventListener("mouseup", losgelassen);
  }, []);
  // Wechsel per Zeiger: Ein Druck auf den Auslöser eines ANDEREN Panels schließt das offene erst mit dem Klick
  // (umschalten), nicht schon beim Drücken. Auf schmalen Breiten liegen die Panels im Fluss; schlösse das offene schon
  // beim Drücken (Außendruck oder Fokuswechsel), rückte der gedrückte Auslöser unter dem Zeiger weg und der Klick ginge
  // ins Leere — gemessen bei 768, 390 und 360 px.
  const wechselPerZeiger = (ziel) => {
    const d = druck.current;
    return !!d && d.aufAusloeser && d.schluessel !== offen && !!ausloeser.current[d.schluessel]?.contains(ziel);
  };

  // Öffnen schließt die übrigen Panels; ein offenes Panel schließt sein Auslöser.
  const umschalten = (schluessel) => {
    for (const [k, , setze] of panels) {
      if (k === schluessel) setze((o) => !o);
      else setze(false);
    }
  };

  useEffect(() => {
    if (!offen) return undefined;
    const aussen = (e) => {
      const d = druck.current;
      if (d && d.ereignis === e && (d.schluessel === offen || d.aufAusloeser)) return;
      schliesseOffenes.current();
    };
    const taste = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const fokusImPanel = panelKnoten.current[offen]?.contains(document.activeElement);
      schliesseOffenes.current();
      if (fokusImPanel) ausloeser.current[offen]?.focus();
    };
    document.addEventListener("mousedown", aussen);
    document.addEventListener("keydown", taste);
    return () => {
      document.removeEventListener("mousedown", aussen);
      document.removeEventListener("keydown", taste);
    };
  }, [offen]);

  // Fokus verlässt das offene Panel (Tab zum nächsten Auslöser, ins Formular): das Panel schließt. Ohne neues
  // Fokusziel (Klick auf eine nicht fokussierbare Fläche) entscheidet der Druck-Listener oben.
  const beiFokusVerlust = (schluessel) => (e) => {
    if (schluessel !== offen || !e.relatedTarget) return;
    if (e.currentTarget.contains(e.relatedTarget) || wechselPerZeiger(e.relatedTarget)) return;
    schliesseOffenes.current();
  };
  // Gemeinsame Eigenschaften je Panel: Knoten, Druckmarke, Fokusverlust.
  const panelProps = (schluessel) => ({
    onMouseDown: merkeDruck(schluessel),
    onBlur: beiFokusVerlust(schluessel),
  });
  const merkePanel = (schluessel) => (el) => { panelKnoten.current[schluessel] = el; };
  const merkeAusloeser = (schluessel) => (el) => { ausloeser.current[schluessel] = el; };

  return (
          <div className="calc-filter-bar mb-16">
            {/* Service Filter */}
            <div className="calc-panel" ref={merkePanel("service")} {...panelProps("service")}>
              <button
                type="button"
                ref={merkeAusloeser("service")}
                className="service-filter-trigger"
                onClick={() => umschalten("service")}
                aria-expanded={serviceFilterOpen}
              >
                <div className="service-filter-trigger-left">
                  <div>
                    <div className="service-filter-trigger-title">Abholung / Shopabgabe</div>
                    <div className="service-filter-trigger-val">{selectedOption.label}</div>
                  </div>
                </div>
                <span className={`service-filter-chevron ${serviceFilterOpen ? "open" : ""}`} aria-hidden="true" />
              </button>
              {serviceFilterOpen && (
                <div className="service-filter-dropdown" role="radiogroup" aria-label="Abholung / Shopabgabe">
                  {SERVICE_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      className={`service-filter-option service-filter-option--radio ce-wahl ce-wahl--zeile ${serviceFilter === opt.id ? "selected" : ""}`}
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
            <div className={`calc-panel${dateError ? " calc-panel--error" : ""}`} ref={merkePanel("date")} {...panelProps("date")}>
              <button
                type="button"
                ref={merkeAusloeser("date")}
                className="service-filter-trigger"
                onClick={() => umschalten("date")}
                aria-expanded={datePickerOpen}
                data-field="shippingDate"
                aria-invalid={dateError ? "true" : undefined}
                aria-describedby={dateError ? datumFehlerId : undefined}
              >
                <div className="service-filter-trigger-left">
                  <div>
                    <div className="service-filter-trigger-title">Versanddatum</div>
                    <div className="service-filter-trigger-val">{shippingDate ? labelForDate(shippingDate) : "Bitte Datum wählen"}</div>
                  </div>
                </div>
                <span className={`service-filter-chevron ${datePickerOpen ? "open" : ""}`} aria-hidden="true" />
              </button>
              {datePickerOpen && (
                <div className="date-picker-body">
                  <div className="date-quick-options ce-segment">
                    <button className={`date-quick-btn ce-segment-option ${shippingDate === todayISO()    ? "active" : ""}`} onClick={() => handleDateChange(todayISO())}>Heute</button>
                    <button className={`date-quick-btn ce-segment-option ${shippingDate === addDaysISO(1) ? "active" : ""}`} onClick={() => handleDateChange(addDaysISO(1))}>Morgen</button>
                    <button className={`date-quick-btn ce-segment-option ${shippingDate === addDaysISO(2) ? "active" : ""}`} onClick={() => handleDateChange(addDaysISO(2))}>Übermorgen</button>
                  </div>
                  <DateCalendar
                    value={shippingDate}
                    onSelect={handleDateChange}
                    minDate={todayISO()}
                    onClose={() => setDatePickerOpen(false)}
                  />
                </div>
              )}
              {dateError && <span className="field-error calc-panel-error" id={datumFehlerId}>{dateError}</span>}
            </div>

            {/* Carrier Filter */}
            <div className="calc-panel" ref={merkePanel("carrier")} {...panelProps("carrier")}>
              <button
                type="button"
                ref={merkeAusloeser("carrier")}
                className="service-filter-trigger"
                onClick={() => umschalten("carrier")}
                aria-expanded={carrierDropdownOpen}
              >
                <div className="service-filter-trigger-left">
                  <div>
                    <div className="service-filter-trigger-title">Versanddienst</div>
                    <div className="service-filter-trigger-val">{carrierLabel}</div>
                  </div>
                  {selectedPublicCarrierIds.length > 0 && (
                    <span className="carrier-badge">{selectedPublicCarrierIds.length}</span>
                  )}
                </div>
                <span className={`service-filter-chevron ${carrierDropdownOpen ? "open" : ""}`} aria-hidden="true" />
              </button>
              {carrierDropdownOpen && (
                <div className="carrier-dropdown" role="group" aria-label="Versanddienst">
                  {/* Mehrfachauswahl: quadratisches Auswahlfeld; die Einfachauswahl daneben
                      („Abholung / Shopabgabe", „Versandart") ist im Kundenbereich eine Navy-Wahl
                      mit Haken (`ce-wahl`, reine Darstellung). Bleibt bewusst so — role="checkbox"
                      trägt die Mehrfachauswahl-Semantik; Chip-Key = publicCarrier.id, Label =
                      publicCarrier.name („other" → „Versanddienstleister"). */}
                  <button
                    type="button"
                    className={`service-filter-option service-filter-option--check ${selectedPublicCarrierIds.length === 0 ? "selected" : ""}`}
                    role="checkbox"
                    aria-checked={selectedPublicCarrierIds.length === 0}
                    onClick={() => { setSelectedPublicCarrierIds([]); resetResults(); }}
                  >
                    <span className="service-filter-check" aria-hidden="true" />
                    <div className="service-filter-option-text">
                      <div className="service-filter-option-label">Alle Dienstleister</div>
                    </div>
                  </button>
                  {publicCarriers.length === 0 ? (
                    <div className="carrier-empty-hint">{carrierEmptyHint}</div>
                  ) : (
                    <>
                      <div className="carrier-divider" />
                      {publicCarriers.map(pc => (
                        <button
                          key={pc.id}
                          type="button"
                          className={`service-filter-option service-filter-option--check ${selectedPublicSet.has(pc.id) ? "selected" : ""}`}
                          role="checkbox"
                          aria-checked={selectedPublicSet.has(pc.id)}
                          onClick={() => handleTogglePublicCarrier(pc.id)}
                        >
                          <span className="service-filter-check" aria-hidden="true" />
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
            <div className="calc-panel" ref={merkePanel("mode")} {...panelProps("mode")}>
              <button
                type="button"
                ref={merkeAusloeser("mode")}
                className="service-filter-trigger"
                onClick={() => umschalten("mode")}
                aria-expanded={shippingModeOpen}
              >
                <div className="service-filter-trigger-left">
                  <div>
                    <div className="service-filter-trigger-title">Versandart</div>
                    <div className="service-filter-trigger-val">{selectedShippingMode.label}</div>
                  </div>
                </div>
                <span className={`service-filter-chevron ${shippingModeOpen ? "open" : ""}`} aria-hidden="true" />
              </button>
              {shippingModeOpen && (
                <div className="service-filter-dropdown" role="radiogroup" aria-label="Versandart">
                  {SHIPPING_MODE_OPTIONS.map(opt => (
                    <button
                      key={opt.id}
                      className={`service-filter-option service-filter-option--radio ce-wahl ce-wahl--zeile ${shippingModeFilter === opt.id ? "selected" : ""}`}
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
            <div className="calc-panel" ref={merkePanel("latest")} {...panelProps("latest")}>
              <button
                type="button"
                ref={merkeAusloeser("latest")}
                className="service-filter-trigger"
                onClick={() => umschalten("latest")}
                aria-expanded={latestOpen}
              >
                <div className="service-filter-trigger-left">
                  <div>
                    <div className="service-filter-trigger-title">Späteste Lieferzeit</div>
                    <div className="service-filter-trigger-val">{latestDeliveryFieldValue(
                      form.latestDeliveryDate ? fmtShortDE(form.latestDeliveryDate) : "",
                      form.latestDeliveryTime,
                    )}</div>
                  </div>
                </div>
                <span className={`service-filter-chevron ${latestOpen ? "open" : ""}`} aria-hidden="true" />
              </button>
              {latestOpen && (
                <div className="date-picker-body date-picker-body--latest">
                  <div className="date-quick-options ce-segment">
                    <button className={`date-quick-btn ce-segment-option ${!form.latestDeliveryDate ? "active" : ""}`} onClick={() => handleLatestDeliveryChange("")}>Beliebig</button>
                  </div>
                  <DateCalendar
                    value={form.latestDeliveryDate}
                    onSelect={handleLatestDeliveryChange}
                    minDate={shippingDate}
                    onClose={() => setLatestOpen(false)}
                  />
                  <DeliveryTimeSelect
                    options={zeitOptionen}
                    value={form.latestDeliveryTime}
                    onChange={handleLatestDeliveryTimeChange}
                    hasDate={!!form.latestDeliveryDate}
                    idPrefix={idPrefix}
                  />
                </div>
              )}
            </div>
          </div>
  );
}
