// ──────────────────────────────────────────────────────────────
// Betriebssicht der API auf der Adminübersicht (Backend: GET /admin/operations/runtime,
// POST /admin/operations/alert-test; docs/BACKEND_ARCHITECTURE.md §12.5).
//
// Die API misst sich selbst: je Minute eine Zeile mit Anfragen, Serverfehlern, Wartezeit auf
// Datenbankverbindungen, Auslastung und Arbeitsspeicher. Bei einer Auffälligkeit geht eine
// Sammelmail an die Betreiberadresse. Dieses Modul übersetzt die Antwort in das, was die
// Übersicht zeigt — Zahlen mit Einheit, Auffälligkeiten mit Handlung, der Stand der Warnmail.
//
// Framework-frei (ohne DOM mit `node --test` prüfbar). Es rechnet nichts hoch und erfindet
// nichts: fehlt ein Wert, steht „–“ da, nie eine 0.
// ──────────────────────────────────────────────────────────────

export const RUNTIME_TEXTS = Object.freeze({
  title: "Betriebssicht der API",
  note: "Messwerte des laufenden API-Prozesses aus der letzten Minute. Bei einer Auffälligkeit geht eine "
    + "Warnmail an kontakt@confidaraexpress.de.",
  summaryIdle: "wird beim Öffnen geladen",
  summaryLoading: "wird geladen",
  summaryUnavailable: "nicht verfügbar",
  summaryStale: "nicht aktualisiert",
  summaryCalm: "keine Auffälligkeit",
  loading: "Messwerte werden geladen …",
  unavailable: "Die Messwerte sind gerade nicht abrufbar.",
  stale: "Die Messwerte ließen sich nicht aktualisieren. Unten steht der zuletzt geladene Stand.",
  noSample: "Die API hat noch keine Minute gemessen. Bitte in einer Minute aktualisieren.",
  findingsTitle: "Auffälligkeiten",
  findingsNone: "Keine Auffälligkeit.",
  action: "Was tun:",
  refresh: "Aktualisieren",
  alertNever: "Seit dem Start der API ist noch keine Warnmail hinausgegangen.",
  mailOff: "Der Mailversand der Warnungen ist auf dieser Instanz abgeschaltet. Gemessen wird trotzdem.",
  testButton: "Testwarnung senden",
  testSending: "Testwarnung wird gesendet …",
  testHint: "Sendet eine als Test markierte Mail an kontakt@confidaraexpress.de — so lässt sich prüfen, ob Warnungen ankommen.",
});

const zahl = (w) => (typeof w === "number" && Number.isFinite(w) ? w : null);
const ganz = (w) => (zahl(w) === null ? "–" : new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(w));
const prozent = (anteil) => (zahl(anteil) === null ? "–" : `${ganz(Math.round(anteil * 100))} %`);

/** Zeitpunkt in Geschäftszeit (Europe/Berlin): „24.11.2026, 16:35 Uhr“ — oder null. */
export function runtimeDateTime(wert) {
  if (typeof wert !== "string" && !(wert instanceof Date)) return null;
  const d = new Date(wert);
  if (Number.isNaN(d.getTime())) return null;
  const teile = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(d);
  return `${teile} Uhr`;
}

/**
 * Trägt die Antwort die Form der Betriebssicht? Ohne ihre beiden Listen ist sie kein Beleg — auch nicht für Ruhe:
 * „keine Auffälligkeit“ darf nur dastehen, wenn eine (leere) Liste der Auffälligkeiten gelesen wurde.
 */
export function isRuntimeView(data) {
  return Boolean(data) && typeof data === "object" && Array.isArray(data.samples) && Array.isArray(data.findings);
}

/** Die jüngste Messzeile der Antwort — oder null. */
export function latestSample(data) {
  const reihen = data && Array.isArray(data.samples) ? data.samples : [];
  const letzte = reihen.length > 0 ? reihen[reihen.length - 1] : null;
  return letzte && typeof letzte === "object" ? letzte : null;
}

