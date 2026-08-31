import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { OfferCard } from "./OfferCard";
import { assignBadges } from "../../utils/offerBadges";
import { money } from "../../utils/formatters";
import { DateCalendar } from "../common/DateCalendar";
import { fmtDE } from "../../utils/date";
import {
  activeResultFilterCount, deliveryChipLabel, emptyFilterHint as buildEmptyFilterHint,
  offersCountLabel,
} from "../../utils/offersFilterView.mjs";
import DeliveryTimeSelect from "./DeliveryTimeSelect.jsx";

const SORT_OPTIONS = [
  { id: "recommended", label: "Empfehlung" },
  { id: "cheapest",    label: "Günstigste" },
  { id: "fastest",     label: "Schnellste" },
  { id: "priciest",    label: "Teuerste"   },
];

const TRUST_ITEMS = [
  { icon: "shield",  title: "Sicher & zuverlässig",  desc: "SSL-verschlüsselt, DSGVO-konform" },
  { icon: "leaf",    title: "Nachhaltige Optionen",   desc: "Umweltfreundliche Versandwege" },
  { icon: "clock",   title: "Zeitsparnis",            desc: "Vergleich in Sekunden, nicht Stunden" },
  { icon: "headset", title: "Persönlicher Support",   desc: "Ihr Team ist jederzeit erreichbar" },
];

