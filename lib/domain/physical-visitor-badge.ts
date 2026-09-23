/**
 * 實體訪員證版型（永和區／衛福部風格）模擬頭像對照。
 * 正式證件照接入後可改回真實 photo_url。
 */
export type PhysicalBadgeProfile = {
  visitorId: string;
  displayName: string;
  portraitSrc: string;
  yearLabel?: string;
  programTitle?: string;
  inquiryPhone?: string;
};

const DEFAULTS = {
  yearLabel: "115-116年度",
  programTitle: "擴大獨居老人服務訪查",
  inquiryPhone: "(02)2928-2828#118",
};

const BY_VISITOR_ID: Record<string, PhysicalBadgeProfile> = {
  "V-YH-834059": {
    visitorId: "V-YH-834059",
    displayName: "Joe訪員",
    portraitSrc: "/badges/joe-visitor-portrait.jpg",
    ...DEFAULTS,
  },
  "EV-115-YH-CIV-620827": {
    visitorId: "EV-115-YH-CIV-620827",
    displayName: "張教授",
    portraitSrc: "/badges/zhang-visitor-portrait.jpg",
    ...DEFAULTS,
  },
};

const BY_EMAIL: Record<string, PhysicalBadgeProfile> = {
  "joe@elder.org": BY_VISITOR_ID["V-YH-834059"],
  "chatgpt.cjcu@gmail.com": BY_VISITOR_ID["EV-115-YH-CIV-620827"],
};

export function resolvePhysicalBadgeProfile(input: {
  visitorId?: string | null;
  email?: string | null;
  name?: string | null;
}): PhysicalBadgeProfile {
  const visitorId = String(input.visitorId || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  const fromId = visitorId ? BY_VISITOR_ID[visitorId] : undefined;
  if (fromId) return fromId;
  const fromEmail = email ? BY_EMAIL[email] : undefined;
  if (fromEmail) return fromEmail;

  return {
    visitorId: visitorId || "VISITOR",
    displayName: String(input.name || "訪員").trim() || "訪員",
    portraitSrc: "",
    ...DEFAULTS,
  };
}
