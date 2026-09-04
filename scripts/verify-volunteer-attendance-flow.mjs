#!/usr/bin/env node
/**
 * E2E（API／GAS）：外勤 QR + 公所刷證
 *   ensure 兩筆測試志工 → identify/clock 簽到退 → list → monthlyExport
 *
 * 用法（請在專案根目錄執行）：
 *   cd /path/to/Elder-Visit-Platform
 *   node scripts/verify-volunteer-attendance-flow.mjs
 *
 * 需 .env.local：GAS_WEB_APP_URL、GAS_API_TOKEN
 * 預設測試號：A123456789（外勤）、B234567894（公所）
 *
 * 教育訓練主文：docs/system-operation-manual.md §9
 * 勾選表：docs/volunteer-attendance-e2e-acceptance.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split("\n")
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, "")];
      }),
  );
}

const env = loadEnv(path.join(root, ".env.local"));
const GAS_URL = env.GAS_WEB_APP_URL;
const GAS_TOKEN = env.GAS_API_TOKEN;

if (!GAS_URL || !GAS_TOKEN) {
  console.error("Missing GAS_WEB_APP_URL / GAS_API_TOKEN in .env.local");
  process.exit(1);
}

const FIELD = {
  id: process.env.ATTENDANCE_TEST_ID || "A123456789",
  name: process.env.ATTENDANCE_TEST_NAME || "測試送餐甲",
  phone: process.env.ATTENDANCE_TEST_PHONE || "0912000001",
  group: process.env.ATTENDANCE_TEST_GROUP || "meal",
  site: process.env.ATTENDANCE_TEST_SITE || "SITE-MEAL",
  channel: "qr",
  source: "field_qr",
};

const OFFICE = {
  id: process.env.ATTENDANCE_OFFICE_ID || "B234567894",
  name: process.env.ATTENDANCE_OFFICE_NAME || "測試內勤乙",
  phone: process.env.ATTENDANCE_OFFICE_PHONE || "0912000002",
  group: process.env.ATTENDANCE_OFFICE_GROUP || "office",
  site: process.env.ATTENDANCE_OFFICE_SITE || "SITE-KIOSK",
  channel: "barcode",
  source: "office_kiosk",
};

async function gas(action, { params = {}, body } = {}) {
  const url = new URL(GAS_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("token", GAS_TOKEN);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  }
  if (body && Object.keys(body).length) {
    url.searchParams.set("body", JSON.stringify(body));
  }

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${GAS_TOKEN}` },
    redirect: "follow",
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${action} non-JSON ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!json.ok) {
    const err = json.error || {};
    throw new Error(`${action} ${err.code || "ERR"}: ${err.message || "failed"}`);
  }
  return json.data;
}

function periodNow() {
  const d = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }),
  );
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function ensureVolunteer(person) {
  const found = await gas("visitors.getByIdNumber", {
    params: { id_number: person.id },
  });
  if (found?.visitor_id) {
    if (!found.volunteer_group || found.volunteer_group !== person.group) {
      await gas("visitors.update", {
        body: {
          visitor_id: found.visitor_id,
          volunteer_group: person.group,
        },
      });
    }
    return { ...found, volunteer_group: person.group };
  }
  const created = await gas("visitors.create", {
    body: {
      name: person.name,
      id_number: person.id,
      phone: person.phone,
      volunteer_group: person.group,
      status: "已核准",
    },
  });
  try {
    await gas("visitors.approve", { body: { visitor_id: created.visitor_id } });
  } catch {
    // already approved
  }
  return created;
}

async function clockCycle(person, label) {
  const identified = await gas("attendance.identify", {
    body: { id_number: person.id },
  });
  if (!identified?.visitor?.visitor_id) {
    throw new Error(`${label}: identify missing visitor`);
  }

  if (identified.open?.attendance_id) {
    await gas("attendance.clock", {
      body: {
        visitor_id: identified.visitor.visitor_id,
        site_id: person.site,
        channel: person.channel,
        source: person.source,
      },
    });
  }

  const checkin = await gas("attendance.clock", {
    body: {
      visitor_id: identified.visitor.visitor_id,
      site_id: person.site,
      channel: person.channel,
      source: person.source,
    },
  });
  if (checkin.action !== "checkin" || !checkin.record?.attendance_id) {
    throw new Error(`${label}: expected checkin, got ${JSON.stringify(checkin)}`);
  }

  await new Promise((r) => setTimeout(r, 1200));

  const checkout = await gas("attendance.clock", {
    body: {
      visitor_id: identified.visitor.visitor_id,
      site_id: person.site,
      channel: person.channel,
      source: person.source,
    },
  });
  if (checkout.action !== "checkout" || !checkout.record?.checkout_at) {
    throw new Error(`${label}: expected checkout, got ${JSON.stringify(checkout)}`);
  }

  return {
    visitor_id: identified.visitor.visitor_id,
    checkin_id: checkin.record.attendance_id,
    checkout_id: checkout.record.attendance_id,
    duration_minutes: checkout.record.duration_minutes,
    site_id: checkin.record.site_id,
    channel: checkin.record.channel || person.channel,
    source: checkin.record.source || person.source,
  };
}

async function main() {
  const report = { ok: false, steps: [] };

  const fieldVolunteer = await ensureVolunteer(FIELD);
  report.steps.push({
    step: "ensure_field_volunteer",
    visitor_id: fieldVolunteer.visitor_id,
    name: fieldVolunteer.name,
    group: fieldVolunteer.volunteer_group || FIELD.group,
  });

  const officeVolunteer = await ensureVolunteer(OFFICE);
  report.steps.push({
    step: "ensure_office_volunteer",
    visitor_id: officeVolunteer.visitor_id,
    name: officeVolunteer.name,
    group: officeVolunteer.volunteer_group || OFFICE.group,
  });

  const fieldCycle = await clockCycle(FIELD, "field_qr");
  report.steps.push({ step: "field_qr_cycle", ...fieldCycle });

  const officeCycle = await clockCycle(OFFICE, "office_kiosk");
  report.steps.push({ step: "office_kiosk_cycle", ...officeCycle });

  const period = periodNow();
  const list = await gas("attendance.list", { params: { period } });
  const fieldHit = (list || []).find(
    (row) => String(row.attendance_id) === String(fieldCycle.checkin_id),
  );
  const officeHit = (list || []).find(
    (row) => String(row.attendance_id) === String(officeCycle.checkin_id),
  );
  if (!fieldHit) throw new Error("list missing field QR record for " + period);
  if (!officeHit) throw new Error("list missing office kiosk record for " + period);
  report.steps.push({
    step: "list",
    period,
    row_count: list.length,
    found_field: true,
    found_office: true,
  });

  // UI 月結下載走 attendance.list + 本機 xlsx；Drive 鏡像為加分項
  try {
    const exported = await gas("attendance.monthlyExport", { body: { period } });
    report.steps.push({
      step: "monthlyExport_drive",
      ok: true,
      period,
      file_name: exported.file_name,
      file_url: exported.file_url,
      row_count: exported.row_count,
    });
  } catch (err) {
    report.steps.push({
      step: "monthlyExport_drive",
      ok: false,
      optional: true,
      error: String(err.message || err),
      note: "UI /api/attendance/export 仍可用 list 本機產 xlsx；請在 GAS 補授權 Drive 後再測鏡像",
    });
  }

  report.ok = true;
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err.message || err) }, null, 2));
  process.exit(1);
});