export function OffersList({
  sorted, filtered, tariffs, loading, hasResults,
  selected, onSelect, onBook,
  sortMode, onSortChange,
  onRecalculate,
  maxPrice, onMaxPriceChange,
  latestDeliveryDate, onLatestDeliveryChange, shippingDate,
  latestDeliveryTime, onLatestDeliveryTimeChange, deliveryTimeOptions,
  onClearFilters,
  vatMode, onVatToggle,
  senderPrefill,
}) {
  // Aktives Filter-Dropdown: "price" | "delivery" | null. Es ist immer höchstens
  // eines offen; das Öffnen des einen schließt das andere. Ersetzt den früheren
  // kombinierten Inline-Panel-Toggle durch rechts angedockte JUMiNGO-Dropdowns.
  const [openFilter, setOpenFilter] = useState(null);
  const filterZoneRef = useRef(null);
  // Die drei Gruppenbeschriftungen der Werkzeugleiste sind die zugänglichen
  // Namen ihrer Gruppen (`aria-labelledby`). Feste ids wären ein latenter
  // Doppelbefund, sobald zwei Angebotslisten in EINEM Dokument stünden —
  // dasselbe Muster wie in `DeliveryTimeSelect`.
  const leisteId = useId();
  const sortLabelId = `offers-sort-label${leisteId}`;
  const vatLabelId = `offers-vat-label${leisteId}`;
  const filterLabelId = `offers-filter-label${leisteId}`;
  const badges = useMemo(() => assignBadges(sorted), [sorted]);

  // Slider-Obergrenze aus der ungefilterten Tarifliste ableiten, damit der
  // aktive Preisfilter den eigenen Maximalwert nicht selbst verkleinert.
  const priceSliderMax = useMemo(() => {
    const values = tariffs
      .map(t => t.netPrice)
      .filter(v => typeof v === "number" && Number.isFinite(v));
    if (values.length === 0) return null;
    const rawMax = Math.max(...values);
    if (rawMax <= 100) return Math.ceil(rawMax / 10) * 10;
    if (rawMax <= 500) return Math.ceil(rawMax / 25) * 25;
    return Math.ceil(rawMax / 50) * 50;
  }, [tariffs]);
  const hasPriceRange = priceSliderMax != null && priceSliderMax > 0;
  const priceSliderValue = maxPrice
    ? Math.min(Number(maxPrice), hasPriceRange ? priceSliderMax : 0)
    : (hasPriceRange ? priceSliderMax : 0);
  const handlePriceSlider = (e) => {
    const val = Number(e.target.value);
    if (!hasPriceRange || val >= priceSliderMax) onMaxPriceChange("");
    else onMaxPriceChange(String(val));
  };

  // ── Aktive ERGEBNISFILTER ───────────────────────────────────────────────────
  // Zählung und Leerzustandstext kommen aus utils/offersFilterView.mjs — dort
  // steht die Begründung samt Messwerten. Kurz: hier zählte bis zu diesem
  // Paket ausschließlich `maxPrice`, während `latestDeliveryDate` in beiden
  // Seiten wirksam mitfilterte. Ergebnis war eine Überschrift, die 41 Angebote
  // meldete, während 21 Karten standen — ohne Chip und ohne Zurücksetzen.
  const activeFilterCount = activeResultFilterCount({ maxPrice, latestDeliveryDate });
  const hasFilter  = activeFilterCount > 0;
  const emptyFilterHint = buildEmptyFilterHint({ maxPrice, latestDeliveryDate, latestDeliveryTime });

  const showCards  = !loading && sorted.length > 0;
  const showSortBar = hasResults && !loading && tariffs.length > 0;
  const showTrust  = hasResults && !loading && tariffs.length > 0;

  // Offenes Dropdown bei Klick außerhalb der Filterzone bzw. per Escape schließen.
  useEffect(() => {
    if (!openFilter) return;
    const onDown = (e) => {
      if (filterZoneRef.current && !filterZoneRef.current.contains(e.target)) setOpenFilter(null);
    };
    const onEsc = (e) => { if (e.key === "Escape") setOpenFilter(null); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [openFilter]);

  // Wird die Leiste ausgeblendet (Laden/Neuberechnung), offenes Dropdown
  // schließen, damit es nach dem Remount nicht ungewollt sichtbar bleibt.
  useEffect(() => {
    if (!showSortBar) setOpenFilter(null);
  }, [showSortBar]);

  return (
    <div className="offers-section">
      {/* ── Result Header ── */}
      <div className="offers-result-header">
        <div>
          {/* Nur die Zahl der SICHTBAREN Angebote — die Begründung steht bei
              offersCountLabel(). Der Filterzustand wird nicht doppelt erklärt:
              dafür stehen der Chip („Lieferung bis …") und „Zurücksetzen"
              unmittelbar darunter in derselben Leiste. */}
          <div className="offers-result-count">
            {loading
              ? "Preise werden geladen…"
              : hasResults
                ? offersCountLabel(filtered.length)
                : "Versandangebote"
            }
          </div>
          {hasResults && !loading && (
            <div className="offers-result-sub">Wählen Sie Ihr bevorzugtes Angebot</div>
          )}
        </div>
      </div>

      {/* ── Sortier- + Filterzone (JUMiNGO-artige Filter-Chips mit rechts
             angedockten Dropdowns). Die Zone umschließt Leiste UND Dropdowns,
             damit die Dropdowns nicht vom horizontal scrollenden Bar-Container
             (Mobile) abgeschnitten werden. ── */}
      {showSortBar && (
        <div className="offers-filter-zone" ref={filterZoneRef}>
          {/* ── Toolbar in vier gewichteten Gruppen ──────────────────────────────
                 Bis hierher lagen Sortierung, Filter, Zurücksetzen und die
                 MwSt.-Umschaltung als EINE flache Reihe gleich aussehender
                 `.offers-sort-btn` nebeneinander, getrennt nur durch zwei
                 Striche. Vier fachlich verschiedene Dinge sahen damit gleich
                 wichtig aus, und die MwSt.-Umschaltung — eine reine
                 Darstellungsfrage — stand optisch auf einer Stufe mit der
                 Sortierung.

                 Jetzt trägt jede Gruppe ihre eigene Beschriftung und ihr
                 eigenes Gewicht:
                   Sortierung   primär    gefüllter Aktivzustand
                   MwSt.        sekundär  getönter Aktivzustand
                   Filter       kontextuell  Chips (unverändert)
                   Zurücksetzen Utility   Textaktion

                 Klassennamen und Handler der einzelnen Bedienelemente sind
                 unverändert — `.offers-sort-btn`, `.offers-filter-chip`,
                 `.offers-filter-reset-btn` und `.offers-vat-toggle` bleiben
                 bestehen, ebenso jeder `onClick`. Keine Funktion ist entfallen:
                 vier Sortierungen, beide MwSt.-Stellungen, beide Filter und das
                 Zurücksetzen stehen vollständig.

                 An der Zugänglichkeit hat sich genau zweierlei geändert, beides
                 zum Besseren: die MwSt.-Schalter tragen jetzt `aria-pressed`
                 (die Sortierung hatte es bereits), und die drei Gruppen werden
                 über ihre SICHTBARE Beschriftung benannt statt über ein
                 unsichtbares `aria-label` („Preisdarstellung") — der hörbare und
                 der gelesene Name sind damit derselbe. ── */}
          <div className="offers-toolbar">
            <div className="offers-toolbar-row">
              {/* ── Gruppe A · Sortierung (primäre Steuerung) ── */}
              <div className="offers-toolgroup">
                <span className="offers-toolgroup-label" id={sortLabelId}>Sortierung</span>
                <div className="offers-segment offers-segment--primary" role="group" aria-labelledby={sortLabelId}>
                  {SORT_OPTIONS.map(o => (
                    <button
                      key={o.id}
                      className={`offers-sort-btn offers-segment-item${sortMode === o.id ? " active" : ""}`}
                      onClick={() => onSortChange(o.id)}
                      type="button"
                      /* Die aktive Sortierung war bislang nur an der Fläche erkennbar.
                         aria-pressed macht sie für Screenreader hörbar — die Gruppe
                         ist ein Umschalter, keine sortierbare Tabellenspalte
                         (aria-sort gehört an <th> und wäre hier falsch). */
                      aria-pressed={sortMode === o.id}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Gruppe B · MwSt. (sekundäre Darstellungsumschaltung) ──
                     Bewusst schwächer gewichtet als die Sortierung: sie ändert
                     nicht, WELCHE Angebote erscheinen, sondern nur, wie ihr
                     Preis geschrieben wird. `.offers-vat-toggle` bleibt als
                     Gruppenklasse erhalten. */}
              <div className="offers-toolgroup">
                {/* „Preisanzeige", nicht „MwSt.": die beiden Segmente heißen bereits
                    „exkl. MwSt." / „inkl. MwSt." — eine dritte Nennung desselben
                    Worts in derselben Zeile benennt die Gruppe nicht, sie
                    wiederholt sie nur. Die Segmentbeschriftungen bleiben
                    absichtlich WÖRTLICH wie auf den Angebotskarten
                    (`OfferCard.jsx`): der Schalter sagt damit exakt, was danach
                    an der Karte steht. */}
                <span className="offers-toolgroup-label" id={vatLabelId}>Preisanzeige</span>
                <div
                  className="offers-vat-toggle offers-segment offers-segment--secondary"
                  role="group"
                  aria-labelledby={vatLabelId}
                >
                  <button
                    className={`offers-sort-btn offers-segment-item${vatMode !== "gross" ? " active" : ""}`}
                    onClick={() => onVatToggle("net")}
                    type="button"
                    aria-pressed={vatMode !== "gross"}
                  >
                    exkl. MwSt.
                  </button>
                  <button
                    className={`offers-sort-btn offers-segment-item${vatMode === "gross" ? " active" : ""}`}
                    onClick={() => onVatToggle("gross")}
                    type="button"
                    aria-pressed={vatMode === "gross"}
                  >
                    inkl. MwSt.
                  </button>
                </div>
              </div>
            </div>

            <div className="offers-toolbar-row offers-toolbar-row--filter">
              {/* ── Gruppe C · Filter (kontextuelle Eingrenzung) ──
                     Reihenfolge wie in der Gestaltungsreferenz: erst das
                     Lieferdatum, dann der Preis. Beide Chips sind unverändert —
                     dieselben Klassen, dieselben Handler, derselbe
                     `openFilter`-Zustand (höchstens einer offen). */}
              <div className="offers-toolgroup">
                <span className="offers-toolgroup-label" id={filterLabelId}>Filter</span>
                <div className="offers-chipset" role="group" aria-labelledby={filterLabelId}>
                  {/* Filterpunkt „Lieferung" → rechts angedocktes Dropdown. Bewusst
                      DASSELBE Chip-/Dropdown-Muster wie der Preisfilter — kein
                      zweites Overlay- oder Dialogmuster daneben. Die Bedienung
                      im Formular („Späteste Lieferzeit") bleibt unverändert
                      bestehen; beide schreiben denselben Wert. */}
                  <button
                    className={`offers-sort-btn offers-filter-chip${latestDeliveryDate ? " has-filter" : ""}${openFilter === "delivery" ? " open" : ""}`}
                    onClick={() => setOpenFilter(o => (o === "delivery" ? null : "delivery"))}
                    type="button"
                    aria-haspopup="true"
                    aria-expanded={openFilter === "delivery"}
                  >
                    <Icon n="calendar" s={12} c="currentColor" />
                    {deliveryChipLabel(latestDeliveryDate, latestDeliveryTime)}
                    <span className="offers-filter-chip-caret" aria-hidden="true">
                      <Icon n="chevron" s={13} c="currentColor" />
                    </span>
                  </button>

                  {/* Filterpunkt „Preis" → rechts angedocktes Dropdown */}
                  <button
                    className={`offers-sort-btn offers-filter-chip${maxPrice ? " has-filter" : ""}${openFilter === "price" ? " open" : ""}`}
                    onClick={() => setOpenFilter(o => (o === "price" ? null : "price"))}
                    type="button"
                    aria-haspopup="dialog"
                    aria-expanded={openFilter === "price"}
                  >
                    <Icon n="filter" s={12} c="currentColor" />
                    {maxPrice ? `Preis · bis ${money(Number(maxPrice))}` : "Preis"}
                    <span className="offers-filter-chip-caret" aria-hidden="true">
                      <Icon n="chevron" s={13} c="currentColor" />
                    </span>
                  </button>
                </div>
              </div>

              {/* ── Gruppe D · Zurücksetzen (Utility) ──
                     Erscheint unverändert nur bei aktivem Filter und trägt
                     dieselbe Klasse wie zuvor. Neu ist nur die ruhigere,
                     rahmenlose Darstellung: eine Aufräumaktion soll auffindbar
                     sein, aber nicht so laut wie die Steuerung selbst. */}
              {hasFilter && (
                <button className="offers-filter-reset-btn" onClick={onClearFilters} type="button">
                  <Icon n="x" s={11} c="currentColor" />
                  Zurücksetzen
                </button>
              )}
            </div>
          </div>

          {/* ── Preis-Dropdown: filtert live nach netPrice über den bestehenden
                 max_price-Mechanismus (kein API-Request). Am Maximum kein Filter. ── */}
          {openFilter === "price" && (
            <div className="offers-filter-dropdown offers-price-dropdown" role="dialog" aria-label="Preisfilter">
              <div className="offers-filter-dd-head">
                <span className="offers-filter-dd-title">Preis</span>
                <span className={`offers-filter-dd-status${maxPrice ? " is-set" : ""}`}>
                  {maxPrice ? `bis ${money(Number(maxPrice))}` : "Beliebiger Preis"}
                </span>
              </div>
              <p className="offers-filter-dd-sub">Bitte wählen Sie Ihren max. Preis</p>
              <input
                type="range"
                className="offers-price-slider"
                min={0}
                max={hasPriceRange ? priceSliderMax : 0}
                step={1}
                value={priceSliderValue}
                onChange={handlePriceSlider}
                disabled={!hasPriceRange}
                aria-label="Maximaler Preis"
              />
              <div className="offers-price-scale">
                <span>0 €</span>
                <span>{hasPriceRange ? money(priceSliderMax) : "—"}</span>
              </div>
              {maxPrice && (
                <div className="offers-filter-dd-foot">
                  <button className="offers-filter-dd-clear" onClick={() => onMaxPriceChange("")} type="button">
                    Preisfilter zurücksetzen
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Lieferungs-Dropdown. role="group", NICHT "dialog": die Fläche ist
                 nicht modal, fängt den Fokus bewusst nicht ein und hat keine
                 Fokusrückgabe — die Dialogrolle verspräche genau die Fokusfalle,
                 die das Designsystem für echte Dialoge einfordert (dasselbe
                 Argument wie beim AddressPicker). Statt die falsche Semantik um
                 eine weitere Bediengruppe zu erweitern, ist sie korrigiert.
                 Lieferungs-Dropdown: filtert live über deliveryDateMax → derselbe
                 rein clientseitige Mechanismus wie im Formular (kein API-Request).
                 Die FILTERREGEL selbst liegt unverändert in den Seiten. ── */}
          {openFilter === "delivery" && (
            <div className="offers-filter-dropdown offers-delivery-dropdown" role="group" aria-label="Späteste Lieferzeit">
              <div className="offers-filter-dd-head">
                <span className="offers-filter-dd-title">Späteste Lieferzeit</span>
                <span className={`offers-filter-dd-status${latestDeliveryDate ? " is-set" : ""}`}>
                  {latestDeliveryDate
                    ? `bis ${fmtDE(latestDeliveryDate)}${latestDeliveryTime ? `, ${latestDeliveryTime}` : ""}`
                    : "Beliebig"}
                </span>
              </div>
              <p className="offers-filter-dd-sub">Angebote ausblenden, die später zustellen</p>
              <div className="date-quick-options">
                <button
                  type="button"
                  className={`date-quick-btn ${!latestDeliveryDate ? "active" : ""}`}
                  onClick={() => onLatestDeliveryChange("")}
                >
                  Beliebig
                </button>
              </div>
              <DateCalendar
                value={latestDeliveryDate || ""}
                onSelect={(iso) => {
                  onLatestDeliveryChange(iso || "");
                  // Mit gesetztem Datum bleibt die Fläche offen: erst dann ist die
                  // optionale Uhrzeitzeile darunter bedienbar. Ohne Datum (Beliebig)
                  // gibt es nichts mehr zu wählen — dann schließen.
                  if (!iso) setOpenFilter(null);
                }}
                minDate={shippingDate}
                onClose={() => setOpenFilter(null)}
              />
              <DeliveryTimeSelect
                options={deliveryTimeOptions}
                value={latestDeliveryTime}
                onChange={(zeit) => { onLatestDeliveryTimeChange(zeit); setOpenFilter(null); }}
                hasDate={!!latestDeliveryDate}
                idPrefix="offers-dd"
              />
              {latestDeliveryDate && (
                <div className="offers-filter-dd-foot">
                  <button className="offers-filter-dd-clear" onClick={() => onLatestDeliveryChange("")} type="button">
                    Lieferzeitfilter zurücksetzen
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Body ── */}
      <div className="offers-body">
        {loading && (
          <div className="offers-loading">
            <span className="spinner spinner-dark" />
            <span className="text-sm text-muted">Preise werden geladen…</span>
          </div>
        )}

        {!loading && hasResults && tariffs.length === 0 && (
          <div className="offers-empty">
            <div className="offers-empty-icon"><Icon n="search" s={26} c="currentColor" /></div>
            <p className="offers-empty-title">Keine Tarife gefunden</p>
            <p className="offers-empty-sub">
              Für diese Route und das gewählte Datum wurden keine Tarife gefunden.
              Ändern Sie das Datum oder wählen Sie „Alle Dienstleistungen".
            </p>
          </div>
        )}

        {!loading && hasResults && tariffs.length > 0 && filtered.length === 0 && (
          <div className="offers-empty">
            <div className="offers-empty-icon"><Icon n="filter" s={26} c="currentColor" /></div>
            <p className="offers-empty-title">Filter anpassen</p>
            {/* Der Text nennt die TATSÄCHLICHE Ursache. Vorher stand hier
                unabhängig vom gesetzten Filter „Erhöhen Sie das Preislimit" —
                bei gesetzter spätester Lieferzeit war das die falsche
                Handlungsanweisung und führte ins Leere. */}
            <p className="offers-empty-sub">{emptyFilterHint}</p>
            {hasFilter && (
              <button className="btn btn-outline btn-sm" onClick={onClearFilters} type="button">
                Filter zurücksetzen
              </button>
            )}
          </div>
        )}

        {showCards && sorted.map((t, idx) => (
          <OfferCard
            key={t.id}
            tariff={t}
            badge={badges.get(t.id) || null}
            isTop={idx === 0}
            selected={selected?.id === t.id}
            onSelect={onSelect}
            onBook={onBook}
            vatMode={vatMode}
            senderPrefill={senderPrefill}
          />
        ))}

        {hasResults && !loading && (
          <div className="offers-recalc">
            <button className="offers-recalc-btn" onClick={onRecalculate} type="button">
              <Icon n="refresh" s={13} c="currentColor" /> Neu berechnen
            </button>
          </div>
        )}
      </div>

      {/* ── Trust Strip ── */}
      {showTrust && (
        <div className="offers-trust-strip">
          {TRUST_ITEMS.map(item => (
            <div key={item.title} className="offers-trust-item">
              <div className="offers-trust-icon">
                <Icon n={item.icon} s={17} c="var(--ce-color-brand)" />
              </div>
              <div>
                <div className="offers-trust-title">{item.title}</div>
                <div className="offers-trust-desc">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tipp Leiste ── */}
      {showTrust && (
        <div className="offers-tipp">
          <div className="offers-tipp-icon">
            <Icon n="lightbulb" s={15} c="var(--warn)" />
          </div>
          <p className="offers-tipp-text">
            <strong>Tipp:</strong> Vergleichen Sie Preis, Laufzeit und Abholart, bevor Sie ein Angebot auswählen.
          </p>
        </div>
      )}
    </div>
  );
}
