/* Layoutprüfung im echten Browser: tatsächliche Überschneidungen und abgeschnittene Inhalte.
 *
 * Querscrollen der Seite ist nur das gröbste Symptom. Diese Prüfung misst, was ein Mensch sieht:
 *
 *   textUeberText        zwei verschiedene Textläufe liegen übereinander (z. B. Sendungsnummer über dem Empfänger)
 *   textUeberSteuerung   fremder Text liegt auf einem Knopf, Link oder auf dem Wert eines Eingabefelds
 *   textUeberBild        Text liegt auf einem Bild im Fluss (z. B. einem Carrierlogo)
 *   steuerUeberSteuerung zwei Bedienelemente überdecken sich
 *   ueberragtZelle       Text ragt über seine Raster-, Flex- oder Tabellenzelle hinaus (auch ohne Kollision)
 *   abgeschnitten        ein Vorfahr mit overflow hidden/clip schneidet Text an (Ellipse, Zeilenbegrenzung, Kasten)
 *   gekuerztMitTitel     bewusst gekürzt: Auslassungspunkte, der volle Text steht im title (Hinweis, kein Fehler)
 *   wertGebrochen        ein Wert (Datum, Betrag, Nummer, Referenz — Wort mit Ziffer) verteilt sich auf zwei Zeilen
 *   wortGebrochen        ein langes Wort ohne Ziffer bricht mitten im Wort (nicht am Bindestrich, ohne Silbentrennung)
 *   querScroll           Text liegt nur in einem waagerecht scrollenden Bereich vollständig vor
 *   ausserhalb           Text ragt über den linken oder rechten Rand des Fensters
 *   seiteScrolltQuer     die Seite selbst scrollt waagerecht
 *
 * `layoutBefunde` läuft per `page.evaluate` im Browser und ist deshalb vollständig in sich geschlossen.
 * Unsichtbares zählt nicht: display none, visibility, Deckkraft 0 (auch geerbt), clip/clip-path (sr-only),
 * ganz weggeclippte Inhalte (eingeklappte Bereiche) und Texte vollständig außerhalb des Fensters (Schubladen).
 */

