/**
 * GitHub v2 — 用 GH_TOKEN 從樣板建立私有客戶倉庫
 */

import { execSync } from "node:child_process";

const GITHUB_API = "https://api.github.com";

function getToken() {
  return process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
}

function parseTemplateRepo(templateRepo) {
  const [owner, repo] = templateRepo.split("/");
  if (!owner || !repo) {
    throw new Error(`無效的 templateRepo：${templateRepo}（格式：owner/repo）`);
  }
  return { owner, repo };
}

async function githubRequest(method, path, body) {
  const token = getToken();
  if (!token) {
    throw new Error("缺少 GH_TOKEN 或 GITHUB_TOKEN 環境變數");
  }

  const response = await fetch(`${GITHUB_API}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const msg = data?.message || text || response.statusText;
    throw new Error(`GitHub API ${method} ${path} 失敗：${msg}`);
  }

  return data;
}

export function isGithubConfigured() {
  return Boolean(getToken());
}

/**
 * 從樣板倉庫建立私有 repo（需樣板 repo 已啟用 Template repository）
 */
export async function createPrivateRepoFromTemplate(cfg) {
  const gh = cfg.github || {};
  if (!gh.enabled) {
    return { skipped: true, reason: "github.enabled = false" };
  }

  const org = gh.org;
  const repoName = gh.repoName || `elder-visit-${cfg.clientId}`;
  const template = parseTemplateRepo(
    gh.templateRepo || `${org}/Elder-Visit-Platform`,
  );
  const isPrivate = gh.private !== false;

  const existing = await findRepo(org, repoName).catch(() => null);
  if (existing) {
    return {
      skipped: false,
      reused: true,
      fullName: existing.full_name,
      htmlUrl: existing.html_url,
      cloneUrl: existing.clone_url,
      private: existing.private,
    };
  }

  const created = await githubRequest(
    "POST",
    `/repos/${template.owner}/${template.repo}/generate`,
    {
      owner: org,
      name: repoName,
      description:
        gh.description ||
        `${cfg.clientName} — 獨居長者訪查管理平台（${cfg.fiscalYear}）`,
      private: isPrivate,
      include_all_branches: false,
    },
  );

  return {
    skipped: false,
    reused: false,
    fullName: created.full_name,
    htmlUrl: created.html_url,
    cloneUrl: created.clone_url,
    private: isPrivate,
  };
}

async function findRepo(owner, repo) {
  return githubRequest("GET", `/repos/${owner}/${repo}`);
}

/**
 * CLI 後備：gh repo create（當 generate API 不可用時）
 */
export function createPrivateRepoViaCli(cfg) {
  const gh = cfg.github || {};
  const org = gh.org;
  const repoName = gh.repoName || `elder-visit-${cfg.clientId}`;
  const template = gh.templateRepo || `${org}/Elder-Visit-Platform`;
  const fullName = `${org}/${repoName}`;

  const cmd = [
    "gh repo create",
    fullName,
    "--private",
    `--template ${template}`,
    `--description ${JSON.stringify(cfg.clientName)}`,
  ].join(" ");

  execSync(cmd, {
    stdio: "pipe",
    encoding: "utf8",
    env: { ...process.env, GH_TOKEN: getToken() },
  });

  return {
    fullName,
    htmlUrl: `https://github.com/${fullName}`,
    cloneUrl: `https://github.com/${fullName}.git`,
    private: true,
  };
}

export async function setupGithubRepo(cfg, log = console.log) {
  log("Phase GitHub · 建立私有倉庫…");

  try {
    const result = await createPrivateRepoFromTemplate(cfg);
    if (result.skipped) {
      log(`⊘ GitHub 略過：${result.reason}`);
      return null;
    }
    if (result.reused) {
      log(`✓ 已存在倉庫：${result.htmlUrl}`);
    } else {
      log(`✓ 已建立私有倉庫：${result.htmlUrl}`);
    }
    return result;
  } catch (error) {
    if (String(error.message).includes("not a template")) {
      log("⚠ 樣板 API 失敗，嘗試 gh CLI…");
      const result = createPrivateRepoViaCli(cfg);
      log(`✓ 已建立私有倉庫：${result.htmlUrl}`);
      return result;
    }
    throw error;
  }
}
