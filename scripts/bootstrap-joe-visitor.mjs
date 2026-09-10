#!/usr/bin/env node
/**
 * Bootstrap Joe visitor: create GAS visitor, assign one pending case.
 * Usage: node scripts/bootstrap-joe-visitor.mjs
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
  console.error("Missing GAS_WEB_APP_URL / GAS_API_TOKEN");
  process.exit(1);
}

const JOE = {
  email: "joe@elder.org",
  name: "Joe訪員",
  id_number: "E123456783",
  phone: "0912000888",
  volunteer_group: "elder_care",
  status: "已核准",
};

async function gas(action, { params = {}, body } = {}) {
  const url = new URL(GAS_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("token", GAS_TOKEN);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  }
  if (body) url.searchParams.set("body", JSON.stringify(body));
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${GAS_TOKEN}` },
    redirect: "follow",
  });
  const json = await res.json();
  if (!json.ok) {
    const err = json.error || {};
    throw new Error(`${action} ${err.code || "ERR"}: ${err.message || "failed"}`);
  }
  return json.data;
}

async function main() {
  let visitor = await gas("visitors.getByIdNumber", {
    params: { id_number: JOE.id_number },
  }).catch(() => null);

  if (!visitor?.visitor_id) {
    visitor = await gas("visitors.create", {
      body: {
        name: JOE.name,
        id_number: JOE.id_number,
        phone: JOE.phone,
        email: JOE.email,
        volunteer_group: JOE.volunteer_group,
        service_areas: "永和區",
        status: "已核准",
      },
    });
    try {
      await gas("visitors.approve", { body: { visitor_id: visitor.visitor_id } });
    } catch {
      // already approved
    }
  } else if (visitor.status !== "已核准") {
    await gas("visitors.approve", { body: { visitor_id: visitor.visitor_id } });
  }

  const cases = await gas("cases.list", { params: { district: "永和區" } });
  const assignments = await gas("assignments.list", { params: { active_only: "true" } });
  const activeCaseIds = new Set(
    (assignments || []).map((row) => String(row.case_id || "")).filter(Boolean),
  );
  const pending = (cases || []).filter((row) => {
    const caseId = String(row.case_id || "");
    if (activeCaseIds.has(caseId)) return false;
    const status = String(row.visit_status || "");
    return status === "待訪" || status === "待派案" || status === "" || status === "pending";
  });

  let assignment = (assignments || []).find(
    (row) => String(row.visitor_id) === String(visitor.visitor_id),
  );

  if (!assignment) {
    if (!pending.length) throw new Error("沒有可派案的待訪個案");
    const target = pending[0];
    assignment = await gas("assignments.dispatch", {
      body: {
        case_id: target.case_id,
        visitor_id: visitor.visitor_id,
        notes: "Joe訪員測試派案",
        auto_confirm: true,
      },
    });
  }

  const report = {
    ok: true,
    email: JOE.email,
    password: "123456",
    visitor_id: visitor.visitor_id,
    name: visitor.name || JOE.name,
    id_number: JOE.id_number,
    assignment_id: assignment.assignment_id,
    case_id: assignment.case_id,
    case_name: (cases || []).find((c) => String(c.case_id) === String(assignment.case_id))?.name,
  };

  const linkPath = path.join(root, "lib/domain/demo-visitor-links.json");
  fs.writeFileSync(
    linkPath,
    JSON.stringify(
      {
        [JOE.email]: {
          visitorId: report.visitor_id,
          name: report.name,
          idNumber: JOE.id_number,
          assignmentId: report.assignment_id,
          caseId: report.case_id,
        },
      },
      null,
      2,
    ) + "\n",
  );

  console.log(JSON.stringify(report, null, 2));
  console.log("wrote", linkPath);
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err.message || err) }, null, 2));
  process.exit(1);
});