export function layoutBefunde(optionen = {}) {
  const TOL = optionen.toleranz ?? 1;
  const MAX = optionen.max ?? 200;
  const vw = document.documentElement.clientWidth;
  const befunde = [];
  const stilCache = new Map();
  const stil = (el) => {
    let s = stilCache.get(el);
    if (!s) { s = getComputedStyle(el); stilCache.set(el, s); }
    return s;
  };
  const kurz = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 70);
  const beschreibe = (el) => {
    const teile = [];
    for (let e = el, i = 0; e && e.nodeType === 1 && i < 4; e = e.parentElement, i++) {
      let s = e.tagName.toLowerCase();
      if (e.id) { teile.unshift(`${s}#${e.id}`); break; }
      const k = [...e.classList].slice(0, 3).join(".");
      if (k) s += `.${k}`;
      teile.unshift(s);
    }
    return teile.join(" > ");
  };
  const sichtbarCache = new Map();
  const sichtbar = (el) => {
    if (!el || el === document.documentElement || el === document.body) return true;
    if (sichtbarCache.has(el)) return sichtbarCache.get(el);
    const s = stil(el);
    let v = !(s.display === "none" || s.visibility !== "visible" || Number(s.opacity) === 0
      || (s.clip && s.clip !== "auto") || s.contentVisibility === "hidden"
      || (s.clipPath && /inset\(\s*(50|100)%/.test(s.clipPath)));
    if (v && el.parentElement && el.parentElement.tagName === "DETAILS" && !el.parentElement.open && el.tagName !== "SUMMARY") v = false;
    if (v) v = sichtbar(el.parentElement);
    sichtbarCache.set(el, v);
    return v;
  };
  // Fest positionierte Ebenen (Demo-Leiste, Hinweise) liegen je nach Scrollstand über anderem Inhalt — gekennzeichnet.
  const fest = (el) => {
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      if (stil(e).position === "fixed") return true;
    }
    return false;
  };
  // Ort eines Befunds in Dokumentkoordinaten (für Bildausschnitte).
  const ort = (...rs) => {
    const l = Math.min(...rs.map((r) => r.left)), t = Math.min(...rs.map((r) => r.top));
    const r2 = Math.max(...rs.map((r) => r.right)), b = Math.max(...rs.map((r) => r.bottom));
    return { x: Math.round(l + scrollX), y: Math.round(t + scrollY), w: Math.round(r2 - l), h: Math.round(b - t) };
  };
  const schnitt = (a, b) => ({
    x: Math.min(a.right, b.right) - Math.max(a.left, b.left),
    y: Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top),
  });
  const melde = (b) => { if (befunde.length < MAX) befunde.push(b); };
  const scrollGemeldet = new Set();

  // Innenkasten eines Clip-Vorfahren (ohne Rahmen und Scrollleisten).
  const innenkasten = (e) => {
    const r = e.getBoundingClientRect();
    const s = stil(e);
    const left = r.left + parseFloat(s.borderLeftWidth);
    const top = r.top + parseFloat(s.borderTopWidth);
    return { left, top, right: left + e.clientWidth, bottom: top + e.clientHeight };
  };

  // Ein Textrechteck gegen alle beschneidenden Vorfahren: ganz verdeckt (zählt nicht), angeschnitten (Befund)
  // oder nur per Querscrollen erreichbar (Befund). Abspos-Inhalte entkommen Vorfahren außerhalb ihres Bezugs — die
  // Prüfung bleibt hier bewusst einfach und endet an fest positionierten Ebenen.
  const clipStatus = (el, r) => {
    let ergebnis = null;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const s = stil(e);
      const ox = s.overflowX, oy = s.overflowY;
      if ((ox !== "visible" || oy !== "visible") && e !== document.body) {
        const k = innenkasten(e);
        const ganzX = r.right <= k.left + 0.5 || r.left >= k.right - 0.5;
        const ganzY = r.bottom <= k.top + 0.5 || r.top >= k.bottom - 0.5;
        if (((ox === "hidden" || ox === "clip") && ganzX) || ((oy === "hidden" || oy === "clip") && ganzY)) return { verdeckt: true };
        // Ein senkrechter Scrollbereich schneidet nichts ab: Was unter oder über seinem sichtbaren Teil liegt, erreicht
        // man per Scrollen. Äußere Rahmen prüfen nur noch den sichtbaren Teil.
        if (oy === "auto" || oy === "scroll") {
          if (ganzY) return { verdeckt: true };
          r = { left: r.left, right: r.right, top: Math.max(r.top, k.top), bottom: Math.min(r.bottom, k.bottom) };
        }
        const ausX = Math.max(k.left - r.left, r.right - k.right);
        const ausY = Math.max(k.top - r.top, r.bottom - k.bottom);
        if (!ergebnis && (ox === "hidden" || ox === "clip") && ausX > TOL) ergebnis = { art: "abgeschnitten", achse: "x", um: ausX, bei: e, kasten: k };
        else if (!ergebnis && (oy === "hidden" || oy === "clip") && ausY > TOL) ergebnis = { art: "abgeschnitten", achse: "y", um: ausY, bei: e, kasten: k };
        else if ((ox === "auto" || ox === "scroll") && ausX > TOL && e.scrollWidth > e.clientWidth + 1) {
          // Nur per Querscrollen erreichbar: gemeldet; ganz außerhalb des sichtbaren Ausschnitts zählt er sonst nicht.
          if (!scrollGemeldet.has(e)) { scrollGemeldet.add(e); melde({ art: "querScroll", um: Math.round(e.scrollWidth - e.clientWidth), text: "", bei: beschreibe(e), ort: ort(e.getBoundingClientRect()) }); }
          if (ganzX) return { verdeckt: true };
        }
      }
      if (s.position === "fixed") break;
    }
    return ergebnis;
  };

  // Elternteil im Layout (display: contents zählt nicht).
  const layoutEltern = (e) => {
    let p = e.parentElement;
    while (p && stil(p).display === "contents") p = p.parentElement;
    return p;
  };
  const ueberragtZelle = (el, r) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const s = stil(e);
      if (s.display === "contents") continue;
      if (s.position === "absolute" || s.position === "fixed") return null;
      const p = layoutEltern(e);
      if (!p) return null;
      const pd = stil(p).display;
      if (/grid|flex/.test(pd) || e.tagName === "TD" || e.tagName === "TH") {
        const b = e.getBoundingClientRect();
        const um = Math.max(r.right - b.right, b.left - r.left);
        if (um > TOL + 0.5) return { zelle: e, um };
      }
      if (s.overflowX !== "visible") return null;
    }
    return null;
  };

  const ebenen = [...document.querySelectorAll('dialog[open], [aria-modal="true"]')]
    .filter((e) => sichtbar(e) && e.getBoundingClientRect().width > 0);
  const ebene = ebenen.length ? ebenen[ebenen.length - 1] : null;
  const inEbene = (el) => !ebene || ebene.contains(el);

  // ── Textläufe ───────────────────────────────────────────────────────────────────────────────────────────────
  const laeufe = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (tw.nextNode()) {
    const t = tw.currentNode;
    if (!t.nodeValue || !t.nodeValue.trim()) continue;
    const el = t.parentElement;
    // Der Inhalt eines Textfelds (textarea) ist Eingabe, kein Seitentext — das Feld selbst prüft die Steuerelementprüfung.
    if (!el || el.closest("script,style,noscript,template,option,title,textarea")) continue;
    if (!inEbene(el) || !sichtbar(el)) continue;
    // Beschriftung in einer schmückenden Zeichnung (aria-hidden, oft perspektivisch verzerrt): Die achsenparallelen
    // Rechtecke verzerrter Schrift überdecken sich, die Glyphen nicht — sie zählt nicht als Text der Seite.
    if (el.closest("svg") && el.closest('[aria-hidden="true"]')) continue;
    const range = document.createRange();
    range.selectNodeContents(t);
    const rects = [];
    let geclippt = false;
    for (const q of range.getClientRects()) {
      if (q.width < 0.5 || q.height < 0.5) continue;
      if (q.right <= 0 || q.left >= vw) continue; // ganz außerhalb des Fensters (Schublade, Off-Canvas)
      const c = clipStatus(el, q);
      if (c && c.verdeckt) continue;
      if (c && c.kasten) {
        // Angeschnitten: gemeldet; für die übrigen Prüfungen zählt nur der sichtbare Teil.
        geclippt = true;
        // Bewusst gekürzt: Auslassungspunkte, und der vollständige Text steht im title eines Vorfahren (Benutzerchip).
        const traeger = el.closest("[title]");
        const voll = t.nodeValue.trim();
        const mitTitel = stil(c.bei).textOverflow === "ellipsis" && traeger && traeger.getAttribute("title").includes(voll);
        melde({ art: mitTitel ? "gekuerztMitTitel" : c.art, achse: c.achse, um: Math.round(c.um), text: kurz(t.nodeValue), bei: beschreibe(el), container: beschreibe(c.bei), ort: ort(q) });
        const k = c.kasten;
        const left = Math.max(q.left, k.left), right = Math.min(q.right, k.right), top = Math.max(q.top, k.top), bottom = Math.min(q.bottom, k.bottom);
        if (right - left > 0.5 && bottom - top > 0.5) rects.push({ left, right, top, bottom, width: right - left, height: bottom - top });
        continue;
      }
      rects.push(q);
      if (q.right > vw + TOL || q.left < -TOL) melde({ art: "ausserhalb", um: Math.round(Math.max(q.right - vw, -q.left)), text: kurz(t.nodeValue), bei: beschreibe(el), ort: ort(q) });
    }
    if (!rects.length) continue;
    laeufe.push({ el, knoten: t, rects, text: kurz(t.nodeValue), fest: fest(el), geclippt });
  }

  // Gebrochene Werte: ein Datum, Betrag, eine Nummer oder Referenz (Wort mit Ziffer) verteilt sich auf zwei Zeilen
  // („28.10.202“ / „6“, „CE-AB26-“ / „00001“). Lange Wörter ohne Ziffer dürfen nur an Bindestrichen umbrechen.
  // Getrennt wird nur an gewöhnlichen Leerzeichen — ein geschütztes Leerzeichen (Betrag und €) gehört zum Wert.
  for (const l of laeufe) {
    if (l.rects.length < 2) continue;
    const t = l.knoten;
    const inhalt = t.nodeValue;
    const muster = /[^ \t\n\r]+/g;
    let m;
    while ((m = muster.exec(inhalt))) {
      const wort = m[0];
      const istWert = /\d/.test(wort) && wort.replace(/[^\d]/g, "").length >= 2;
      // E-Mail-Adressen und Adressen im Netz dürfen an ihren Trennzeichen umbrechen.
      if (wort.includes("@") || /^(https?:\/\/|www\.)|^[\w.-]+\.[a-z]{2,}\//i.test(wort)) continue;
      if (!istWert && (wort.length < 12 || stil(l.el).hyphens === "auto")) continue;
      const r = document.createRange();
      r.setStart(t, m.index);
      r.setEnd(t, m.index + wort.length);
      const zeilen = [...r.getClientRects()].filter((q) => q.width > 0.5);
      // Zeilen zählen: Teilrechtecke derselben Zeile liegen höchstens eine halbe Zeilenhöhe auseinander.
      const hoehe = Math.min(...zeilen.map((q) => q.height)) || 1;
      const oberkanten = zeilen.map((q) => q.top).sort((x, y) => x - y);
      const anzahl = oberkanten.reduce((n, o, i) => n + (i > 0 && o - oberkanten[i - 1] > hoehe / 2 ? 1 : 0), oberkanten.length ? 1 : 0);
      if (anzahl < 2) continue;
      if (!istWert) {
        // An Bindestrichen getrennte Wörter sind in Ordnung; geprüft wird, ob jede Zeile an einem Bindestrich endet.
        const teile = [];
        let start = m.index, letzteOben = null;
        for (let i = m.index; i < m.index + wort.length; i++) {
          const z = document.createRange(); z.setStart(t, i); z.setEnd(t, i + 1);
          // Das letzte Teilrechteck: ein Zeichen direkt nach dem Umbruch liefert sonst ein Rechteck über beide Zeilen.
          const alle = z.getClientRects();
          const q = alle[alle.length - 1];
          if (!q || q.width < 0.1) continue;
          const o = Math.round(q.top);
          if (letzteOben !== null && Math.abs(o - letzteOben) > 2) { teile.push(inhalt.slice(start, i)); start = i; }
          letzteOben = o;
        }
        if (teile.every((s) => /[-\u2010\u2013\u2014/\u00ad]$/.test(s))) continue;
      }
      melde({ art: istWert ? "wertGebrochen" : "wortGebrochen", um: anzahl, text: wort.slice(0, 60), bei: beschreibe(l.el), ort: ort(...zeilen) });
    }
  }

  // Zellüberhang: einmal je Lauf, an der innersten Zelle.
  for (const l of laeufe) {
    if (l.geclippt) continue;
    for (const q of l.rects) {
      const u = ueberragtZelle(l.el, q);
      if (u) { melde({ art: "ueberragtZelle", um: Math.round(u.um), text: l.text, bei: beschreibe(l.el), zelle: beschreibe(u.zelle), ort: ort(q, u.zelle.getBoundingClientRect()) }); break; }
    }
  }

  // Text über Text: Kehrlinie über die Oberkanten.
  const flach = [];
  laeufe.forEach((l, i) => l.rects.forEach((q) => flach.push({ i, q })));
  flach.sort((a, b) => a.q.top - b.q.top);
  const gesehen = new Set();
  for (let a = 0; a < flach.length; a++) {
    const A = flach[a];
    for (let b = a + 1; b < flach.length && flach[b].q.top < A.q.bottom; b++) {
      const B = flach[b];
      if (A.i === B.i) continue;
      const s = schnitt(A.q, B.q);
      if (s.x > 2 && s.y > 0.35 * Math.min(A.q.height, B.q.height)) {
        const key = A.i < B.i ? `${A.i}|${B.i}` : `${B.i}|${A.i}`;
        if (gesehen.has(key)) continue;
        gesehen.add(key);
        const la = laeufe[A.i], lb = laeufe[B.i];
        melde({ art: "textUeberText", um: Math.round(s.x), text: la.text, bei: beschreibe(la.el), mit: lb.text, mitBei: beschreibe(lb.el), fest: la.fest || lb.fest, ort: ort(A.q, B.q) });
      }
    }
  }

  // ── Bedienelemente ──────────────────────────────────────────────────────────────────────────────────────────
  const AUSWAHL = "button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=radio], [role=checkbox], [role=switch], [role=menuitem]";
  const steuer = [];
  for (const el of document.querySelectorAll(AUSWAHL)) {
    if (!inEbene(el) || !sichtbar(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.right <= 0 || r.left >= vw) continue;
    // Ein Bedienelement schneidet sich nicht selbst (Textfeld mit eigenem Scrollbereich): geprüft wird ab dem Elternteil;
    // ein fest positioniertes entkommt den Rahmen seiner Vorfahren.
    const c = stil(el).position === "fixed" ? null : clipStatus(el.parentElement, r);
    if (c && c.verdeckt) continue;
    // Ein Link im Fließtext umbricht: seine Teilstücke zählen, nicht das umschließende Rechteck über zwei Zeilen.
    const teile = stil(el).display === "inline" ? [...el.getClientRects()].filter((q) => q.width > 0.5 && q.height > 0.5) : [r];
    steuer.push({ el, r, teile });
  }
  // Wertkasten eines Eingabefelds: nur der tatsächlich geschriebene Wert, nicht der ganze Rahmen
  // (schwebende Beschriftungen und Einheiten liegen absichtlich im Rahmen).
  const leinwand = document.createElement("canvas").getContext("2d");
  const wertKasten = (el, r) => {
    const tag = el.tagName;
    let wert = "";
    if (tag === "SELECT") wert = el.selectedOptions && el.selectedOptions[0] ? el.selectedOptions[0].text : "";
    else if (tag === "TEXTAREA") return null;
    else if (tag === "INPUT" && !/^(checkbox|radio|range|color|file|submit|button|reset|image)$/i.test(el.type)) wert = el.value;
    else return r;
    if (!wert) return null;
    const s = stil(el);
    leinwand.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    const breite = leinwand.measureText(wert).width;
    const left = r.left + parseFloat(s.borderLeftWidth) + parseFloat(s.paddingLeft);
    const rechtsMax = r.right - parseFloat(s.borderRightWidth) - parseFloat(s.paddingRight);
    const top = r.top + parseFloat(s.borderTopWidth) + parseFloat(s.paddingTop);
    const bottom = r.bottom - parseFloat(s.borderBottomWidth) - parseFloat(s.paddingBottom);
    return { left, right: Math.min(left + breite, rechtsMax), top, bottom };
  };
  for (let a = 0; a < steuer.length; a++) {
    for (let b = a + 1; b < steuer.length; b++) {
      const A = steuer[a], B = steuer[b];
      if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
      const istRegler = (e) => e.tagName === "INPUT" && e.type === "range";
      if (istRegler(A.el) && istRegler(B.el)) continue;
      const feld = [A, B].find((x) => /^(INPUT|TEXTAREA)$/.test(x.el.tagName) && !/^(checkbox|radio|range)$/i.test(x.el.type));
      const knopf = feld && [A, B].find((x) => x !== feld && /^(BUTTON|A)$/.test(x.el.tagName));
      // Zubehör eines Felds (Augenknopf) liegt in dessen Rahmen und ist nie eine feste Ebene (schwebende Leiste).
      if (feld && knopf && !fest(feld.el) && !fest(knopf.el) && knopf.r.left >= feld.r.left - 1 && knopf.r.right <= feld.r.right + 1 && knopf.r.top >= feld.r.top - 1 && knopf.r.bottom <= feld.r.bottom + 1) {
        const fs = stil(feld.el);
        const schreibRechts = feld.r.right - parseFloat(fs.borderRightWidth) - parseFloat(fs.paddingRight);
        const schreibLinks = feld.r.left + parseFloat(fs.borderLeftWidth) + parseFloat(fs.paddingLeft);
        const ueber = Math.min(schreibRechts, knopf.r.right) - Math.max(schreibLinks, knopf.r.left);
        if (ueber > 2) melde({ art: "steuerUeberSteuerung", um: Math.round(ueber), text: kurz(feld.el.name || feld.el.id), bei: beschreibe(feld.el),
          mit: kurz(knopf.el.textContent || knopf.el.getAttribute("aria-label")), mitBei: beschreibe(knopf.el), ort: ort(feld.r, knopf.r) });
        continue;
      }
      let s = { x: 0, y: 0 };
      for (const a2 of A.teile) for (const b2 of B.teile) {
        const t = schnitt(a2, b2);
        if (t.x > 2 && t.y > 2) s = t;
      }
      if (s.x > 2 && s.y > 2) {
        melde({ art: "steuerUeberSteuerung", um: Math.round(Math.min(s.x, s.y)), text: kurz(A.el.textContent || A.el.getAttribute("aria-label") || A.el.name), bei: beschreibe(A.el),
          mit: kurz(B.el.textContent || B.el.getAttribute("aria-label") || B.el.name), mitBei: beschreibe(B.el), fest: fest(A.el) || fest(B.el), ort: ort(A.r, B.r) });
      }
    }
  }
  const beschriftungVon = (textEl, ctrl) => {
    const label = textEl.closest("label, legend");
    if (label && (label.control === ctrl || label.contains(ctrl) || label.htmlFor === ctrl.id)) return true;
    if (ctrl.id && textEl.closest(`[for="${CSS.escape(ctrl.id)}"]`)) return true;
    return false;
  };
  for (const c of steuer) {
    const kasten = wertKasten(c.el, c.r);
    if (!kasten) continue;
    const kaesten = kasten === c.r ? c.teile : [kasten];
    for (const l of laeufe) {
      if (c.el.contains(l.el)) continue;
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(c.el.tagName) && beschriftungVon(l.el, c.el)) continue;
      let gemeldet = false;
      for (const k of kaesten) {
        for (const q of l.rects) {
          const s = schnitt(k, q);
          if (s.x > 2 && s.y > 0.35 * q.height) {
            melde({ art: "textUeberSteuerung", um: Math.round(s.x), text: l.text, bei: beschreibe(l.el), mit: kurz(c.el.textContent || c.el.getAttribute("aria-label") || c.el.value), mitBei: beschreibe(c.el), fest: l.fest || fest(c.el), ort: ort(q, k) });
            gemeldet = true;
            break;
          }
        }
        if (gemeldet) break;
      }
    }
  }
  // Text, der aus seinem eigenen Knopf oder Link herausragt.
  for (const l of laeufe) {
    if (l.geclippt) continue;
    const ctrl = l.el.closest("button, a[href], [role=button], summary");
    if (!ctrl || !sichtbar(ctrl)) continue;
    const b = ctrl.getBoundingClientRect();
    for (const q of l.rects) {
      const um = Math.max(q.right - b.right, b.left - q.left, q.bottom - b.bottom - 2, b.top - q.top - 2);
      if (um > TOL + 0.5) { melde({ art: "ueberragtSteuerung", um: Math.round(um), text: l.text, bei: beschreibe(ctrl), ort: ort(q, b) }); break; }
    }
  }

  // ── Bilder im Fluss ─────────────────────────────────────────────────────────────────────────────────────────
  for (const img of document.querySelectorAll("img")) {
    if (!inEbene(img) || !sichtbar(img)) continue;
    const p = stil(img).position;
    if (p === "absolute" || p === "fixed") continue;
    const r = img.getBoundingClientRect();
    if (r.width < 6 || r.height < 6 || r.width > 160 || r.height > 160) continue;
    for (const l of laeufe) {
      for (const q of l.rects) {
        const s = schnitt(r, q);
        if (s.x > 2 && s.y > 0.35 * q.height) { melde({ art: "textUeberBild", um: Math.round(s.x), text: l.text, bei: beschreibe(l.el), mitBei: beschreibe(img), fest: l.fest || fest(img), ort: ort(q, r) }); break; }
      }
    }
  }

  const sw = document.documentElement.scrollWidth;
  if (sw > vw + TOL) melde({ art: "seiteScrolltQuer", um: sw - vw, text: "", bei: "html" });
  return befunde;
}
