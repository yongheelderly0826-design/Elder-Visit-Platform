#!/usr/bin/env node
/**
 * Ops: 紙本 21–30 社政人員改為黃淑貞
 * Usage:
 *   node scripts/ops-patch-social-huang-21-30.mjs           # lookup only
 *   node scripts/ops-patch-social-huang-21-30.mjs --dry-run # plan patches
 *   node scripts/ops-patch-social-huang-21-30.mjs --apply   # write
 *   node scripts/ops-patch-social-huang-21-30.mjs --peek    # verify after
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

const PAPER = [
  { no: 21, name: "李榮彥", id: "F102897169", note: "禾/朱" },
  { no: 22, name: "陳麗淑", id: "F200669918", note: "禾/朱" },
  { no: 23, name: "鄭錦樹", id: "A103994466", note: "禾/朱" },
  { no: 24, name: "李紅秀", id: "C200097044", note: "禾/朱" },
  { no: 25, name: "應小梅", id: "F200338632", note: "禾/朱" },
  { no: 26, name: "林祝英", id: "R200181249", note: "黃淑貞" },
  { no: 27, name: "陳安琪", id: "A200655713", note: "禾" },
  { no: 28, name: "黃忠雄", id: "B101033121", note: "黃淑貞" },
  { no: 29, name: "蔡雅琪", id: "C200470810", note: "朱" },
  { no: 30, name: "王謙仁", id: "F104262539", note: "禾" },
];

const TARGET_NAME = "黃淑貞";
const SOCIAL_KEYS = [
  "social_worker_role",
  "social_worker_role_other",
  "social_worker_name",
  "social_worker_national_id",
  "social_worker_phone",
  "social_worker_date",
];

async function gas(action, { params = {}, body } = {}) {
  const url = new URL(GAS_URL);
  url.searchParams.set("action", action);
  url.searchParams.set("token", GAS_TOKEN);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  }
  if (body) {
    const serialized = JSON.stringify(body);
    if (serialized.length < 3500) url.searchParams.set("body", serialized);
  }
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${GAS_TOKEN}`,
      "X-Workspace-Id": env.GAS_WORKSPACE_ID || "WS-YH-115",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "follow",
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${action} non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!json.ok) {
    const err = json.error || {};
    throw new Error(`${action} ${err.code || "ERR"}: ${err.message || "failed"}`);
  }
  return json.data;
}

function normId(v) {
  return String(v || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function pickWorker(answers = {}) {
  return {
    social_worker_role: answers.social_worker_role || "",
    social_worker_role_other: answers.social_worker_role_other || "",
    social_worker_name: answers.social_worker_name || "",
    social_worker_national_id: answers.social_worker_national_id || "",
    social_worker_phone: answers.social_worker_phone || "",
    social_worker_date: answers.social_worker_date || "",
    civil_worker_role: answers.civil_worker_role || "",
    civil_worker_name: answers.civil_worker_name || "",
    civil_worker_national_id: answers.civil_worker_national_id || "",
    civil_worker_phone: answers.civil_worker_phone || "",
    civil_worker_date: answers.civil_worker_date || "",
  };
}

async function findHuang() {
  const visitors = (await gas("visitors.list")) || [];
  const hits = visitors.filter((v) => String(v.name || "").trim() === TARGET_NAME);
  let regs = [];
  try {
    regs = (await gas("registrations.list", { params: { status: "approved" } })) || [];
  } catch {
    try {
      regs = (await gas("registrations.list")) || [];
    } catch {
      regs = [];
    }
  }
  const regHits = (Array.isArray(regs) ? regs : regs.items || []).filter(
    (r) => String(r.name || r.full_name || "").trim() === TARGET_NAME,
  );
  return { visitors: hits, registrations: regHits };
}

async function findCasesAndCareforms() {
  const cases = await gas("cases.list", {
    params: { district: "永和區", village: "永樂里" },
  });
  const byId = new Map();
  for (const row of cases || []) {
    byId.set(normId(row.id_number), row);
  }

  // Also try full district if village filter missed
  const missing = PAPER.filter((p) => !byId.has(normId(p.id)));
  if (missing.length) {
    const all = await gas("cases.list", { params: { district: "永和區" } });
    for (const row of all || []) {
      const id = normId(row.id_number);
      if (PAPER.some((p) => normId(p.id) === id)) byId.set(id, row);
    }
  }

  // Fallback by name+village
  for (const p of PAPER) {
    if (byId.has(normId(p.id))) continue;
    const nameHits = (cases || []).filter((r) => String(r.name || "").trim() === p.name);
    if (nameHits.length === 1) byId.set(normId(p.id) + ":name", nameHits[0]);
  }

  const assignments = (await gas("assignments.list")) || [];
  const asgByCase = new Map();
  for (const a of assignments) {
    const cid = String(a.case_id || "").trim();
    if (!cid) continue;
    if (!asgByCase.has(cid)) asgByCase.set(cid, []);
    asgByCase.get(cid).push(a);
  }

  const rows = [];
  for (const p of PAPER) {
    const caseRow = byId.get(normId(p.id)) || null;
    if (!caseRow) {
      rows.push({ paper: p, caseRow: null, careforms: [], assignments: [] });
      continue;
    }
    const caseId = String(caseRow.case_id || "").trim();
    const asgs = asgByCase.get(caseId) || [];
    // also match encoded_id
    const encoded = String(caseRow.encoded_id || "").trim();
    for (const a of assignments) {
      if (encoded && String(a.encoded_id || "").trim() === encoded) {
        if (!asgs.find((x) => x.assignment_id === a.assignment_id)) asgs.push(a);
      }
    }

    const careforms = [];
    for (const a of asgs) {
      try {
        const cf = await gas("careform.get", {
          params: { assignment_id: String(a.assignment_id) },
        });
        if (cf) careforms.push({ assignment: a, careform: cf });
      } catch (e) {
        careforms.push({ assignment: a, careform: null, error: String(e.message || e) });
      }
    }

    rows.push({ paper: p, caseRow, assignments: asgs, careforms });
  }
  return rows;
}

function chooseTargetVisitor(huang) {
  const preferred = [...huang.visitors].sort((a, b) => {
    const ag = String(a.volunteer_group || "");
    const bg = String(b.volunteer_group || "");
    const aSoc = ag.includes("social") || String(a.visitor_id || "").includes("-SOC-") ? 0 : 1;
    const bSoc = bg.includes("social") || String(b.visitor_id || "").includes("-SOC-") ? 0 : 1;
    return aSoc - bSoc;
  });
  return preferred[0] || null;
}

function normalizePhone(v) {
  let d = String(v ?? "").replace(/\D/g, "");
  if (d.length === 9 && d.startsWith("9")) d = "0" + d;
  if (d.length === 10 && d.startsWith("09")) return d;
  return String(v ?? "").trim();
}

function buildSocialPatch(visitor, existingAnswers) {
  const phone =
    normalizePhone(visitor.phone || visitor.mobile || visitor.primary_phone) ||
    normalizePhone(existingAnswers.social_worker_phone);
  const nid = normId(visitor.id_number);
  const patch = {
    social_worker_name: TARGET_NAME,
  };
  if (nid) patch.social_worker_national_id = nid;
  if (phone) patch.social_worker_phone = phone;
  // Keep existing role/date if present; set role if empty
  const role = String(existingAnswers.social_worker_role || "").trim();
  if (!role) patch.social_worker_role = "志工";
  const date = String(existingAnswers.social_worker_date || "").trim();
  if (!date && existingAnswers.visit_date) patch.social_worker_date = existingAnswers.visit_date;
  return patch;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const doDry = args.has("--dry-run");
  const doApply = args.has("--apply");
  const doPeek = args.has("--peek");

  console.log("=== 1) 查找黃淑貞 ===");
  const huang = await findHuang();
  console.log(
    JSON.stringify(
      {
        visitors: huang.visitors.map((v) => ({
          visitor_id: v.visitor_id,
          name: v.name,
          phone: v.phone || v.mobile || v.primary_phone || "",
          id_number: v.id_number,
          volunteer_group: v.volunteer_group,
          status: v.status,
          job_title: v.job_title,
          department: v.department,
        })),
        registrations: huang.registrations.map((r) => ({
          registration_id: r.registration_id || r.id,
          name: r.name || r.full_name,
          phone: r.phone || r.mobile,
          id_number: r.id_number,
          workerGroup: r.workerGroup || r.worker_group || r.volunteer_group,
          status: r.status,
        })),
      },
      null,
      2,
    ),
  );

  const targetVisitor = chooseTargetVisitor(huang);
  if (!targetVisitor) {
    console.error("找不到黃淑貞 visitor，中止寫入（仍繼續列出個案）");
  } else {
    console.log("選用黃淑貞:", {
      visitor_id: targetVisitor.visitor_id,
      phone: targetVisitor.phone || targetVisitor.mobile || targetVisitor.primary_phone,
      id_number: targetVisitor.id_number,
      volunteer_group: targetVisitor.volunteer_group,
    });
  }

  console.log("\n=== 2) 查找紙本 21–30 建檔 ===");
  const rows = await findCasesAndCareforms();

  const summary = rows.map((row) => {
    const cfList = row.careforms
      .filter((x) => x.careform)
      .map((x) => {
        const cf = x.careform;
        const answers = cf.answers || cf.answers_json || {};
        const parsed = typeof answers === "string" ? JSON.parse(answers || "{}") : answers;
        const workers = pickWorker(parsed);
        return {
          careform_id: cf.careform_id,
          assignment_id: cf.assignment_id || x.assignment?.assignment_id,
          status: cf.status,
          visit_result: cf.visit_result || parsed.visit_status || "",
          visitor_id: cf.visitor_id || x.assignment?.visitor_id,
          audited: String(cf.status || "") === "已稽核",
          workers,
          visit_status: parsed.visit_status || "",
          name: parsed.name || row.caseRow?.name,
          id_number: parsed.id_number || row.caseRow?.id_number,
        };
      });
    return {
      no: row.paper.no,
      paper_name: row.paper.name,
      paper_id: row.paper.id,
      paper_note: row.paper.note,
      filed: Boolean(row.caseRow),
      case_id: row.caseRow?.case_id || "",
      encoded_id: row.caseRow?.encoded_id || "",
      case_name: row.caseRow?.name || "",
      case_visit_status: row.caseRow?.visit_status || "",
      address: row.caseRow?.address || "",
      assignment_count: row.assignments.length,
      careforms: cfList,
    };
  });

  console.log(JSON.stringify(summary, null, 2));

  const filed = summary.filter((s) => s.filed);
  const unfiled = summary.filter((s) => !s.filed);
  console.log(`\n建檔 ${filed.length} / 未建檔 ${unfiled.length}`);
  if (unfiled.length) {
    console.log(
      "未建檔:",
      unfiled.map((u) => `${u.no} ${u.paper_name} ${u.paper_id}`).join(", "),
    );
  }

  if (!doDry && !doApply && !doPeek) return;

  const patches = [];
  const plan = [];
  for (const s of summary) {
    if (!s.filed || !s.careforms.length) {
      plan.push({
        no: s.no,
        name: s.paper_name,
        status: s.filed ? "有案無關懷表" : "未建檔",
      });
      continue;
    }
    // Prefer latest / submitted careform
    const ordered = [...s.careforms].sort((a, b) => {
      const rank = (c) =>
        c.audited ? 3 : String(c.status).includes("已提交") || String(c.status).includes("submitted")
          ? 2
          : 1;
      return rank(b) - rank(a);
    });
    for (const cf of ordered) {
      const before = cf.workers;
      if (!targetVisitor) {
        plan.push({ no: s.no, careform_id: cf.careform_id, status: "無黃淑貞身分" });
        continue;
      }
      // Need full answers for role/date defaults — re-fetch if workers incomplete
      let answers = {};
      try {
        const full = await gas("careform.get", {
          params: { assignment_id: String(cf.assignment_id) },
        });
        answers = full?.answers || {};
        if (typeof answers === "string") answers = JSON.parse(answers || "{}");
      } catch {
        answers = {};
      }
      const patchAnswers = buildSocialPatch(targetVisitor, { ...answers, ...before });
      const after = { ...before, ...patchAnswers };
      const changed = SOCIAL_KEYS.some(
        (k) => String(before[k] || "") !== String(after[k] || ""),
      );
      plan.push({
        no: s.no,
        name: s.paper_name,
        careform_id: cf.careform_id,
        audited: cf.audited,
        status: cf.status,
        paper_note: s.paper_note,
        before_social: before.social_worker_name || "(空)",
        after_social: after.social_worker_name,
        before_social_phone: before.social_worker_phone || "",
        after_social_phone: after.social_worker_phone || "",
        before_social_nid: before.social_worker_national_id || "",
        after_social_nid: after.social_worker_national_id || "",
        civil_unchanged: before.civil_worker_name || "(空)",
        changed,
        patchAnswers,
      });
      if (changed) {
        patches.push({ careform_id: cf.careform_id, answers: patchAnswers });
      }
    }
  }

  console.log("\n=== 3) before→after 計畫 ===");
  console.log(JSON.stringify(plan, null, 2));
  console.log(`patches: ${patches.length}`);

  if (doPeek && !doDry && !doApply) {
    const ids = summary.flatMap((s) => s.careforms.map((c) => c.careform_id)).filter(Boolean);
    if (ids.length) {
      const peeked = await gas("ops.peekCareformsByIds", {
        body: { careform_ids: ids },
      });
      console.log("\n=== peek ===");
      console.log(JSON.stringify(peeked, null, 2));
    }
    return;
  }

  if (doDry || doApply) {
    if (!patches.length) {
      console.log("無需變更（已是黃淑貞或無可寫入關懷表）");
      return;
    }
    const result = await gas("ops.patchCareformAnswers", {
      body: { apply: doApply, patches },
    });
    console.log(`\n=== ${doApply ? "APPLY" : "DRY-RUN"} 結果 ===`);
    console.log(JSON.stringify(result, null, 2));

    if (doApply) {
      const ids = patches.map((p) => p.careform_id);
      const peeked = await gas("ops.peekCareformsByIds", {
        body: { careform_ids: ids },
      });
      console.log("\n=== peek 驗證 ===");
      console.log(
        JSON.stringify(
          (peeked.items || []).map((it) => ({
            careform_id: it.careform_id,
            name: it.answers?.name,
            social_worker_name: it.answers?.social_worker_name,
            social_worker_role: it.answers?.social_worker_role,
            civil_worker_name: it.answers?.civil_worker_name,
            status: it.status,
            visit_result: it.visit_result,
          })),
          null,
          2,
        ),
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
