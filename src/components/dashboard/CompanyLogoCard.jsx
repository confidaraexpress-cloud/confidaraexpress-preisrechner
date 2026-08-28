import React, { useState, useRef } from "react";
import { Icon } from "../ui/Icon";
import { FormAlert } from "../ui/FormAlert";
import { useAuth } from "../../context/AuthContext";
import { normalizeThrownError } from "../../utils/apiError.mjs";
import { accountInitials } from "../../utils/accountIdentity.mjs";
import { CompanyLogoPreview } from "../ui/UserChip";
import { useCompanyLogo } from "../../hooks/useCompanyLogo";
import { uploadCompanyLogo, deleteCompanyLogo } from "../../api/companyLogoApi";
import {
  COMPANY_LOGO_TEXT, LOGO_ACCEPT, companyLogoMeta,
  formatLogoSize, formatLogoDimensions, preCheckLogoFile, logoErrorMessage,
} from "../../utils/companyLogoView.mjs";
import { cardHead } from "./ProfileCardHead";

// Firmenlogo-Karte der Kontoseite. Der Upload läuft über den eigenen,
// auth-geschützten Endpunkt (Multipart) — NICHT über PATCH /kunde/profil: der
// JSON-Body ist serverseitig auf 100 KB gedeckelt, ein Bild passt dort nicht
// hinein.
//
// Die Clientprüfung davor ist reiner Komfort (sofortige Rückmeldung statt
// Rundreise) und ausdrücklich KEIN Ersatz für die Serverprüfung: der Server
// prüft MIME-Typ, Dateisignatur, Größe und Bildmaße erneut und ist allein
// maßgeblich.
export function CompanyLogoCard({ user }) {
  const { updateUser } = useAuth();

  // Das Bild selbst kommt aus derselben Quelle wie im Benutzerchip
  // (ein Abruf je Fassung, Modulzwischenspeicher) — hier wird nichts zweites
  // geladen. Der Dateidialog läuft über ein verstecktes <input type="file">, das
  // ein regulärer .btn auslöst: ein nativer Dateiknopf lässt sich nicht auf die
  // Foundation-Primitives bringen.
  const logoMeta = companyLogoMeta(user);
  const logoUrl = useCompanyLogo(user);
  const logoInputRef = useRef(null);
  const [logoBusy, setLogoBusy] = useState("");     // "" | "upload" | "remove"
  const [logoError, setLogoError] = useState("");
  const [logoSaved, setLogoSaved] = useState("");

  const onLogoSelected = async (e) => {
    const file = e.target.files && e.target.files[0];
    // Den Dateidialog sofort zurücksetzen: sonst löst dieselbe Datei beim
    // zweiten Wählen kein change-Ereignis aus.
    e.target.value = "";
    if (!file) return;

    const complaint = preCheckLogoFile(file);
    if (complaint) { setLogoError(complaint); setLogoSaved(""); return; }

    setLogoBusy("upload"); setLogoError(""); setLogoSaved("");
    try {
      const r = await uploadCompanyLogo(file);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setLogoError(logoErrorMessage(d)); setLogoBusy(""); return; }
      // Der Server liefert die neuen Metadaten inklusive Version zurück. Sie in
      // das Konto zu spiegeln, ist zugleich der Cache-Busting-Mechanismus: die
      // geänderte Version lässt den Bildzwischenspeicher nicht mehr greifen, und
      // Chip wie Vorschau holen dieselbe neue Fassung.
      updateUser({ companyLogo: d.companyLogo ?? null });
      setLogoSaved(COMPANY_LOGO_TEXT.savedUpload);
    } catch (err) {
      setLogoError(normalizeThrownError(err).message);
    }
    setLogoBusy("");
  };

  const onLogoRemove = async () => {
    if (logoBusy) return;
    setLogoBusy("remove"); setLogoError(""); setLogoSaved("");
    try {
      const r = await deleteCompanyLogo();
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setLogoError(logoErrorMessage(d, COMPANY_LOGO_TEXT.removeError)); setLogoBusy(""); return; }
      updateUser({ companyLogo: null });
      setLogoSaved(COMPANY_LOGO_TEXT.savedRemove);
    } catch (err) {
      setLogoError(normalizeThrownError(err).message);
    }
    setLogoBusy("");
  };

  const size = formatLogoSize(logoMeta?.sizeBytes);
  const dims = formatLogoDimensions(logoMeta);
  const facts = [size, dims].filter(Boolean).join(" · ");
  return (
    <div className="table-card profile-card">
      {cardHead("image", COMPANY_LOGO_TEXT.title, COMPANY_LOGO_TEXT.subtitle, null)}
      <div className="profile-section-body">
        <div className="profile-logo-row">
          <CompanyLogoPreview logoUrl={logoUrl} initial={accountInitials(user)} />
          <div className="profile-logo-copy">
            <p className="profile-logo-desc">{COMPANY_LOGO_TEXT.description}</p>
            {logoMeta
              ? facts && <p className="profile-logo-meta">{facts}</p>
              : <p className="profile-logo-meta">{COMPANY_LOGO_TEXT.empty}</p>}
          </div>
        </div>

        {/* Das native Dateifeld bleibt unsichtbar, ist aber ein echtes
            Formularelement — der sichtbare Knopf löst es aus. Keine
            Drag-and-drop-Fläche, kein Zuschneide-Editor: das war nicht
            Teil der Aufgabe. */}
        <input
          ref={logoInputRef}
          type="file"
          accept={LOGO_ACCEPT}
          className="sr-only"
          onChange={onLogoSelected}
          aria-hidden="true"
          tabIndex={-1}
        />

        <div className="profile-logo-actions">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => logoInputRef.current?.click()}
            disabled={logoBusy !== ""}
          >
            <Icon n="upload" s={14} />
            {logoBusy === "upload" ? COMPANY_LOGO_TEXT.uploading : (logoMeta ? COMPANY_LOGO_TEXT.replace : COMPANY_LOGO_TEXT.choose)}
          </button>
          {logoMeta && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onLogoRemove}
              disabled={logoBusy !== ""}
            >
              {logoBusy === "remove" ? COMPANY_LOGO_TEXT.removing : COMPANY_LOGO_TEXT.remove}
            </button>
          )}
        </div>

        <p className="field-hint profile-logo-req">
          {COMPANY_LOGO_TEXT.requirements} {COMPANY_LOGO_TEXT.svgHint}
        </p>

        {logoError && <FormAlert tone="error" message={logoError} className="mt-16" />}
        {logoSaved && !logoError && (
          <p className="profile-saved" role="status">
            <Icon n="check" s={14} /> {logoSaved}
          </p>
        )}
      </div>
    </div>
  );
}
