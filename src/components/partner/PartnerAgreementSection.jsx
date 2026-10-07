import React from "react";
import { SettingsSection } from "../dashboard/ProfileCardHead";
import { ErrorState, LoadingState } from "../ui/StateView";
import { PartnerRows } from "./PartnerRows";
import { agreementDocumentUrl, getPartnerAgreement } from "../../api/partnerApi";
import { usePartnerData } from "../../hooks/usePartnerData";
import { EXTERNAL_LINK_REL, EXTERNAL_LINK_TARGET } from "../../utils/externalLink.mjs";
import {
  AGREEMENT_TEXTS,
  normalizePartnerAgreement,
  partnerAgreementDocumentPath,
  partnerAgreementRows,
} from "../../utils/salesPartnerAgreement.mjs";

/* ── Partnerportal · Konto · Vertrag ─────────────────────────────────────────
   Die Vertriebspartnervereinbarung, der der Partner zugestimmt hat: Fassung,
   Zeitpunkt der Zustimmung und das registrierte Dokument dieser Fassung —
   genau der Dokumentpfad des Servers, geöffnet in einem neuen Tab. Fehlt das
   Dokument, sagt die Fläche das, statt einen Ort zu raten. */
export function PartnerAgreementSection() {
  const { loading, error, data, reload } = usePartnerData(
    (opts) => getPartnerAgreement(opts), normalizePartnerAgreement, [], AGREEMENT_TEXTS.accountLoadError,
  );
  const dokument = data ? agreementDocumentUrl(partnerAgreementDocumentPath(data)) : null;

  let inhalt;
  if (loading && !data) {
    inhalt = <LoadingState text="Vertragsangaben werden geladen …" />;
  } else if (error || !data) {
    inhalt = (
      <ErrorState
        title={error || AGREEMENT_TEXTS.accountLoadError}
        action={<button type="button" className="btn btn-primary btn-sm" onClick={reload}>Erneut versuchen</button>}
      />
    );
  } else {
    inhalt = (
      <>
        <PartnerRows items={partnerAgreementRows(data)} idPrefix="spp-agreement" />
        {dokument ? (
          <div className="spp-section-actions">
            <a className="btn btn-outline btn-sm" id="spp-agreement-document" href={dokument}
              target={EXTERNAL_LINK_TARGET} rel={EXTERNAL_LINK_REL}>
              {AGREEMENT_TEXTS.open}
              <span className="sr-only"> {AGREEMENT_TEXTS.opensInNewTab}</span>
            </a>
          </div>
        ) : (
          <p className="spp-hint" id="spp-agreement-no-document">{AGREEMENT_TEXTS.noDocument}</p>
        )}
      </>
    );
  }

  return (
    <SettingsSection title="Vertrag" subtitle="Ihre Vertriebspartnervereinbarung">
      <div className="profile-section-body" id="spp-agreement">{inhalt}</div>
    </SettingsSection>
  );
}

export default PartnerAgreementSection;
