// Gemeinsames Mock-Backend für „Versandpreise optimieren“ (E2E-Suite adminTariffMarkups und Sichtprüfung
// tariffMarkupsCapture). Vertrag wie routes/admin/tariffMarkups.js und lib/admin/tariffRecommendation.js
// (Felder, Zustände, Obergrenze je Paket, begrenzendes Beispielpaket, Audit; seit v2.142 ohne Untergrenze; JUMiNGO-Gruppen 8 und 9 als
// Preisgruppen kind "price_group", 1–7 als Registergruppen) — die Zahlen rechnet NUR
// dieser Mock, nach denselben Regeln wie werteKlasseAus im Backend.
//
// SYNTHETISCH: glatte Einkaufspreise und Gewichtsfaktoren, keine Messwerte, keine Produktivdaten, keine echten
// Kundenkonten. Die zehn Beispielpakete tragen die IDs des Backends; Maße so gewählt, dass das abrechenbare Gewicht
// dem tatsächlichen entspricht.

export const ADMIN = { id: 1, email: "admin@confidaraexpress.de", company_name: "ConfidaraExpress", name: "Anna Admin", role: "admin", status: "approved", country: "DE" };
export const KONTEN = {
  7: { id: 7, name: "Max Mustermann", email: "einkauf@muster-logistik.example", company_name: "Muster Logistik GmbH", role: "customer", status: "approved", country: "DE", customer_number: "CE-K-10031" },
  8: { id: 8, name: "Erika Beispiel", email: "erika@beispiel.example", company_name: "Beispiel AG", role: "customer", status: "approved", country: "DE", customer_number: "CE-K-10032" },
};
export const TG = [
  [22, "UPS Standard", "UPS", "STANDARD"], [23, "UPS Express Saver", "UPS", "EXPRESS"], [29, "UPS Express", "UPS", "EXPRESS"],
  [84, "DHL Express Domestic", "DHL", "EXPRESS"], [85, "DHL Express 9:00", "DHL", "EXPRESS"], [86, "DHL Express 10:30", "DHL", "EXPRESS"], [87, "DHL Express 12:00", "DHL", "EXPRESS"],
];
export const JU = [
  [1, "UPS Standard", "UPS", "STANDARD", null], [2, "UPS Express Saver", "UPS", "EXPRESS", null], [3, "UPS Express", "UPS", "EXPRESS", null],
  [4, "DHL Express Domestic", "DHL", "EXPRESS", null], [5, "DHL Express 9:00", "DHL", "EXPRESS", null], [6, "DHL Express 10:30", "DHL", "EXPRESS", null],
  [7, "DHL Express 12:00", "DHL", "EXPRESS", null],
  [8, "DHL Express Sondertarif", "DHL", "EXPRESS", "Eigener Tarif auf DHL Express, Zustellung bis 18:00, nur Einzelpaket bis 10 kg abrechenbar."],
  [9, "UPS Express 12:00", "UPS", "EXPRESS", "UPS Express mit Zustellung bis 12:00."],
];
export const KLASSEN = [[1, "bis 5 kg", "≤ 5 kg"], [2, "über 5 bis 10 kg", "5–10 kg"], [3, "über 10 bis 20 kg", "10–20 kg"], [4, "über 20 kg", "> 20 kg"]];
export const DESTS = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"];
// f = Faktor auf den Transglobal-Einkauf, fv = Faktor auf den JUMiNGO-Einkauf. Wo sie abweichen, ist die andere
// Seite bei diesem Gewicht relativ günstiger — dieses Paket begrenzt dann die Klasse (wie im echten Vergleich).
export const STANDARD_SZENARIEN = [
  ["w2", 2, [30, 20, 15], 1, 1.0, 1.0], ["w5", 5, [40, 30, 20], 1, 1.2, 1.1],
  ["w6", 6, [40, 30, 25], 2, 1.3, 1.3], ["w7_5", 7.5, [50, 30, 25], 2, 1.4, 1.4], ["w10", 10, [50, 40, 25], 2, 1.6, 1.5],
  ["w12", 12, [50, 40, 30], 3, 1.7, 1.7], ["w15", 15, [60, 40, 30], 3, 1.9, 1.9], ["w20", 20, [60, 50, 30], 3, 2.2, 2.1],
  ["w25", 25, [60, 50, 40], 4, 2.6, 2.6], ["w30", 30, [80, 50, 35], 4, 2.9, 2.8],
].map(([id, weightKg, [lengthCm, widthCm, heightCm], weightClass, f, fv]) => ({ id, weightKg, lengthCm, widthCm, heightCm, weightClass, chargeableGrams: weightKg * 1000, f, fv }));
const EK_TG = { 22: 800, 23: 1200, 29: 2200, 84: 1800, 85: 6000, 86: 4000, 87: 3000 };
const EK_JU = { 1: 1000, 2: 1600, 3: 2600, 4: 2200, 5: 4000, 6: 4200, 7: 3200, 8: 2600, 9: 2800 };
const PAAR_TG = { 22: 1, 23: 2, 29: 3, 84: 4, 85: 5, 86: 6, 87: 7 };
const AEHNLICH_JU = { 8: 84, 9: 29 };
const NUR_INLAND = new Set(["transglobal:84", "jumingo:4"]);
const KEIN_VERGLEICH = new Set(["transglobal:86:4", "jumingo:6:4", "transglobal:85:3", "jumingo:5:3"]);
const NICHT_VERFUEGBAR = new Set(["transglobal:87:4"]);
// Abruf fehlgeschlagen (eigene Preise fehlen, die Gegenseite hat dann kein Vergleichsangebot) — Zustand „Providerfehler“.
const AUSFALL = new Set(["jumingo:6:3"]);
// Erfundener Abholzuschlag (nicht der echte Betrag des Kontos — dieses Repository ist öffentlich).
export const SAME_DAY_FEE = 390;
export const STANDARD_AUDIT = [
  { id: 3, created_at: "2026-11-12T09:30:00.000Z", actor_user_id: 1, actor: { id: 1, name: "Anna Admin" }, target_user_id: 7, action: "user.tariff_markup_change", result: "success",
    metadata: { tariff_provider: "jumingo", tariff_product_key: 1, tariff_weight_class: 1, tariff_markup_percent: 30, tariff_markup_change: "set" } },
  { id: 2, created_at: "2026-11-10T10:00:00.000Z", actor_user_id: 1, actor: { id: 1, name: "Anna Admin" }, target_user_id: 7, action: "user.tariff_markup_change", result: "success",
    metadata: { tariff_provider: "transglobal", tariff_product_key: 85, tariff_weight_class: 0, tariff_markup_percent: 35, tariff_markup_percent_before: 30, tariff_markup_change: "changed" } },
  { id: 1, created_at: "2026-10-01T08:00:00.000Z", actor_user_id: 2, actor: { id: 2, name: "Ben Betrieb" }, target_user_id: 7, action: "user.tariff_markup_change", result: "success",
    metadata: { tariff_provider: "transglobal", tariff_product_key: 22, tariff_markup_percent: 0, tariff_markup_percent_before: 20, tariff_markup_change: "changed" } },
];
export const STANDARD_OVERRIDES = { 7: { "transglobal:22:0": 0, "transglobal:85:0": 35, "jumingo:1:1": 30 }, 8: {} };

