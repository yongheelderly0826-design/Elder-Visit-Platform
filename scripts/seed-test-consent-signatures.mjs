#!/usr/bin/env node

import sharp from "sharp";

const gasUrl = process.env.GAS_WEB_APP_URL;
const token = process.env.GAS_API_TOKEN;
const workspaceId = process.env.GAS_WORKSPACE_ID || "WS-YH-115";

if (!gasUrl || !token) {
  throw new Error("請先設定 GAS_WEB_APP_URL 與 GAS_API_TOKEN；本腳本不會自動部署 GAS。");
}

async function gas(action, { params = {}, body } = {}) {
  const url = new URL(gasUrl);
  url.searchParams.set("action", action);
  url.searchParams.set("token", token);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Workspace-Id": workspaceId,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "follow",
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error?.message || `GAS ${action} failed (${response.status})`);
  }
  return payload.data;
}

async function signatureDataUrl(label, pathData) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="520" height="180" viewBox="0 0 520 180">
      <rect width="520" height="180" fill="white"/>
      <path d="${pathData}" fill="none" stroke="#111827" stroke-width="8"
        stroke-linecap="round" stroke-linejoin="round"/>
      <text x="18" y="164" font-family="sans-serif" font-size="18" fill="#64748b">${label} TEST</text>
    </svg>`;
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

const seeds = [
  {
    external_ref: "TEST-CONSENT-SIGNATURE-A-001",
    template_id: "gov_personal_data_consent_115",
    template_version: "115-116 年度",
    title: "縣市政府版本個人資料蒐集聲明暨同意書",
    signer_name: "測試簽署人甲",
    signer_role: "elder",
    visitor_id: "TEST-VISITOR-A",
    case_id: "TEST-CASE-A",
    schedule_id: "TEST-SCHEDULE-A",
    is_test: true,
    field_values: {
      consent_person_name: "測試簽署人甲",
      personal_data_use_consent: "同意",
      health_database_link_consent: "不同意",
    },
    metadata: { source: "seed-test-consent-signatures", excludes_mohw_and_payment: true },
    signature: () =>
      signatureDataUrl(
        "測試簽署人甲",
        "M35 112 C70 42,100 152,132 77 S188 121,220 62 M102 118 C166 101,225 107,285 88 M260 126 C310 55,344 145,382 73 S435 110,486 55",
      ),
  },
  {
    external_ref: "TEST-CONSENT-SIGNATURE-B-001",
    template_id: "gov_civil_affairs_confidentiality_115",
    template_version: "115-116 年度",
    title: "民政訪查人員受訪資訊保密同意書",
    signer_name: "測試簽署人乙",
    signer_role: "visitor",
    visitor_id: "TEST-VISITOR-B",
    case_id: "",
    schedule_id: "",
    is_test: true,
    field_values: {
      signer_name: "測試簽署人乙",
      identity_type: "公所人員",
      national_id: "TEST000002",
      phone: "0900-TEST-002",
      confidentiality_confirmed: "同意",
    },
    metadata: { source: "seed-test-consent-signatures", excludes_mohw_and_payment: true },
    signature: () =>
      signatureDataUrl(
        "測試簽署人乙",
        "M28 72 C67 132,108 35,147 111 M63 95 C124 82,171 86,228 57 M218 122 C256 35,298 143,337 69 M319 113 C370 87,421 91,488 48",
      ),
  },
];

for (const seed of seeds) {
  const existing = await gas("consent.list", {
    params: { external_ref: seed.external_ref, limit: 1 },
  });
  if (Array.isArray(existing) && existing.length > 0) {
    console.log(`skip ${seed.external_ref}: already exists (${existing[0].consent_id})`);
    continue;
  }
  const { signature, ...record } = seed;
  const created = await gas("consent.sign", {
    body: { ...record, signature_data_url: await signature() },
  });
  console.log(`created ${seed.external_ref}: ${created.consent_id}`);
}
