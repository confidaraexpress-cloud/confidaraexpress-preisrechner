import React, { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { accountInitials } from "../../utils/accountIdentity.mjs";
import { useCompanyLogo } from "../../hooks/useCompanyLogo";
import { COMPANY_LOGO_TEXT } from "../../utils/companyLogoView.mjs";

/* ── Benutzerchip (Paket A, Phase 3) ─────────────────────────────────────────
   Bis Phase 3 gab es drei Identitätsanzeigen im eingeloggten Bereich: den
   Chip der Übersicht (.pp-uchip mit Firmenmarke, Name und Firma), den nackten
   Initialen-Kreis der mobilen Topbar (.user-avatar) und die Firmenkarte der
   Sidebar. Auf Mobil standen der Kreis der Topbar und die Sidebar-Karte
   gleichzeitig — dieselbe Identität zweimal.

   Ab jetzt gibt es genau EINEN Chip. Er sitzt im Utility-Cluster des
   Seitenkopfs (Desktop) und ist 40 px hoch, also auf der Höhenskala der
   Bedienelemente. Die mobile Topbar trägt Menü, Wortmarke und Glocke — keine
   zweite Identität.

   Die Komponente rendert nur Struktur und ruft `onClick` auf. Sie kennt keine
   Route und keinen Zustand. */

/* Firmenmarke: das hinterlegte Firmenlogo — und solange keines vorliegt, ein
   flacher Squircle in der Akzentfarbe mit echter Konto-Initiale.

   DREI Wege führen zur Initiale zurück, und sie sind absichtlich alle drei
   abgedeckt:
     • kein `logoUrl` — das Konto hat kein Logo, ODER das Backend kennt das
       Feld noch gar nicht (dann liefert die Profilantwort es schlicht nicht);
     • der Abruf scheitert — der Service liefert dann null statt zu werfen;
     • das Bild lädt, ist aber nicht darstellbar — `onError` fängt das ab.
   Es gibt damit keinen Zustand, in dem hier eine leere Fläche stünde.

   `failed` wird beim Wechsel der Quelle zurückgesetzt: ein einmal kaputtes Bild
   darf ein danach hochgeladenes gültiges nicht dauerhaft blockieren. */
export function CompanyMark({ initial, logoUrl = null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [logoUrl]);

  if (logoUrl && !failed) {
    return (
      /* alt="" + aria-hidden: der Chip trägt seine Beschriftung bereits über
         aria-label und den sichtbaren Firmennamen. Ein zusätzlicher Alternativ-
         text würde die Identität doppelt vorlesen.
         object-fit: contain (CSS) hält jedes Seitenverhältnis unverzerrt — ein
         breites Wortmarken-Logo wird schmal, nicht gestaucht. */
      <img
        className="ce-comark ce-comark-img"
        src={logoUrl}
        alt=""
        aria-hidden="true"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <svg className="ce-comark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="38" height="38" rx="11.5" fill="#2563eb" />
      {/* SVG-Präsentationsattribute lösen keine CSS-Variablen auf — die
          Familie steht hier deshalb als einziges Literal im Projekt; sie ist
          identisch mit --ce-font-sans. */}
      <text x="20" y="26" textAnchor="middle" fontFamily="'DM Sans',system-ui,sans-serif" fontWeight="600" fontSize="16" fill="#ffffff">{initial}</text>
    </svg>
  );
}

/* Größere Fassung derselben Marke für das Profil. Sie zeigt dasselbe Bild wie
   der Chip aus derselben Quelle — kein zweiter Abruf, kein zweites Fallback-
   Verhalten. Ohne Logo bleibt die vorhandene Initialenfläche unverändert. */
export function CompanyLogoPreview({ logoUrl, initial, className = "" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [logoUrl]);
  if (!logoUrl || failed) {
    return <div className={`profile-avatar-lg ${className}`.trim()} aria-hidden="true">{initial}</div>;
  }
  return (
    <img
      className={`profile-logo-preview ${className}`.trim()}
      src={logoUrl}
      alt={COMPANY_LOGO_TEXT.altPreview}
      onError={() => setFailed(true)}
    />
  );
}

export function UserChip({ user, onClick, label = "Zu meinem Profil" }) {
  const name = user?.name || user?.company_name || "Kunde";
  const org = user?.company_name && user?.company_name !== user?.name ? user.company_name : null;
  // EINE Initialenquelle für Sidebar, Benutzerchip und Profilhero.
  const initial = accountInitials(user);
  // Das Firmenlogo, falls hinterlegt. Der Hook holt es genau einmal je Fassung
  // (Modulzwischenspeicher) — der Chip hängt an vier Stellen im Baum und wird
  // bei jedem Bereichswechsel neu montiert.
  const logoUrl = useCompanyLogo(user);
  // Name und Firma ellipsieren im Chip bei Platzmangel (der Chip ist das
  // einzige nachgiebige Glied der Kopfzeile) — der title trägt deshalb neben
  // der Aktion auch die VOLLSTÄNDIGE Identität, damit nichts nur abgeschnitten
  // erreichbar ist. Vollständig sichtbar bleibt sie ohnehin in Sidebar-Karte
  // und Profil.
  const fullIdentity = org ? `${name} — ${org}` : name;

  return (
    <button type="button" className="pp-uchip" onClick={onClick} aria-label={label} title={`${label}: ${fullIdentity}`}>
      <CompanyMark initial={initial} logoUrl={logoUrl} />
      <span className="pp-uchip-text">
        <span className="pp-uname">{name}</span>
        {org && <span className="pp-ucomp">{org}</span>}
      </span>
      <Icon n="chevron" s={15} />
    </button>
  );
}
