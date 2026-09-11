export const consentDocumentIds = [
  "gov_personal_data_consent_115",
  "gov_social_worker_confidentiality_115",
  "gov_civil_affairs_confidentiality_115",
] as const;

export type ConsentDocumentId = (typeof consentDocumentIds)[number];

type ConsentDocumentBase = {
  id: ConsentDocumentId;
  shortName: string;
  title: string;
  introduction?: string;
  clauses: string[];
};

export type PersonalDataConsentDocument = ConsentDocumentBase & {
  kind: "personal_data";
  healthSectionTitle: string;
  healthStatement: string;
};

export type ConfidentialityConsentDocument = ConsentDocumentBase & {
  kind: "confidentiality";
  identityOptions: string[];
};

export type ConsentDocument =
  | PersonalDataConsentDocument
  | ConfidentialityConsentDocument;

export const consentDocuments: Record<ConsentDocumentId, ConsentDocument> = {
  gov_personal_data_consent_115: {
    id: "gov_personal_data_consent_115",
    kind: "personal_data",
    shortName: "個資蒐集同意書",
    title: "壹、個人資料蒐集聲明暨同意書",
    clauses: [
      "依據衛生福利部擴大獨居老人服務實施計畫辦理。",
      "取得您的個人資料，目的在於瞭解獨居老人的生活情形，並作為推動獨居老人相關政策之參考。",
      "本次蒐集、處理及利用您的個人資料，內容包括姓名、出生年月日、居住狀況、婚姻、家庭、聯絡方式、身體狀況、社會活動等，皆依個人資料保護法及相關法規辦理。",
      "為瞭解縣市獨居老人的生活情形，您同意配合衛生福利部擴大推動獨居老人服務相關政策，處理及使用您的個人資料。",
      "本聲明暨同意書如有未盡事宜，依個人資料保護法或其他相關法律之規定辦理。",
      "您瞭解此同意書符合個人資料保護法及相關法規之要求，具有書面同意衛生福利部及＿＿（縣）市政府蒐集、並依政策執行期間所需處理及使用您個人資料之效果。",
    ],
    healthSectionTitle: "貳、請勾健康資料串聯的意願",
    healthStatement:
      "將這次生活關懷表訪查結果，供國家型健康資料庫（如健保資料、長照資料等）分析使用，僅作為115-116年度獨居老人政策服務成效評估用途。",
  },
  gov_social_worker_confidentiality_115: {
    id: "gov_social_worker_confidentiality_115",
    kind: "confidentiality",
    shortName: "社政保密同意書",
    title: "社政訪查人員受訪資訊保密同意書",
    introduction:
      "立同意書人同意於參與○○縣／市辦理「擴大獨居老人服務計畫」期間，遵守以下事項：",
    clauses: [
      "為維護公務機密及相關業務個人資料保護，對於參與獨居老人訪查作業期間接觸相關之個人秘密、隱私及持有之相關資料，負保密之責，不得無故洩露或公開。",
      "遵守「個人資料保護法」法令及各專業服務倫理規定，不私自蒐集任何資訊，不將上開資訊洩漏、複製、轉讓、再使用或交付第三人。",
      "如因違反相關法規所生之損害，本人願負法律上責任，不再擔任獨居老人訪查員後亦同。",
    ],
    identityOptions: ["社會局/處", "社工", "志工", "其他"],
  },
  gov_civil_affairs_confidentiality_115: {
    id: "gov_civil_affairs_confidentiality_115",
    kind: "confidentiality",
    shortName: "民政保密同意書",
    title: "民政訪查人員受訪資訊保密同意書",
    introduction:
      "立同意書人同意於參與○○縣／市辦理「擴大獨居老人服務計畫」期間，遵守以下事項：",
    clauses: [
      "為維護公務機密及相關業務個人資料保護，對於參與獨居老人訪查作業期間接觸相關之個人秘密、隱私及持有之相關資料，負保密之責，不得無故洩露或公開。",
      "遵守「個人資料保護法」法令及各專業服務倫理規定，不私自蒐集任何資訊，不將上開資訊洩漏、複製、轉讓、再使用或交付第三人。",
      "如因違反相關法規所生之損害，本人願負法律上責任，不再擔任獨居老人訪查員後亦同。",
    ],
    identityOptions: ["公所人員", "村里長", "村里幹事"],
  },
};

export function getConsentDocument(id: ConsentDocumentId) {
  return consentDocuments[id];
}

export function formatRocDate(value: string | Date) {
  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(value));
  const number = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: number("year") - 1911,
    month: number("month"),
    day: number("day"),
  };
}