const netto = (cents, p) => Math.round((cents * (100 + p)) / 100);
const floor5 = (x) => Math.floor(x / 5) * 5;
const abstand = (a, b) => (b > 0 ? Math.round(((a - b) * 10000) / b) / 100 : null);
const ek = (provider, key, sz) => Math.round((provider === "transglobal" ? EK_TG[key] * sz.f : EK_JU[key] * sz.fv));
const eintrag = (provider, key) => (provider === "transglobal" ? TG.find((t) => t[0] === key) : JU.find((g) => g[0] === key));
const hat = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const partnerVon = (provider, key) => {
  if (provider === "transglobal") return { provider: "jumingo", key: PAAR_TG[key] };
  if (hat(AEHNLICH_JU, key)) return { provider: "transglobal", key: AEHNLICH_JU[key] };
  const tg = Object.keys(PAAR_TG).find((t) => PAAR_TG[t] === key);
  return tg ? { provider: "transglobal", key: Number(tg) } : null;
};
const verfuegbar = (land, provider, key, wc) => !(land !== "DE" && NUR_INLAND.has(`${provider}:${key}`)) && !NICHT_VERFUEGBAR.has(`${provider}:${key}:${wc}`);

export function createTariffMock({ overrides = STANDARD_OVERRIDES, konto = { standardPercent: 20, expressPercent: 30 }, audit = STANDARD_AUDIT } = {}) {
  const state = {
    overrides: JSON.parse(JSON.stringify(overrides)), audit: JSON.parse(JSON.stringify(audit)), naechsteAudit: 100,
    puts: [], refreshes: [], previews: [], audits: [], gets: 0, runs: {}, naechste: 41,
    putFehler: null, refreshStatus: null, previewStatus: null, auditStatus: null, verzoegerungMs: 0,
  };
  const kontoSatz = (provider, key) => (eintrag(provider, key)[3] === "EXPRESS" && konto.expressPercent !== null
    ? { percent: konto.expressPercent, source: "express" } : { percent: konto.standardPercent, source: "standard" });
  // Rangfolge wie lib/pricing.js: (Tarif, Klasse) → (Tarif, alle Gewichte) → Konto; ein Entwurf ersetzt den gespeicherten Wert.
  const satz = (uid, provider, key, wc, draft) => {
    const ov = state.overrides[uid] || {};
    const k = (w) => `${provider}:${key}:${w}`;
    if (wc > 0) {
      if (hat(draft, k(wc))) { if (draft[k(wc)] !== null) return { percent: draft[k(wc)], source: "draft" }; }
      else if (hat(ov, k(wc))) return { percent: ov[k(wc)], source: "weight_class" };
    }
    if (hat(draft, k(0))) { if (draft[k(0)] !== null) return { percent: draft[k(0)], source: "all_weights" }; }
    else if (hat(ov, k(0))) return { percent: ov[k(0)], source: "all_weights" };
    return kontoSatz(provider, key);
  };
  const alleTarife = () => [
    ...TG.map(([key, label, carrier, pc]) => ({ provider: "transglobal", key, label, carrier, pc, note: null, kind: "product" })),
    ...JU.map(([key, label, carrier, pc, note]) => ({ provider: "jumingo", key, label, carrier, pc, note, kind: key >= 8 ? "price_group" : "register" })),
  ];
  const dto = (uid) => {
    const ov = state.overrides[uid] || {};
    const zeit = (k) => (hat(ov, k) ? { setAt: "2026-11-10T10:00:00.000Z", setBy: 1 } : { setAt: null, setBy: null });
    return {
      userId: uid, provider: "transglobal", minimumMarkupPercent: 0, account: { ...konto, standardSource: "customer_confirmed" },
      weightClasses: KLASSEN.map(([weightClass, label, shortLabel]) => ({ weightClass, label, shortLabel })),
      products: TG.map(([key, label, carrier, pc]) => {
        const erbt = kontoSatz("transglobal", key);
        const alle = ov[`transglobal:${key}:0`];
        return { productKey: key, label, carrier, pricingClass: pc, inheritedPercent: erbt.percent, inheritedSource: erbt.source,
          overridePercent: alle ?? null, effectivePercent: alle ?? erbt.percent, source: alle === undefined ? erbt.source : "product", ...zeit(`transglobal:${key}:0`) };
      }),
      tariffs: alleTarife().map((t) => {
        const erbt = kontoSatz(t.provider, t.key);
        const k0 = `${t.provider}:${t.key}:0`;
        return {
          provider: t.provider, productKey: t.key, kind: t.kind, label: t.label, carrier: t.carrier, pricingClass: t.pc, note: t.note,
          inheritedPercent: erbt.percent, inheritedSource: erbt.source,
          allWeights: { overridePercent: ov[k0] ?? null, effectivePercent: ov[k0] ?? erbt.percent, source: hat(ov, k0) ? "all_weights" : erbt.source, ...zeit(k0) },
          classes: KLASSEN.map(([wc, label]) => {
            const s = satz(uid, t.provider, t.key, wc, null);
            const k = `${t.provider}:${t.key}:${wc}`;
            return { weightClass: wc, label, overridePercent: ov[k] ?? null, effectivePercent: s.percent, source: s.source, ...zeit(k) };
          }),
        };
      }),
      comparison: { destinations: DESTS.map((c) => ({ country: c, hasExampleAddress: c !== "MT" })), maxAgeHours: 24, refreshLimit: { max: 5, windowMinutes: 15 } },
    };
  };

  // Auswertung eines Tarifs in einer Klasse — dieselben Regeln wie werteKlasseAus (Backend).
  const auswertung = (run, provider, key, wc, draft, aufschlag = 0) => {
    const eigen = satz(run.uid, provider, key, wc, draft);
    const samples = [];
    let obergrenze = null;
    let unterBoden = false;
    let begrenzend = null;
    for (const sz of run.szenarien.filter((x) => x.weightClass === wc)) {
      const basis = { scenarioId: sz.id, weightKg: sz.weightKg, chargeableKg: sz.chargeableGrams / 1000 };
      const leer = { upperBoundPercent: null, belowFloor: false, differencePercent: null };
      if (!verfuegbar(run.land, provider, key, wc)) { samples.push({ ...basis, own: null, comparison: null, reason: "own_unavailable", ...leer }); continue; }
      if (AUSFALL.has(`${provider}:${key}:${wc}`)) { samples.push({ ...basis, own: null, comparison: null, reason: "fetch_failed", ...leer }); continue; }
      const eigenEk = ek(provider, key, sz) + aufschlag;
      const eigenNetto = netto(eigenEk, eigen.percent);
      const own = { purchaseNetCents: eigenEk, customerNetCents: eigenNetto, contributionCents: eigenNetto - eigenEk, pickupDate: "2026-11-18" };
      const partner = partnerVon(provider, key);
      const partnerAusfall = !!partner && AUSFALL.has(`${partner.provider}:${partner.key}:${wc}`);
      if (!partner || partnerAusfall || KEIN_VERGLEICH.has(`${provider}:${key}:${wc}`) || !verfuegbar(run.land, partner.provider, partner.key, wc)) {
        samples.push({ ...basis, own, comparison: null, reason: partnerAusfall ? "fetch_failed" : "no_comparable", ...leer });
        continue;
      }
      const r = satz(run.uid, partner.provider, partner.key, wc, draft);
      const vEk = ek(partner.provider, partner.key, sz);
      const vNetto = netto(vEk, r.percent);
      const roh = ((0.99 / 1.03) * (vEk / eigenEk) * (1 + r.percent / 100) - 1) * 100;
      // Keine Untergrenze (v2.142): unter 0 % erreicht kein gültiger Satz das Ziel — „kein sicherer Spielraum“.
      const boden = roh < 0;
      const stufe = boden ? 0 : Math.min(100, floor5(roh));
      const aehnlich = provider === "jumingo" && hat(AEHNLICH_JU, key);
      samples.push({ ...basis, own, reason: null, upperBoundPercent: stufe, upperBoundRawPercent: Math.round(roh * 100) / 100, belowFloor: boden,
        comparison: { relation: aehnlich ? "similar" : "equivalent", provider: partner.provider, label: eintrag(partner.provider, partner.key)[1],
          tariffId: partner.provider === "jumingo" ? String(3700 + partner.key) : String(partner.key), purchaseNetCents: vEk, ratePercent: r.percent,
          customerNetCents: vNetto, pickupDate: "2026-11-18", purchaseAdvantagePercent: vEk > 0 ? Math.round(((vEk - eigenEk) * 10000) / vEk) / 100 : null },
        differencePercent: abstand(eigenNetto, vNetto) });
      if (boden) unterBoden = true;
      if (obergrenze === null || stufe < obergrenze || (stufe === obergrenze && roh < begrenzend.roh)) { obergrenze = stufe; begrenzend = { scenarioId: sz.id, roh }; }
    }
    const verglichen = samples.filter((x) => x.comparison).length;
    const andereGuenstiger = samples.some((x) => x.comparison && x.own && x.comparison.purchaseNetCents < x.own.purchaseNetCents);
    // Empfehlung wie werteKlasseAus (v2.142): nie über der sicheren Obergrenze; ohne Vergleich oder sicheren
    // Spielraum keine; andere Seite günstiger höchstens 25 %; sonst die Mitte zwischen 25 % und der Obergrenze.
    const empfohlen = verglichen === 0 || unterBoden ? null
      : andereGuenstiger ? Math.min(obergrenze, 25) : Math.min(obergrenze, floor5((25 + obergrenze) / 2));
    const vergleich = verglichen === 0 ? "no_comparison"
      : andereGuenstiger || unterBoden || eigen.percent > obergrenze ? "at_risk"
        : empfohlen !== null && empfohlen - eigen.percent >= 5 ? "more_profit" : "good";
    let vorschlag = empfohlen !== null && (vergleich === "more_profit" || vergleich === "at_risk") ? empfohlen : null;
    if (vorschlag === eigen.percent) vorschlag = null;
    for (const x of samples) {
      if (!x.own || empfohlen === null) { x.atRecommended = null; continue; }
      const n = netto(x.own.purchaseNetCents, empfohlen);
      x.atRecommended = { percent: empfohlen, customerNetCents: n, contributionCents: n - x.own.purchaseNetCents,
        differencePercent: x.comparison ? abstand(n, x.comparison.customerNetCents) : null };
    }
    return {
      status: vergleich, comparisonStatus: vergleich,
      hint: verglichen === 0 ? null : andereGuenstiger ? "other_provider_cheaper" : obergrenze <= 30 ? "little_headroom" : null,
      currentPercent: eigen.percent, upperBoundPercent: obergrenze, recommendedPercent: empfohlen, suggestedPercent: vorschlag, belowFloor: unterBoden,
      limitingScenarioId: begrenzend ? begrenzend.scenarioId : null,
      exampleScenarioId: begrenzend ? begrenzend.scenarioId : ((samples.find((x) => x.own) || {}).scenarioId || null),
      comparedSamples: verglichen, totalSamples: samples.length, samples,
    };
  };
  const projektion = (run, entries) => {
    const draft = Array.isArray(entries) && entries.length > 0
      ? Object.fromEntries(entries.map((e) => [`${e.provider}:${e.productKey}:${e.weightClass}`, e.markupPercent])) : null;
    const ov = state.overrides[run.uid] || {};
    return {
      runId: run.id, kind: run.kind, createdAt: run.createdAt, expiresAt: "2099-01-01T00:00:00.000Z", destinationCountry: run.land, collectionDate: "2026-11-18",
      conditions: { sender: { country: "DE", postalCode: "10115", city: "Berlin", street: "Musterstraße 1" },
        recipient: run.land === "DE" ? { country: "DE", postalCode: "80331", city: "München", street: "Beispielweg 8" } : { country: run.land, postalCode: "1010", city: "Wien", street: "Beispielgasse 1" },
        handover: "pickup", addressType: "business", packageCount: 1, extras: "none", transglobalPriceBasis: "preliminary_minimal_quote", priceType: "net" },
      scenarios: run.szenarien.map((s) => ({ id: s.id, package: { weightKg: s.weightKg, lengthCm: s.lengthCm, widthCm: s.widthCm, heightCm: s.heightCm },
        weightClass: s.weightClass, chargeableKg: s.chargeableGrams / 1000, status: "ok", providers: { transglobal: "success", jumingo: "success" } })),
      weightClasses: KLASSEN.map(([weightClass, label, shortLabel]) => ({ weightClass, label, shortLabel })),
      minimumMarkupPercent: 0,
      recommendationParameters: { priceAdvantagePercent: 1, purchaseBufferPercent: 3, stepPercent: 5, maxPercent: 100 },
      sameDayReference: { productKey: 22, feeNetCents: SAME_DAY_FEE },
      tariffs: alleTarife().map((t) => ({
        provider: t.provider, productKey: t.key, kind: t.kind, label: t.label, carrier: t.carrier, pricingClass: t.pc, note: t.note,
        classes: KLASSEN.map(([wc]) => {
          const k = `${t.provider}:${t.key}:${wc}`;
          const gespeichert = satz(run.uid, t.provider, t.key, wc, null);
          const wirksam = satz(run.uid, t.provider, t.key, wc, draft);
          const c = hat(draft, k) ? { percent: draft[k] } : null;
          const out = {
            weightClass: wc,
            saved: { percent: gespeichert.percent, source: gespeichert.source, overridePercent: ov[k] ?? null },
            effective: { percent: wirksam.percent, source: c && c.percent !== null ? "draft" : wirksam.source },
            draft: c,
            ...auswertung(run, t.provider, t.key, wc, draft),
          };
          if (t.provider === "transglobal" && t.key === 22) out.sameDay = { feeNetCents: SAME_DAY_FEE, ...auswertung(run, t.provider, t.key, wc, draft, SAME_DAY_FEE) };
          return out;
        }),
      })),
      products: [],
      ageSeconds: 5,
    };
  };

  const pricing = (uid) => ({ userId: uid, priceMarkupPercent: konto.standardPercent, expressPriceMarkupPercent: konto.expressPercent,
    effectiveExpressPriceMarkupPercent: konto.expressPercent ?? konto.standardPercent, expressMarkupUsesFallback: konto.expressPercent === null,
    confirmed: true, confirmedAt: "2026-09-01T00:00:00.000Z", confirmedBy: 1, updatedAt: "2026-09-01T00:00:00.000Z" });

  async function handle(route) {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: ADMIN });
    let m = /\/admin\/users\/(\d+)$/.exec(p);
    if (m) return json({ user: KONTEN[m[1]], summary: {} });
    m = /\/admin\/users\/(\d+)\/price-markup$/.exec(p);
    if (m) return json(pricing(Number(m[1])));
    m = /\/admin\/users\/(\d+)\/tariff-markups$/.exec(p);
    if (m && req.method() === "GET") { state.gets += 1; return json(dto(Number(m[1]))); }
    if (m && req.method() === "PUT") {
      const uid = Number(m[1]);
      const body = req.postDataJSON();
      state.puts.push({ uid, body });
      if (state.putFehler) return json(state.putFehler.body, state.putFehler.status);
      const ov = (state.overrides[uid] = state.overrides[uid] || {});
      const eintraege = Array.isArray(body.entries) ? body.entries : [];
      // Keine Untergrenze (v2.142): jeder gültige Satz von 0 bis 100 % wird gespeichert; 0 ist ein Satz, null setzt zurück.
      for (const e of eintraege) {
        const k = `${e.provider}:${e.productKey}:${e.weightClass}`;
        const alt = ov[k] ?? null;
        if (e.markupPercent === alt) continue;
        if (e.markupPercent === null) delete ov[k]; else ov[k] = e.markupPercent;
        const meta = { tariff_provider: e.provider, tariff_product_key: e.productKey, tariff_weight_class: e.weightClass, tariff_markup_change: e.markupPercent === null ? "cleared" : alt === null ? "set" : "changed" };
        if (alt !== null) meta.tariff_markup_percent_before = alt;
        if (e.markupPercent !== null) meta.tariff_markup_percent = e.markupPercent;
        state.audit.push({ id: state.naechsteAudit++, created_at: "2026-11-17T10:15:00.000Z", actor_user_id: 1, actor: { id: 1, name: "Anna Admin" }, target_user_id: uid,
          action: "user.tariff_markup_change", result: "success", metadata: meta });
      }
      return json(dto(uid));
    }
    m = /\/admin\/users\/(\d+)\/tariff-comparison$/.exec(p);
    if (m && req.method() === "POST") {
      const uid = Number(m[1]);
      const body = req.postDataJSON();
      state.refreshes.push({ uid, body });
      if (state.verzoegerungMs) await new Promise((r) => setTimeout(r, state.verzoegerungMs));
      if (state.refreshStatus === 429) return json({ error: "Zu viele Anfragen.", code: "RATE_LIMITED" }, 429);
      if (state.refreshStatus) return json({ error: "Interner Fehler." }, state.refreshStatus);
      if (body.custom && !(Number(body.custom.weightKg) > 0)) return json({ error: "Paket ungültig.", code: "INVALID_CUSTOM_PACKAGE" }, 400);
      let szenarien = STANDARD_SZENARIEN;
      if (body.custom) {
        const kg = Number(body.custom.weightKg);
        const f = Math.max(1, Math.round((0.8 + kg * 0.07) * 10) / 10);
        szenarien = [{ id: "custom", weightKg: kg, lengthCm: body.custom.lengthCm, widthCm: body.custom.widthCm, heightCm: body.custom.heightCm,
          weightClass: kg <= 5 ? 1 : kg <= 10 ? 2 : kg <= 20 ? 3 : 4, chargeableGrams: Math.round(kg * 1000), f, fv: f }];
      }
      const run = { id: String(state.naechste++), uid, kind: body.custom ? "custom" : "standard", land: body.destinationCountry, createdAt: "2026-11-17T09:12:00.000Z", szenarien };
      state.runs[run.id] = run;
      return json(projektion(run, null));
    }
    m = /\/admin\/users\/(\d+)\/tariff-comparison\/(\d+)\/preview$/.exec(p);
    if (m && req.method() === "POST") {
      const body = req.postDataJSON();
      state.previews.push({ uid: Number(m[1]), runId: m[2], body });
      if (state.previewStatus === 410) return json({ error: "Die Vergleichsbasis ist abgelaufen.", code: "COMPARISON_EXPIRED" }, 410);
      if (state.previewStatus) return json({ error: "Interner Fehler." }, state.previewStatus);
      const run = state.runs[m[2]];
      if (!run || run.uid !== Number(m[1])) return json({ error: "abgelaufen", code: "COMPARISON_EXPIRED" }, 410);
      return json(projektion(run, body.entries || null));
    }
    if (p.endsWith("/admin/audit-logs")) {
      const q = Object.fromEntries(url.searchParams);
      state.audits.push(q);
      if (state.auditStatus) return json({ error: "Interner Fehler." }, state.auditStatus);
      const uid = Number(q.target_user_id);
      const logs = state.audit.filter((l) => l.target_user_id === uid && (!q.action || l.action === q.action)).sort((a, b) => b.id - a.id);
      return json({ logs, pagination: { limit: Number(q.limit) || 25, offset: 0, count: logs.length, total: logs.length } });
    }
    if (p.endsWith("/launch-scope")) return json({ countries: DESTS, destinationCountries: DESTS, originCountries: ["DE"] });
    if (p.includes("/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    return json({ items: [], users: [], shipments: [], invoices: [], drafts: [], addresses: [], warehouses: [], summary: null, nextCursor: null, pagination: { total: 0 } });
  }

  return { state, handle, dto, projektion };
}
