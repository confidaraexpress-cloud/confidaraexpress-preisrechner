import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { money } from "../../utils/formatters";
import { publicCarrierDisplay, publicServiceName } from "../../utils/carrierMap";
import { handoverInfo, deliveryInfo, priceInfo } from "../../utils/bookingSummaryView.mjs";

// ─── Kompakte Sticky-Zusammenfassung (BookingPage, Schritt 1 + 2) ────────────
// REINE DARSTELLUNG. Sie erscheint erst, wenn die große Live-Zusammenfassung
// nach oben aus dem Sichtfeld gescrollt ist, und verschwindet wieder, sobald
// diese zurückkommt. Damit bleibt „Welcher Versand? Wie wird abgegeben? Wann
// wird zugestellt? Was kostet es?" durchgehend beantwortet, ohne dauerhaft
// vertikalen Platz zu kosten.
//
// Alle Werte stammen aus DENSELBEN Quellen wie die große Leiste:
//   • Carrier/Service → carrierMap (publicCarrierDisplay / publicServiceName)
//   • Übergabe, Zustellung, geltender Preis → bookingSummaryView.mjs
// Es wird nichts neu berechnet und kein Betrag gebildet — insbesondere keine
// zweite Netto-/Brutto-Ableitung.
//
// Sichtbarkeitserkennung über IntersectionObserver auf der großen Leiste
// (`observeRef`) — keine Scrollposition, kein Scroll-Handler, keine fest
// verdrahtete Pixelgrenze. Der Klebeabstand wird am echten Layout GEMESSEN
// (unterhalb der Drawer-Schwelle liegt die Leiste unter der sticky Topbar der
// App-Shell) und als `--booking-sticky-top` an das CSS zurückgegeben.
//
// Barrierefreiheit: Die Leiste ist `aria-hidden`. Sie wiederholt ausschließlich
// Informationen, die mit der großen Zusammenfassung ohnehin dauerhaft im DOM
// stehen; ohne diese Kennzeichnung läse ein Screenreader jeden Wert doppelt.
// Sie enthält bewusst keine Bedienelemente.
export function BookingStickySummary({ tariff, priceView, observeRef }) {
  const layerRef = useRef(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const ziel = observeRef?.current;
    const layer = layerRef.current;
    if (!ziel || !layer || typeof IntersectionObserver === "undefined") return undefined;

    let beobachter = null;
    const aufsetzen = () => {
      beobachter?.disconnect();
      // Klebeabstand aus dem ECHTEN Layout ableiten statt aus einer Zahl im
      // Code: Unterhalb der Drawer-Schwelle trägt die App-Shell eine sticky
      // Topbar (position:sticky, top:0) — die Leiste muss exakt darunter
      // sitzen. Gemessen statt gespiegelt, damit der Wert auch dann stimmt,
      // wenn sich die Höhe der Topbar später einmal ändert.
      const topbar = document.querySelector(".mobile-topbar");
      const topbarAktiv = !!topbar && getComputedStyle(topbar).display !== "none";
      const oben = topbarAktiv ? Math.round(topbar.getBoundingClientRect().height) : 0;
      layer.style.setProperty("--booking-sticky-top", `${oben}px`);

      beobachter = new IntersectionObserver(
        ([eintrag]) => {
          // Nur „nach oben herausgescrollt" zählt. Ohne die zweite Bedingung
          // erschiene die Leiste auch, solange die große Zusammenfassung noch
          // UNTER dem Sichtfeld liegt (z. B. direkt nach einem Schrittwechsel).
          setStuck(!eintrag.isIntersecting && eintrag.boundingClientRect.top < oben);
        },
        { threshold: 0, rootMargin: `-${oben}px 0px 0px 0px` },
      );
      beobachter.observe(ziel);
    };

    aufsetzen();
    // Der Klebeabstand wechselt an der Drawer-Schwelle (860 px) — beim
    // Größenwechsel muss der Beobachter mit dem neuen Wert neu aufgesetzt werden.
    window.addEventListener("resize", aufsetzen);
    return () => {
      window.removeEventListener("resize", aufsetzen);
      beobachter?.disconnect();
    };
  }, [observeRef]);

  if (!tariff) return null;

  const { name: carrierName, logo: carrierLogo } = publicCarrierDisplay(tariff);
  const handover = handoverInfo(tariff);
  const delivery = deliveryInfo(tariff);
  const preis = priceInfo(priceView);

  return (
    <div
      ref={layerRef}
      className={`booking-sticky-layer${stuck ? " is-stuck" : ""}`}
      aria-hidden="true"
    >
      {/* Deckende Trägerfläche in Seitenfarbe: Sie liegt UNTER der Karte und
          schließt deren abgerundete Ecken sowie den Abstand nach unten. Ohne
          sie wären genau diese Zonen durchsichtig und der scrollende Inhalt
          schiene hindurch — der eigentliche Fehler der bisherigen Lösung. */}
      <div className="booking-sticky-fill">
        <div className="booking-sticky-summary">

          {/* Links — Versandprodukt */}
          <div className="bsum-product">
            {carrierLogo
              ? <img src={carrierLogo} alt="" className="bsum-logo" />
              : <span className="bsum-logo bsum-logo--generic"><Icon n="package" s={16} c="currentColor" /></span>}
            <span className="bsum-product-txt">
              <span className="bsum-carrier">{carrierName}</span>
              <span className="bsum-service">{publicServiceName(tariff)}</span>
            </span>
          </div>

          {/* Mitte — Übergabe und Zustellung */}
          <div className="bsum-meta">
            <span className="bsum-chip">{handover.label}</span>
            <span className="bsum-delivery">
              <span className="bsum-delivery-label">Zustellung</span>
              <span className="bsum-delivery-val">{delivery.value}</span>
            </span>
          </div>

          {/* Rechts — geltender Preis */}
          <div className="bsum-price">
            <span className="bsum-price-gross">
              {preis.gross != null ? money(preis.gross) : "—"}
              <span className="bsum-price-unit"> brutto</span>
            </span>
            {preis.net != null && <span className="bsum-price-net">{money(preis.net)} netto</span>}
          </div>

        </div>
      </div>
    </div>
  );
}
