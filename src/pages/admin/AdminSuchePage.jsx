import React, { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { ErrorState, ListSkeleton } from "../../components/ui/StateView";
import { searchAdmin } from "../../api/adminApi";
import { money, dateDE } from "../../utils/formatters";
import { userStatusMeta } from "../../utils/adminUsers";
import { shipmentStatusMeta } from "../../utils/adminShipments";
import { invoiceStatusMeta } from "../../utils/adminInvoices.mjs";
import {
  SUCH_BEREICHE, SUCHE_TEXT, sucheAusAdresse, adresseAusSuche, begriffPruefen, typesFuerBereich,
  trefferAusAntwort, suchFehler,
} from "../../utils/adminSuche.mjs";

/* ── Admin-Suche (/admin/suche) ───────────────────────────────────────────────
   Betreiberauftrag 2026-11-22 (D4): am Telefon steht neben den fünf Bereichen eine Suche über alle Kunden, Sendungen
   und Rechnungen (GET /admin/search — nicht nur die geladene Seite einer Liste). Begriff und Bereich stehen in der
   Adresse: Zurück, Neuladen und Teilen behalten den Zustand. Treffer führen in die bestehenden Detailseiten; Testdaten
   tragen ihre Marke aus der Antwort, Trackingnummern kommen nur maskiert. Gesucht wird erst beim Absenden (Enter oder
   „Suchen“) — kein Aufruf je Tastendruck. */
export default function AdminSuchePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const uid = useId();
  const ausAdresse = sucheAusAdresse(location.search);
  const [eingabe, setEingabe] = useState(ausAdresse.q);
  const [hinweis, setHinweis] = useState("");
  const [zustand, setZustand] = useState({ laedt: false, fehler: "", treffer: null });
  const feldRef = useRef(null);
  const lauf = useRef(0);

  // Die Adresse ist die Quelle: jede Änderung (Absenden, Bereich, Zurück) löst genau eine Suche aus.
  useEffect(() => {
    const { q, bereich } = sucheAusAdresse(location.search);
    setEingabe(q);
    if (!q) { setZustand({ laedt: false, fehler: "", treffer: null }); return undefined; }
    const problem = begriffPruefen(q);
    if (problem) { setHinweis(problem); setZustand({ laedt: false, fehler: "", treffer: null }); return undefined; }
    setHinweis("");
    const nr = ++lauf.current;
    const abbruch = new AbortController();
    setZustand((z) => ({ ...z, laedt: true, fehler: "" }));
    (async () => {
      try {
        const r = await searchAdmin({ q, types: typesFuerBereich(bereich) }, { signal: abbruch.signal });
        if (nr !== lauf.current) return;
        let body = null;
        try { body = await r.json(); } catch { body = null; }
        if (!r.ok) {
          // 401/403 regelt apiFetch zentral (Sitzungsende); hier nur die übrigen Fälle.
          if (r.status === 401 || r.status === 403) return;
          setZustand({ laedt: false, fehler: suchFehler(r.status, body), treffer: null });
          return;
        }
        setZustand({ laedt: false, fehler: "", treffer: trefferAusAntwort(body) });
      } catch (e) {
        if (abbruch.signal.aborted || nr !== lauf.current) return;
        setZustand({ laedt: false, fehler: SUCHE_TEXT.fehler, treffer: null });
      }
    })();
    return () => abbruch.abort();
  }, [location.search, location.key]);

  useEffect(() => { if (!ausAdresse.q) feldRef.current?.focus(); /* nur beim Öffnen ohne Begriff */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const absenden = (e) => {
    e.preventDefault();
    const problem = begriffPruefen(eingabe);
    if (problem) { setHinweis(problem); feldRef.current?.focus(); return; }
    setHinweis("");
    const ziel = adresseAusSuche({ q: eingabe, bereich: ausAdresse.bereich });
    // Gleicher Begriff erneut abgeschickt: die Adresse ändert sich nicht — dann bewusst neu laden.
    if (ziel === location.search) navigate({ search: ziel }, { replace: true, state: { neu: Date.now() } });
    else navigate({ search: ziel });
  };
  const bereichWaehlen = (bereich) => navigate({ search: adresseAusSuche({ q: ausAdresse.q || eingabe, bereich }) }, { replace: true });

  const { laedt, fehler, treffer } = zustand;
  const idHilfe = `${uid}-hilfe`;
  const idHinweis = `${uid}-hinweis`;

  return (
    <div className="adm-page adm-suche">
      <PageHeader variant="admin" title={SUCHE_TEXT.titel} subtitle={SUCHE_TEXT.untertitel} />

      <form className="adm-suche-form" role="search" onSubmit={absenden} noValidate>
        <label className="adm-suche-label" htmlFor={`${uid}-q`}>{SUCHE_TEXT.feld}</label>
        <div className="adm-suche-zeile">
          <input
            id={`${uid}-q`}
            ref={feldRef}
            className="field-input adm-suche-input"
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            maxLength={100}
            placeholder={SUCHE_TEXT.platzhalter}
            value={eingabe}
            onChange={(e) => setEingabe(e.target.value)}
            aria-describedby={hinweis ? `${idHinweis} ${idHilfe}` : idHilfe}
            aria-invalid={hinweis ? "true" : undefined}
          />
          <button type="submit" className="btn btn-primary adm-suche-knopf" disabled={laedt} aria-busy={laedt ? "true" : undefined}>
            {laedt ? SUCHE_TEXT.sucht : SUCHE_TEXT.suchen}
          </button>
        </div>
        {hinweis && <p className="field-error" id={idHinweis} role="alert">{hinweis}</p>}
        <p className="adm-support-hint adm-suche-hilfe" id={idHilfe}>{SUCHE_TEXT.hilfe}</p>
        <div className="adm-suche-bereiche" role="group" aria-label="Bereich">
          {SUCH_BEREICHE.map((b) => (
            <button key={b.id} type="button" className={`adm-suche-bereich${b.id === ausAdresse.bereich ? " adm-suche-bereich-on" : ""}`}
              aria-pressed={b.id === ausAdresse.bereich} onClick={() => bereichWaehlen(b.id)}>
              {b.label}
            </button>
          ))}
        </div>
      </form>

      <div className="adm-suche-ergebnis" aria-live="polite" aria-busy={laedt ? "true" : undefined}>
        {laedt && <ListSkeleton rows={4} label="Suche läuft" />}
        {!laedt && fehler && (
          <ErrorState title="Suche nicht möglich" text={fehler}
            action={<button type="button" className="btn btn-primary btn-sm" onClick={() => navigate({ search: location.search }, { replace: true, state: { neu: Date.now() } })}>{SUCHE_TEXT.erneut}</button>} />
        )}
        {!laedt && !fehler && !treffer && !hinweis && <p className="adm-suche-start">{SUCHE_TEXT.start}</p>}
        {!laedt && !fehler && treffer && treffer.anzahl === 0 && <p className="adm-suche-leer" role="status">{SUCHE_TEXT.leer}</p>}
        {!laedt && !fehler && treffer && treffer.anzahl > 0 && (
          <>
            <p className="adm-suche-anzahl" role="status">{treffer.anzahl === 1 ? "1 Treffer" : `${treffer.anzahl} Treffer`}</p>
            {treffer.kunden.length > 0 && (
              <section className="adm-suche-gruppe" aria-labelledby={`${uid}-kunden`}>
                <h2 className="adm-suche-gruppe-titel" id={`${uid}-kunden`}>{SUCHE_TEXT.kunden} <span className="adm-suche-zahl">{treffer.kunden.length}</span></h2>
                <ul className="adm-suche-liste">
                  {treffer.kunden.map((k) => {
                    const [badge, label] = userStatusMeta(k.status);
                    return (
                      <li key={`k-${k.id}`}>
                        <Link className="adm-suche-treffer" to={`/admin/users/${encodeURIComponent(k.id)}`}>
                          <span className="adm-suche-haupt">{k.firma || k.name || k.email || `Kunde ${k.id}`}</span>
                          <span className="adm-suche-neben">{[k.kundennummer, k.firma ? k.name : null, k.email].filter(Boolean).join(" · ")}</span>
                          <span className={`badge ${badge} adm-suche-marke`}>{label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            {treffer.sendungen.length > 0 && (
              <section className="adm-suche-gruppe" aria-labelledby={`${uid}-sendungen`}>
                <h2 className="adm-suche-gruppe-titel" id={`${uid}-sendungen`}>{SUCHE_TEXT.sendungen} <span className="adm-suche-zahl">{treffer.sendungen.length}</span></h2>
                <ul className="adm-suche-liste">
                  {treffer.sendungen.map((s) => {
                    const [badge, label] = shipmentStatusMeta(s.status);
                    return (
                      <li key={`s-${s.id}`}>
                        <Link className="adm-suche-treffer" to={`/admin/shipments/${encodeURIComponent(s.id)}`}>
                          <span className="adm-suche-haupt">{s.auftrag || `Sendung #${s.id}`}</span>
                          <span className="adm-suche-neben">
                            {[s.firma, s.kundennummer, s.carrier, s.von && s.nach ? `${s.von} → ${s.nach}` : null, s.tracking, s.erstellt ? dateDE(s.erstellt) : null].filter(Boolean).join(" · ")}
                          </span>
                          {s.gefunden && <span className="adm-suche-fund">Gefunden über {s.gefunden}</span>}
                          <span className="adm-suche-marken">
                            <span className={`badge ${badge} adm-suche-marke`}>{label}</span>
                            {s.test && <span className="badge badge-yellow adm-suche-marke">{SUCHE_TEXT.testbuchung}</span>}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            {treffer.rechnungen.length > 0 && (
              <section className="adm-suche-gruppe" aria-labelledby={`${uid}-rechnungen`}>
                <h2 className="adm-suche-gruppe-titel" id={`${uid}-rechnungen`}>{SUCHE_TEXT.rechnungen} <span className="adm-suche-zahl">{treffer.rechnungen.length}</span></h2>
                <ul className="adm-suche-liste">
                  {treffer.rechnungen.map((i) => {
                    const [badge, label] = invoiceStatusMeta(i.status);
                    return (
                      <li key={`r-${i.id}`}>
                        <Link className="adm-suche-treffer" to={`/admin/invoices/${encodeURIComponent(i.id)}`}>
                          <span className="adm-suche-haupt">{i.nummer || `Beleg #${i.id}`}</span>
                          <span className="adm-suche-neben">
                            {[i.firma, i.kundennummer, i.betrag !== null ? money(i.betrag) : null, i.erstellt ? dateDE(i.erstellt) : null].filter(Boolean).join(" · ")}
                          </span>
                          <span className="adm-suche-marken">
                            <span className={`badge ${badge} adm-suche-marke`}>{label}</span>
                            {i.test && <span className="badge badge-yellow adm-suche-marke">{SUCHE_TEXT.testrechnung}</span>}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