/**
 * Die fünf Anzeigen der letzten Minute. Jede: Bezeichnung, Wert mit Einheit, ein Satz dazu.
 * @returns {Array<{key: string, label: string, display: string, hint: string}>}
 */
export function runtimeReadouts(data) {
  const z = latestSample(data);
  if (!z) return [];
  const db = z.db && typeof z.db === "object" ? z.db : {};
  const faden = z.faden && typeof z.faden === "object" ? z.faden : {};
  const laufend = z.laufend && typeof z.laufend === "object" ? z.laufend : {};
  const fehler = zahl(z.fehler5xx);
  return [
    {
      key: "requests", label: "Anfragen", display: ganz(z.anfragen),
      hint: fehler === null ? "in der letzten Minute"
        : fehler === 0 ? "in der letzten Minute, kein Serverfehler"
          : `in der letzten Minute, davon ${ganz(fehler)} mit Serverfehler`,
    },
    {
      key: "database", label: "Warten auf die Datenbank", display: zahl(db.warteSekunden) === null ? "–" : `${ganz(db.warteSekunden)} s`,
      hint: zahl(db.belegtMax) === null || zahl(db.max) === null
        ? "Sekunden, in denen Anfragen auf eine freie Verbindung warteten"
        : `höchstens ${ganz(db.belegtMax)} von ${ganz(db.max)} Verbindungen belegt`,
    },
    {
      key: "load", label: "Auslastung", display: prozent(faden.auslastung),
      hint: zahl(faden.p99Ms) === null ? "des Hauptfadens der API" : `des Hauptfadens, Verzug bis ${ganz(faden.p99Ms)} ms`,
    },
    {
      key: "memory", label: "Arbeitsspeicher", display: zahl(z.rssMb) === null ? "–" : `${ganz(z.rssMb)} MB`,
      hint: zahl(z.heapAnteil) === null ? "des API-Prozesses" : `des API-Prozesses, Speichergrenze zu ${prozent(z.heapAnteil)} erreicht`,
    },
    {
      key: "bookings", label: "Buchungen gleichzeitig", display: ganz(laufend.buchungenMax),
      hint: zahl(laufend.buchungenJetzt) === null ? "höchster Stand der letzten Minute" : `höchster Stand der letzten Minute, jetzt ${ganz(laufend.buchungenJetzt)}`,
    },
  ];
}

/** Die offenen Auffälligkeiten — Kategorie, Kennzahl, Handlung; nur Einträge mit Text. */
export function runtimeFindings(data) {
  const liste = data && Array.isArray(data.findings) ? data.findings : [];
  return liste
    .filter((f) => f && typeof f.key === "string" && typeof f.category === "string" && f.category !== "")
    .map((f) => ({
      key: f.key, category: f.category,
      metric: typeof f.metric === "string" ? f.metric : "",
      action: typeof f.action === "string" ? f.action : "",
    }));
}

/** Kurzfassung für die zugeklappte Zeile. `zustand`: "idle" | "loading" | "failed" | "ready". */
export function runtimeSummary(zustand, data) {
  if (zustand === "idle") return RUNTIME_TEXTS.summaryIdle;
  if (zustand === "loading" && !data) return RUNTIME_TEXTS.summaryLoading;
  if (zustand === "failed" && !data) return RUNTIME_TEXTS.summaryUnavailable;
  // Ein gescheitertes Aktualisieren: der alte Stand ist kein Beleg für den jetzigen Zustand.
  if (zustand === "failed") return RUNTIME_TEXTS.summaryStale;
  const n = runtimeFindings(data).length;
  if (n === 0) return RUNTIME_TEXTS.summaryCalm;
  return n === 1 ? "1 Auffälligkeit" : `${ganz(n)} Auffälligkeiten`;
}

const AUSGANG_TEXT = Object.freeze({
  gesendet: "gesendet",
  bereits_gemeldet: "bereits gemeldet (keine zweite Mail)",
  fehlgeschlagen: "Versand fehlgeschlagen — der nächste Versuch folgt nach einer Minute",
  mail_abgeschaltet: "nicht gesendet (Mailversand abgeschaltet)",
  unterdrueckt: "vom Versandschutz zurückgehalten",
});

