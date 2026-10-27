import { vorladbareSeite } from "../utils/vorladbareSeite";

/* Die Kunden-Anmeldung als eigener Codeabschnitt, vorladbar (utils/vorladbareSeite.js): main.jsx lädt sie vor dem
   ersten Rendern auf den Anmeldepfaden, AuthContext vor jedem Wechsel zur Anmeldung (Abmelden, abgelaufene
   Sitzung). App.jsx bindet sie wie jede andere Seite in die Routen ein. */
export const AuthSeite = vorladbareSeite(() => import("./AuthPage"));

// Die öffentliche Bestätigung des E-Mail-Wechsels: ebenfalls vorladbar, damit der Einstieg aus der E-Mail ohne
// Ladefläche des Seitenwechsels rendert.
export const EmailBestaetigungSeite = vorladbareSeite(() => import("./EmailChangeConfirmPage"));
