// ── Idempotenzschlüssel für öffentliche Supportantworten ─────────────────────
//
// Ein verlorener HTTP-Response ist im Browser nicht von einem verlorenen Request
// zu unterscheiden: `fetch` wirft in beiden Fällen denselben Netzwerkfehler.
// Sendet der Nutzer daraufhin erneut, entstünde ohne Schutz eine zweite
// Nachricht — die Antwort war beim Server längst angekommen.
//
// Der Schlüssel identifiziert deshalb die ABSENDEAKTION, nicht den Text:
//   • eine bewusste Absendeaktion  → genau ein Schlüssel
//   • jeder Wiederholungsversuch derselben Aktion → derselbe Schlüssel
//   • eine neue, andere Antwort    → neuer Schlüssel
//
// Bewusst NICHT aus dem Text abgeleitet (kein Hash): zweimal „Danke" sind zwei
// legitime Nachrichten und müssen beide ankommen.
//
// Format und Zeichenvorrat entsprechen der serverseitigen Prüfung in
// lib/support.js (`normalizeIdempotencyKey`): 8–200 Zeichen aus
// [A-Za-z0-9._:-]. UUIDv4 erfüllt das.

// `crypto.randomUUID` gibt es nur im sicheren Kontext (https bzw. localhost) —
// beides trifft für Produktion und Entwicklung zu. Der Rückfallweg deckt
// exotische Umgebungen ab, ohne eine neue Abhängigkeit einzuführen; er nutzt
// weiterhin echte Zufallsbytes und niemals Math.random.
export function newIdempotencyKey() {
  const c = typeof crypto !== "undefined" ? crypto : null;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  if (c && typeof c.getRandomValues === "function") {
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  }
  // Ohne Web Crypto ist kein tragfähiger Schlüssel erzeugbar. Dann lieber KEINEN
  // Schlüssel senden (Verhalten wie bisher) als einen schwachen, der zwei
  // unabhängige Absendeaktionen verschmelzen könnte.
  return null;
}

// Baut den Headerzusatz. Ohne Schlüssel bleibt der Request unverändert — der
// Server behandelt eine Anfrage ohne Header exakt wie bisher.
export function idempotencyHeader(key) {
  return typeof key === "string" && key !== "" ? { "Idempotency-Key": key } : undefined;
}