/** Stand der Warnmail als Satz. */
export function runtimeAlertState(data) {
  if (!data || typeof data !== "object") return null;
  const letzte = data.lastAlert && typeof data.lastAlert === "object" ? data.lastAlert : null;
  const saetze = [];
  if (data.alertMailEnabled === false) saetze.push(RUNTIME_TEXTS.mailOff);
  if (!letzte) {
    saetze.push(RUNTIME_TEXTS.alertNever);
  } else {
    const wann = runtimeDateTime(letzte.am);
    const ausgang = Object.prototype.hasOwnProperty.call(AUSGANG_TEXT, letzte.ausgang) ? AUSGANG_TEXT[letzte.ausgang] : null;
    saetze.push(`Letzte Warnmail: ${wann ?? "Zeitpunkt unbekannt"}${ausgang ? ` — ${ausgang}` : ""}.`);
  }
  const vorgemerkt = Array.isArray(data.pendingFindings) ? data.pendingFindings.length : 0;
  if (vorgemerkt > 0) {
    saetze.push(vorgemerkt === 1
      ? "Eine Auffälligkeit ist vorgemerkt und steht in der nächsten Warnmail."
      : `${ganz(vorgemerkt)} Auffälligkeiten sind vorgemerkt und stehen in der nächsten Warnmail.`);
  }
  return saetze.join(" ");
}

/** „Stand 16:36 Uhr · API läuft seit 24.11.2026, 16:33 Uhr“ — oder null ohne Messzeile. */
export function runtimeStamp(data) {
  const z = latestSample(data);
  if (!z) return null;
  const stand = runtimeDateTime(z.t);
  const start = runtimeDateTime(z.start);
  if (!stand) return null;
  return start ? `Stand ${stand} · API läuft seit ${start}` : `Stand ${stand}`;
}

/**
 * Das Ergebnis der Testwarnung als Meldung. `status` ist der HTTP-Status, `body` die gelesene Antwort.
 * @returns {{kind: "ok"|"error", text: string}}
 */
export function alertTestOutcome(status, body) {
  const code = body && typeof body === "object" && typeof body.code === "string" ? body.code : null;
  // „Gesendet“ nur mit dem Versandzeitpunkt der Antwort — der Status allein ist kein Beleg.
  if (status === 200 && body && typeof body === "object" && typeof body.sentAt === "string" && body.sentAt !== "") {
    return { kind: "ok", text: "Testwarnung gesendet. Bitte das Postfach kontakt@confidaraexpress.de prüfen." };
  }
  // Keine Antwort (Zeitüberschreitung, Verbindungsabbruch) oder eine Erfolgsantwort ohne Versandzeitpunkt: der
  // Ausgang ist UNBEKANNT — die Mail kann hinausgegangen sein. Erst das Postfach prüfen, dann erneut senden.
  if (status === 0 || status === 200) {
    return { kind: "error", text: "Der Ausgang der Testwarnung ist unbekannt. "
      + "Bitte zuerst das Postfach kontakt@confidaraexpress.de prüfen und erst danach erneut senden." };
  }
  if (status === 409 && code === "OPS_ALERT_DISABLED") {
    return { kind: "error", text: "Der Mailversand der Warnungen ist auf dieser Instanz abgeschaltet. Es wurde nichts gesendet." };
  }
  if (status === 409 && code === "OPS_ALERT_SUPPRESSED") {
    return { kind: "error", text: "Die Testwarnung wurde vom Versandschutz zurückgehalten. Es wurde nichts gesendet." };
  }
  if (status === 429) {
    return { kind: "error", text: "Zu viele Testwarnungen in kurzer Zeit. Bitte in 15 Minuten erneut versuchen." };
  }
  if (status === 502) {
    return { kind: "error", text: "Die Testwarnung konnte nicht gesendet werden. Bitte den Mailversand prüfen." };
  }
  return { kind: "error", text: "Die Testwarnung konnte nicht gesendet werden. Bitte später erneut versuchen." };
}
