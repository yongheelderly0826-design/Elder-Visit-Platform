/** Shared campaign helpers for temporary public passbook channel. */

export function getPassbookCampaignCodeFromEnv() {
  return String(process.env.PASSBOOK_CAMPAIGN_CODE ?? "").trim();
}

export function getPassbookDeadlineFromEnv() {
  return String(process.env.PASSBOOK_DEADLINE ?? "2026-12-30").trim() || "2026-12-30";
}

/** Taipei calendar date yyyy-MM-dd */
export function taipeiDateText(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Taipei calendar date is on/before deadline. */
export function isPassbookDeadlineOpenLocally(date = new Date()) {
  return taipeiDateText(date) <= getPassbookDeadlineFromEnv();
}

/**
 * Channel open when deadline not passed.
 * If PASSBOOK_CAMPAIGN_CODE is set, campaignCode must match; if empty/unset, open.
 */
export function isPassbookChannelOpenLocally(campaignCode?: string) {
  if (!isPassbookDeadlineOpenLocally()) return false;
  const expected = getPassbookCampaignCodeFromEnv();
  if (!expected) return true;
  return String(campaignCode || "").trim() === expected;
}
