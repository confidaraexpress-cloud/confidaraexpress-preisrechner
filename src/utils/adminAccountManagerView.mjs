// Admin: persönlicher ConfidaraExpress-Ansprechpartner eines Kundenkontos (Betreiberentscheidung 2026-10-30,
// Canonical 1A, v2.90) — reine Ansichtslogik für Kundendetail und Kundenliste. Personen, Auswahl und Codes kommen
// ausschließlich vom Server (GET/PUT /admin/users/:id/account-manager, Listenfeld `account_manager`).

export const AM_ADMIN_TEXT = Object.freeze({
  title: "ConfidaraExpress-Betreuung",
  fieldLabel: "Zugewiesener ConfidaraExpress-Ansprechpartner",
  unassigned: "Noch nicht zugeordnet",
  since: "Zugeordnet seit",
  nextAutomatic: "Nächste automatische Zuteilung",
  save: "Ansprechpartner speichern",
  saving: "Wird gespeichert…",
  loading: "Wird geladen…",
  reload: "Erneut laden",
  loadError: "Der Ansprechpartner konnte nicht geladen werden.",
  saveError: "Der Ansprechpartner konnte nicht gespeichert werden. Bitte erneut versuchen.",
  hint: "Der Kunde sieht seinen Ansprechpartner in der Seitenleiste seines Kundenbereichs. Ein Wechsel ändert die automatische Zuteilung neuer Kunden nicht; Mails, Support und Benachrichtigungen bleiben unverändert.",
  listPrefix: "Betreuung",
  listUnassigned: "nicht zugeordnet",
});

// Gründe, aus denen ein Konto keinen Ansprechpartner hat (Feld `reason` des Servers).
export const AM_REASON_TEXT = Object.freeze({
  sales_partner: "Vertriebspartner werden im Bereich Vertriebspartner verwaltet.",
  prelive_test: "Pre-Live-Testkonten erhalten keinen Ansprechpartner.",
  anonymized: "Anonymisierte Konten haben keinen Ansprechpartner.",
  not_customer: "Nur Kundenkonten haben einen persönlichen Ansprechpartner.",
});

const SCHLUESSEL_RE = /^[a-z]{2,32}$/;

function option(o) {
  return o && typeof o === "object" && typeof o.key === "string" && SCHLUESSEL_RE.test(o.key)
    && typeof o.name === "string" && o.name.trim() !== ""
    ? Object.freeze({ key: o.key, name: o.name })
    : null;
}

// Antwort von GET in eine geprüfte Sicht; ungültig → null (die Karte zeigt dann den Ladefehler).
export function selectAdminAccountManager(status, body) {
  if (status !== 200 || !body || typeof body !== "object") return null;
  const am = body.accountManager;
  if (!am || typeof am !== "object" || !Array.isArray(am.options)) return null;
  const options = am.options.map(option).filter(Boolean);
  if (options.length === 0) return null;
  return Object.freeze({
    current: option(am.current),
    assignedAt: typeof am.assignedAt === "string" && am.assignedAt ? am.assignedAt : null,
    applicable: am.applicable === true,
    reason: typeof am.reason === "string" ? am.reason : null,
    options: Object.freeze(options),
    nextAutomatic: option(am.nextAutomatic),
  });
}

export function reasonText(reason) {
  return AM_REASON_TEXT[reason] || AM_REASON_TEXT.not_customer;
}

export function savedText(name) {
  return `Ansprechpartner geändert: ${name}. Der Kunde sieht die Änderung beim nächsten Laden seines Kundenbereichs.`;
}

// Ergebnis von PUT: { type: "success"|"info"|"error", text, reload }. `reload` = Sicht neu laden (Konflikt,
// Erfolg); die Meldung nennt den aktuellen Stand, wenn der Server ihn liefert.
export function saveOutcome(status, body, chosenName) {
  const code = body && typeof body.code === "string" ? body.code : "";
  if (status === 200 && body && body.noOp === true) {
    return { type: "info", text: `Unverändert: ${chosenName} ist bereits zugeordnet.`, reload: true };
  }
  if (status === 200) return { type: "success", text: savedText(chosenName), reload: true };
  if (status === 409 && code === "ACCOUNT_MANAGER_CHANGED") {
    const aktuell = option(body.current);
    return {
      type: "error",
      text: `Der Ansprechpartner wurde inzwischen geändert${aktuell ? ` (jetzt: ${aktuell.name})` : ""}. Bitte prüfen Sie die Auswahl und speichern Sie erneut.`,
      reload: true,
    };
  }
  if (status === 409 && code === "SALES_PARTNER_MANAGED_SEPARATELY") return { type: "error", text: AM_REASON_TEXT.sales_partner, reload: true };
  if (status === 409 && code === "PRELIVE_TEST_ACCOUNT") return { type: "error", text: AM_REASON_TEXT.prelive_test, reload: true };
  if (status === 409 && code === "ACCOUNT_ANONYMIZED") return { type: "error", text: AM_REASON_TEXT.anonymized, reload: true };
  if (status === 409 && code === "ACCOUNT_MANAGER_NOT_APPLICABLE") return { type: "error", text: AM_REASON_TEXT.not_customer, reload: true };
  if (status === 400 && code === "INVALID_ACCOUNT_MANAGER") {
    return { type: "error", text: "Bitte einen Ansprechpartner aus der Liste wählen.", reload: true };
  }
  if (status === 404) return { type: "error", text: "Das Kundenkonto wurde nicht gefunden.", reload: false };
  if (status === 429) return { type: "error", text: "Zu viele Anfragen. Bitte in einigen Minuten erneut versuchen.", reload: false };
  return { type: "error", text: AM_ADMIN_TEXT.saveError, reload: false };
}

// Zweite Zeile der Kundenliste: nur Kundenkonten; ohne Zuordnung „nicht zugeordnet“ — so findet der Betreiber die
// Bestandskunden, die er noch zuordnen will.
export function listLine(user) {
  if (!user || user.role !== "customer") return null;
  const am = option(user.account_manager);
  return `${AM_ADMIN_TEXT.listPrefix}: ${am ? am.name : AM_ADMIN_TEXT.listUnassigned}`;
}
