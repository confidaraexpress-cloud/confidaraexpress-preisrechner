/* Dev-Server der E2E-Suiten plattformgerecht starten und beenden.
 *
 * Jede Suite startet ihren Server mit
 *
 *     server = spawn("npx", ["vite", …], { ...DEV_SERVER_SPAWN, stdio: "ignore" });
 *
 * und beendet ihn im `after`-Haken mit `stopDevServer(server, …)`.
 *
 * ── POSIX (CI) ────────────────────────────────────────────────────────────
 * Unveraendert: `detached` macht das Kind zum Anfuehrer einer eigenen
 * Prozessgruppe, `process.kill(-pid)` beendet die ganze Gruppe — also auch
 * `sh -c vite` und den node-Enkel, der den Port haelt (siehe
 * `devServerTeardown.test.mjs`).
 *
 * ── Windows ───────────────────────────────────────────────────────────────
 * Hier ist `detached` schaedlich: das Kind laeuft dann OHNE Konsole. Die
 * Volta-Shims `npx.exe`/`npm.exe` starten intern `cmd.exe /C …`, und dieses
 * holt sich mangels geerbter Konsole eine NEUE, sichtbare — unter Windows 11
 * ein Windows-Terminal-Fenster pro Suite, das den Fokus stiehlt und den
 * virtuellen Desktop wechselt. Gemessen: jedes `npx vite` einer Suite erzeugte
 * genau ein `OpenConsole.exe -Embedding` (die Uebergabe an Windows Terminal).
 * `windowsHide` gibt dem Kind stattdessen eine unsichtbare Konsole, die Kind
 * und Enkel erben.
 * Prozessgruppen-Signale gibt es unter Windows nicht — `process.kill(-pid)`
 * wirft dort immer, und `server.kill()` traf nur den npx-Prozess: Vite blieb
 * samt Port und Fenster stehen. Deshalb `taskkill /T` auf den Prozessbaum.
 */
import { spawnSync } from "node:child_process";

const WINDOWS = process.platform === "win32";

/** Spawn-Optionen fuer jeden Dev-Server einer Suite (per Spread ins Optionsobjekt). */
export const DEV_SERVER_SPAWN = Object.freeze({ detached: !WINDOWS, windowsHide: true });

/** Beendet den Dev-Server samt Kind und Enkel. Ein bereits beendeter Server ist
 *  kein Testfehler — nichts hiervon wirft. */
export function stopDevServer(server, signal = "SIGKILL") {
  if (!server?.pid) return;
  if (WINDOWS) {
    spawnSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  } else {
    try { process.kill(-server.pid, signal); } catch { /* schon beendet */ }
  }
  // Rueckfallebene: ist die Gruppe bereits weg, raeumt das einen etwaigen Rest ab.
  try { server.kill(signal); } catch { /* schon beendet */ }
}
