import React from "react";
import { PRELIVE_TEXTS } from "../../utils/salesPartnerPrelive.mjs";

/* ── Kennzeichnung eines Testkontos (Pre-Live-Testmodus) ─────────────────────
   Erscheint ausschließlich bei der unveränderlichen Testkennzeichnung des
   Servers (`preliveTest: true`) — in der Partnerliste und im Partnerdetail.
   Warnrolle mit Text: die Aussage trägt der Wortlaut, nicht die Farbe. */
export function PreliveTestBadge({ id }) {
  return <span className="badge badge--warning adm-sp-test-badge" id={id}>{PRELIVE_TEXTS.testBadge}</span>;
}

export default PreliveTestBadge;
