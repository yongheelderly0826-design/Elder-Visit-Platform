#!/usr/bin/env node
/**
 * Ops: 清除「有日無名」之 social/civil_worker_date
 * Usage:
 *   node scripts/ops-clear-orphan-worker-dates.mjs              # scan only
 *   node scripts/ops-clear-orphan-worker-dates.mjs --dry-run    # clear dry-run
 *   node scripts/ops-clear-orphan-worker-dates.mjs --smoke      # apply 5 + peek
 *   node scripts/ops-clear-orphan-worker-dates.mjs --apply      # full clear
 *   node scripts/ops-clear-orphan-worker-dates.mjs --verify     # post scan + peek 10
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

const mode = process.argv.includes("--apply")
  ? "apply"
  : process.argv.includes("--smoke")
    ? "smoke"
    : process.argv.includes("--dry-run")
      ? "dry-run"
      : process.argv.includes("--verify")
        ? "verify"
        : "scan";

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
    throw new Error(`${action} non-JSON (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!json.ok) {
    const err = json.error || {};
    throw new Error(`${action} ${err.code || "ERR"}: ${err.message || "failed"}`);
  }
  return json.data;
}

function summarizeScan(data, label) {
  const m = data.matrix || {};
  const c = data.counts || {};
  return {
    label,
    social_date_no_person: c.social_date_no_person,
    civil_date_no_person: c.civil_date_no_person,
    union_anomaly_forms: c.union_anomaly_forms,
    matrix: {
      social_name_and_date: m.social?.name_and_date,
      social_date_no_name: m.social?.date_no_name,
      civil_name_and_date: m.civil?.name_and_date,
      civil_date_no_name: m.civil?.date_no_name,
      either_name_and_date: m.either_name_and_date,
    },
    projected: m.projected_after_clear_orphan_dates,
    clear_plan_count: data.clear_plan_count,
  };
}

async function scan(includePlan = false) {
  return gas("ops.scanMissingWorkerWithTime", {
    body: {
      statuses: ["已提交", "已稽核"],
      sample_limit: 10,
      include_clear_plan: includePlan,
    },
  });
}

async function peek(ids) {
  return gas("ops.peekCareformsByIds", {
    body: { careform_ids: ids },
  });
}

async function clear({ apply, limit }) {
  return gas("ops.clearOrphanWorkerDates", {
    body: {
      statuses: ["已提交", "已稽核"],
      apply,
      limit: limit || 0,
    },
  });
}

async function patchSmoke(patches) {
  return gas("ops.patchCareformAnswers", {
    body: { apply: true, patches },
  });
}

const out = { mode, steps: [] };

if (mode === "scan" || mode === "dry-run" || mode === "smoke" || mode === "apply") {
  console.error("Scanning…");
  const before = await scan(true);
  out.before = summarizeScan(before, "before");
  out.before_sample = before.sample?.mixed_10 || [];
  console.log(JSON.stringify({ step: "before_scan", ...out.before }, null, 2));

  if (mode === "scan") {
    process.exit(0);
  }

  if (mode === "dry-run") {
    console.error("Dry-run clear…");
    const dry = await clear({ apply: false, limit: 0 });
    out.dry_run = {
      social_cleared: dry.social_cleared,
      civil_cleared: dry.civil_cleared,
      forms_touched: dry.forms_touched,
      sample: dry.sample,
    };
    console.log(JSON.stringify({ step: "dry_run", ...out.dry_run }, null, 2));
    process.exit(0);
  }

  if (mode === "smoke") {
    const plan = (before.clear_plan || []).slice(0, 5);
    if (!plan.length) {
      console.error("No orphan dates to clear");
      process.exit(0);
    }
    console.error(`Smoke patchCareformAnswers × ${plan.length}…`);
    const patched = await patchSmoke(plan);
    out.smoke_patch = {
      requested: patched.requested,
      found: patched.found,
      written: patched.written,
      missing: patched.missing,
    };
    const smokeIds = plan.map((p) => p.careform_id);
    console.error("Peek smoke ids…");
    const peeked = await peek(smokeIds);
    out.smoke_peek = (peeked.items || []).map((it) => ({
      careform_id: it.careform_id,
      status: it.status,
      social_worker_name: it.answers?.social_worker_name,
      social_worker_date: it.answers?.social_worker_date,
      civil_worker_name: it.answers?.civil_worker_name,
      civil_worker_date: it.answers?.civil_worker_date,
      patch: plan.find((p) => p.careform_id === it.careform_id)?.answers,
    }));
    console.log(JSON.stringify({ step: "smoke", ...out.smoke_patch, peek: out.smoke_peek }, null, 2));
    process.exit(0);
  }

  if (mode === "apply") {
    // Prefer one-pass helper for remaining bulk (patchCareformAnswers rewrites whole column each call)
    console.error("Full clearOrphanWorkerDates apply…");
    const cleared = await clear({ apply: true, limit: 0 });
    out.apply = {
      social_cleared: cleared.social_cleared,
      civil_cleared: cleared.civil_cleared,
      forms_touched: cleared.forms_touched,
      written: cleared.written,
      skipped_named_guard: cleared.skipped_named_guard,
      sample: cleared.sample,
      cleared_ids_count: (cleared.cleared_ids || []).length,
    };
    console.log(JSON.stringify({ step: "apply", ...out.apply }, null, 2));

    console.error("Post-scan verify…");
    const after = await scan(false);
    out.after = summarizeScan(after, "after");
    console.log(JSON.stringify({ step: "after_scan", ...out.after }, null, 2));

    const verifyIds = (cleared.cleared_ids || []).slice(0, 10);
    if (verifyIds.length) {
      const peeked = await peek(verifyIds);
      out.verify_peek = (peeked.items || []).map((it) => ({
        careform_id: it.careform_id,
        status: it.status,
        social_worker_name: it.answers?.social_worker_name,
        social_worker_date: it.answers?.social_worker_date,
        civil_worker_name: it.answers?.civil_worker_name,
        civil_worker_date: it.answers?.civil_worker_date,
      }));
      console.log(JSON.stringify({ step: "verify_peek", items: out.verify_peek }, null, 2));
    }
  }
}

if (mode === "verify") {
  console.error("Verify scan…");
  const after = await scan(false);
  out.after = summarizeScan(after, "after");
  const sampleIds = (after.sample?.mixed_10 || [])
    .map((s) => s.careform_id)
    .filter(Boolean);
  // If anomalies empty, peek some from name_and_date via sample name_no_date or mixed is empty —
  // peek random from matrix isn't available; just report scan.
  let peekIds = sampleIds;
  if (!peekIds.length) {
    // fall back: no anomalies; peek not required for date_no_name
    peekIds = [];
  }
  console.log(JSON.stringify({ step: "verify", ...out.after }, null, 2));
}
