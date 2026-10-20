"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArchiveRestore,
  Building2,
  CheckCircle2,
  Edit3,
  GitCompareArrows,
  Handshake,
  ImageIcon,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useCan } from "@/components/auth/permission-provider";
import { SponsorLogoMark } from "@/components/sponsor/sponsor-logo";
import { Button } from "@/components/ui/button";
import { getBlueprintBindingRuleNotes } from "@/lib/domain/blueprint-governance";
import { getCurrentWorkspace } from "@/lib/domain/mock-data";
import { sponsorPartners, sponsorPlacements, type SponsorPartner } from "@/lib/domain/sponsors";
import {
  defaultWorkspaceSettings,
  getSoftDeletePreview,
  moduleOptions,
  toggleModule,
} from "@/lib/domain/workspace-settings";
import type { BlueprintMigrationPreview, WorkspaceSettings } from "@/lib/domain/types";
import { VisitorLoginCredentialsPanel } from "@/components/workspace/visitor-login-credentials-panel";

const storageKey = "elder-visit-platform:workspace-settings";
const sponsorStorageKey = "elder-visit-platform:sponsor-partners";

const exposureLevelLabel = {
  subtle: "低調露出",
  standard: "標準聯名",
  featured: "重點露出",
};

const placementSettingMap = {
  admin_header: "adminHeader",
  dashboard_impact: "dashboardImpact",
  public_report_cover: "publicReportCover",
  visitor_complete: "visitorComplete",
} as const;

type SpaceRuleTab = "blueprint" | "sponsors" | "responsibility" | "recovery" | "credentials";

const spaceRuleTabs: Array<{ key: SpaceRuleTab; label: string }> = [
  { key: "blueprint", label: "藍圖與模組" },
  { key: "sponsors", label: "贊助聯名" },
  { key: "responsibility", label: "責任歸屬" },
  { key: "recovery", label: "停用復原" },
  { key: "credentials", label: "訪員帳密寄送" },
];

export function SettingsPanel() {
  const canUpdateWorkspace = useCan("workspace.update");
  const canSoftDeleteWorkspace = useCan("workspace.soft_delete");
  const canCreateSponsor = useCan("sponsors.create");
  const canUpdateSponsor = useCan("sponsors.update");
  const canDeleteSponsor = useCan("sponsors.delete");
  const canManageSponsors = useCan("sponsors.manage");
  const workspace = getCurrentWorkspace();
  const [settings, setSettings] = useState<WorkspaceSettings>(defaultWorkspaceSettings);
  const [managedSponsors, setManagedSponsors] = useState<SponsorPartner[]>(sponsorPartners);
  const [sponsorDraft, setSponsorDraft] = useState<SponsorPartner>(createEmptySponsor());
  const [editingSponsorId, setEditingSponsorId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [softDeleteMessage, setSoftDeleteMessage] = useState<string | null>(null);
  const [migrationPreview, setMigrationPreview] = useState<BlueprintMigrationPreview | null>(null);
  const [logoAdjustMessage, setLogoAdjustMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SpaceRuleTab>("blueprint");
  const canEditSponsorDraft = editingSponsorId ? canUpdateSponsor : canCreateSponsor;
  const bindingRuleNotes = useMemo(() => getBlueprintBindingRuleNotes(), []);
  const softDeletePreview = useMemo(
    () => getSoftDeletePreview(settings.restoreDeadlineDays),
    [settings.restoreDeadlineDays],
  );

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    const storedSponsors = window.localStorage.getItem(sponsorStorageKey);
    if (stored) {
      const parsedSettings = JSON.parse(stored) as Partial<WorkspaceSettings>;
      setSettings({
        ...defaultWorkspaceSettings,
        ...parsedSettings,
        sponsorSettings: {
          ...defaultWorkspaceSettings.sponsorSettings,
          ...parsedSettings.sponsorSettings,
          placements: {
            ...defaultWorkspaceSettings.sponsorSettings.placements,
            ...parsedSettings.sponsorSettings?.placements,
          },
        },
      });
    }
    if (storedSponsors) {
      setManagedSponsors((JSON.parse(storedSponsors) as SponsorPartner[]).map(normalizeSponsor));
    }
  }, []);

  async function saveSettings() {
    window.localStorage.setItem(storageKey, JSON.stringify(settings));
    window.localStorage.setItem(sponsorStorageKey, JSON.stringify(managedSponsors));
    const response = await fetch("/api/workspace/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settings),
    });
    const result = (await response.json()) as { data?: { savedAt?: string } };
    const savedDate = result.data?.savedAt ? new Date(result.data.savedAt) : new Date();
    setSavedAt(savedDate.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }));
  }

  async function simulateSoftDelete() {
    const response = await fetch("/api/workspace/soft-delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workspaceId: workspace.id,
        restoreDeadlineDays: settings.restoreDeadlineDays,
      }),
    });
    const result = (await response.json()) as {
      data?: { message?: string; canRestoreUntil?: string };
    };
    setSoftDeleteMessage(
      `${result.data?.message ?? "已模擬停用工作空間"} 可恢復至：${result.data?.canRestoreUntil ?? "-"}`,
    );
  }

  async function generateMigrationPreview() {
    const response = await fetch("/api/blueprints/migration-preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id }),
    });
    const result = (await response.json()) as {
      data?: { preview?: BlueprintMigrationPreview };
    };
    setMigrationPreview(result.data?.preview ?? null);
  }

  function resetSponsorDraft() {
    setSponsorDraft(createEmptySponsor());
    setEditingSponsorId(null);
    setLogoAdjustMessage(null);
  }

  function saveSponsorDraft() {
    const normalizedDraft: SponsorPartner = {
      ...sponsorDraft,
      id: editingSponsorId ?? `sp_${Date.now()}`,
      shortName: sponsorDraft.shortName || sponsorDraft.name,
      logoText: (sponsorDraft.logoText || sponsorDraft.name.slice(0, 1) || "企").slice(0, 2),
      logoUrl: sponsorDraft.logoUrl || "",
    };

    setManagedSponsors((current) => {
      if (editingSponsorId) {
        return current.map((sponsor) =>
          sponsor.id === editingSponsorId ? normalizedDraft : sponsor,
        );
      }
      return [...current, normalizedDraft];
    });
    setSettings((current) => ({
      ...current,
      sponsorSettings: {
        ...current.sponsorSettings,
        primarySponsorId: current.sponsorSettings.primarySponsorId || normalizedDraft.id,
      },
    }));
    resetSponsorDraft();
  }

  function editSponsor(sponsor: SponsorPartner) {
    setSponsorDraft(sponsor);
    setEditingSponsorId(sponsor.id);
    setLogoAdjustMessage(null);
  }

  async function uploadSponsorLogo(file: File | null) {
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setLogoAdjustMessage("請上傳 PNG、JPG、WEBP 或 SVG 等圖片檔。");
      return;
    }

    try {
      const logoUrl = await resizeLogoFile(file);
      setSponsorDraft((current) => ({
        ...current,
        logoUrl,
        logoText: (current.logoText || current.shortName || current.name.slice(0, 1) || "企").slice(0, 2),
      }));
      setLogoAdjustMessage("已上傳並自動調整為透明置中比例，會套用到後台、Dashboard 與成果報告預覽。");
    } catch {
      setLogoAdjustMessage("這張 LOGO 圖片暫時無法讀取，請改用 PNG、JPG 或 WEBP 再試一次。");
    }
  }

  function smartAdjustSponsorLogo() {
    setSponsorDraft((current) => {
      const shortName = current.shortName || createSponsorShortName(current.name);
      return {
        ...current,
        shortName,
        logoText: (current.logoText || shortName || current.name.slice(0, 1) || "企").slice(0, 2),
      };
    });
    setLogoAdjustMessage("已產生 Logo + 企業全名 / 簡稱的露出版型；正式 AI 修圖後續可接到後端影像服務。");
  }

  function deleteSponsor(sponsorId: string) {
    const sponsor = managedSponsors.find((item) => item.id === sponsorId);
    const confirmed = window.confirm(
      `確定刪除「${sponsor?.name ?? "這家贊助企業"}」？刪除後需按儲存設定才會寫入暫存。`,
    );
    if (!confirmed) {
      return;
    }

    const nextSponsors = managedSponsors.filter((item) => item.id !== sponsorId);
    setManagedSponsors(nextSponsors);
    if (settings.sponsorSettings.primarySponsorId === sponsorId) {
      setSettings((current) => ({
        ...current,
        sponsorSettings: {
          ...current.sponsorSettings,
          primarySponsorId: nextSponsors[0]?.id ?? "",
        },
      }));
    }
    if (editingSponsorId === sponsorId) {
      resetSponsorDraft();
    }
  }

  return (
    <div className="grid gap-4">
      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">系統設定</p>
            <h1 className="mt-2 text-2xl font-semibold">空間規則</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              管理 {workspace.name} 的藍圖版本、模組、責任歸屬、贊助聯名與工作空間停用規則。
            </p>
          </div>
          <Button disabled={!canUpdateWorkspace && !canManageSponsors} onClick={saveSettings}>
            <Save className="h-4 w-4" />
            儲存設定
          </Button>
        </div>
        {savedAt && (
          <p className="mt-3 flex items-center gap-2 text-sm font-medium text-primary">
            <CheckCircle2 className="h-4 w-4" />
            已暫存於瀏覽器 {savedAt}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {spaceRuleTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                activeTab === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground"
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === "credentials" && <VisitorLoginCredentialsPanel />}

      {activeTab === "blueprint" && <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-base font-semibold">藍圖版本綁定</h2>
          <div className="mt-4 space-y-3 text-sm">
            <Row label="藍圖" value={`${workspace.blueprint.name} v${workspace.blueprint.version}`} />
            <Row label="綁定狀態" value={workspace.bindingStatus} />
            <Row label="第一市場" value={workspace.blueprint.firstMarketFit ? "符合" : "第二階段"} />
          </div>
          <p className="mt-4 rounded-md bg-secondary p-3 text-sm text-muted-foreground">
            藍圖更新後不直接影響既有工作空間；升級前需產生遷移預覽。
          </p>
          <Button
            variant="outline"
            className="mt-4 w-full"
            disabled={!canUpdateWorkspace}
            onClick={generateMigrationPreview}
          >
            <GitCompareArrows className="h-4 w-4" />
            產生升級預覽
          </Button>
          {migrationPreview && (
            <div className="mt-4 rounded-md border bg-background p-3 text-sm">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="font-semibold">
                  v{migrationPreview.fromVersion} → v{migrationPreview.toVersion}
                </p>
                <span className="text-muted-foreground">{migrationPreview.status}</span>
              </div>
              <p className="mt-2 text-muted-foreground">{migrationPreview.summary}</p>
              {migrationPreview.impacts.length > 0 && (
                <div className="mt-3 grid gap-2">
                  {migrationPreview.impacts.map((impact) => (
                    <div key={impact.key} className="rounded-md border p-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{impact.label}</p>
                        <span className="text-xs text-muted-foreground">{impact.severity}</span>
                      </div>
                      <p className="mt-1 text-muted-foreground">{impact.detail}</p>
                    </div>
                  ))}
                </div>
              )}
              {migrationPreview.requiredApprovals.length > 0 && (
                <p className="mt-3 text-muted-foreground">
                  需核准：{migrationPreview.requiredApprovals.join("、")}
                </p>
              )}
            </div>
          )}
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {bindingRuleNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      </section>}

      {activeTab === "blueprint" && <section className="rounded-lg border bg-card p-4">
        <h2 className="text-base font-semibold">啟用模組</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {moduleOptions.map((module) => {
            const enabled = settings.enabledModules.includes(module.key);
            return (
              <button
                key={module.key}
                type="button"
                className={`rounded-lg border p-3 text-left transition-colors ${
                  enabled ? "border-primary bg-primary/5" : "bg-background"
                }`}
                onClick={() => setSettings((current) => toggleModule(current, module.key))}
                disabled={!canUpdateWorkspace}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">{module.label}</p>
                  <span className="rounded-md bg-secondary px-2 py-1 text-xs">
                    {enabled ? "啟用" : "關閉"}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {module.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>}

      {activeTab === "sponsors" && <section className="grid gap-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Handshake className="h-5 w-5 text-primary" />
                <h2 className="text-base font-semibold">贊助企業聯名</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                設定主要公益夥伴、露出位置與治理揭露文字；不在日常總覽重複顯示模擬內容。
              </p>
            </div>
            <button
              type="button"
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                settings.sponsorSettings.enabled
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground"
              }`}
              onClick={() =>
                setSettings((current) => ({
                  ...current,
                  sponsorSettings: {
                    ...current.sponsorSettings,
                    enabled: !current.sponsorSettings.enabled,
                  },
                }))
              }
              disabled={!canManageSponsors}
            >
              {settings.sponsorSettings.enabled ? "已啟用" : "已關閉"}
            </button>
          </div>

        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(24rem,0.85fr)_minmax(30rem,1.15fr)]">
          <div className="rounded-lg border bg-background p-3">
            <h3 className="text-sm font-semibold">聯名設定</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              選擇主要企業、露出等級與公開揭露文字。
            </p>
            <label className="text-sm font-medium">
              主要贊助企業
              <select
                className="mt-2 h-10 w-full rounded-md border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={settings.sponsorSettings.primarySponsorId}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    sponsorSettings: {
                      ...current.sponsorSettings,
                      primarySponsorId: event.target.value,
                    },
                  }))
                }
                disabled={!canManageSponsors}
              >
                {managedSponsors.map((sponsor) => (
                  <option key={sponsor.id} value={sponsor.id}>
                    {sponsor.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-4">
              <p className="text-sm font-medium">露出等級</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(["subtle", "standard", "featured"] as const).map((level) => (
                  <button
                    key={level}
                    type="button"
                    className={`rounded-md border px-2 py-2 text-xs font-medium ${
                      settings.sponsorSettings.exposureLevel === level
                        ? "border-primary bg-primary/10 text-primary"
                        : "bg-card text-muted-foreground"
                    }`}
                    onClick={() =>
                      setSettings((current) => ({
                        ...current,
                        sponsorSettings: {
                          ...current.sponsorSettings,
                          exposureLevel: level,
                        },
                      }))
                    }
                    disabled={!canManageSponsors}
                  >
                    {exposureLevelLabel[level]}
                  </button>
                ))}
              </div>
            </div>

            <TextArea
              label="揭露文字"
              value={settings.sponsorSettings.disclosureText}
              onChange={(disclosureText) =>
                setSettings((current) => ({
                  ...current,
                  sponsorSettings: {
                    ...current.sponsorSettings,
                    disclosureText,
                  },
                }))
              }
              disabled={!canManageSponsors}
            />
          </div>

          <div className="rounded-lg border bg-background p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">露出位置</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  只保留可治理的位置，不放入個資表單與同意書填寫區。
                </p>
              </div>
              <span className="rounded-md bg-secondary px-2 py-1 text-xs">
                {sponsorPlacements.length} 處
              </span>
            </div>

            <div className="mt-3 grid gap-3">
              {sponsorPlacements.map((placement) => {
                const settingKey = placementSettingMap[placement.key as keyof typeof placementSettingMap];
                const enabled = settings.sponsorSettings.placements[settingKey];

                return (
                  <button
                    key={placement.key}
                    type="button"
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      enabled ? "border-primary bg-primary/5" : "bg-card"
                    }`}
                    onClick={() =>
                      setSettings((current) => ({
                        ...current,
                        sponsorSettings: {
                          ...current.sponsorSettings,
                          placements: {
                            ...current.sponsorSettings.placements,
                            [settingKey]: !enabled,
                          },
                        },
                      }))
                    }
                    disabled={!canManageSponsors}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{placement.label}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{placement.location}</p>
                      </div>
                      <span className="shrink-0 rounded-md bg-secondary px-2 py-1 text-xs">
                        {enabled ? "顯示" : "不顯示"}
                      </span>
                    </div>
                    <p className="mt-3 flex gap-2 text-sm text-muted-foreground">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {placement.governanceNote}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(24rem,0.85fr)_minmax(30rem,1.15fr)]">
          <div className="rounded-lg border bg-background p-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">
                {editingSponsorId ? "修改贊助企業" : "新增贊助企業"}
              </h3>
            </div>

            <div className="mt-4 grid gap-3">
              <TextInput
                label="企業全名"
                value={sponsorDraft.name}
                onChange={(name) => setSponsorDraft((current) => ({ ...current, name }))}
              />
              <TextInput
                label="顯示簡稱"
                value={sponsorDraft.shortName}
                onChange={(shortName) =>
                  setSponsorDraft((current) => ({ ...current, shortName }))
                }
              />
              <TextInput
                label="產業 / 合作類型"
                value={sponsorDraft.industry}
                onChange={(industry) =>
                  setSponsorDraft((current) => ({ ...current, industry }))
                }
              />
              <TextInput
                label="支持內容"
                value={sponsorDraft.contributionLabel}
                onChange={(contributionLabel) =>
                  setSponsorDraft((current) => ({ ...current, contributionLabel }))
                }
              />
              <SponsorLogoUploader
                sponsor={sponsorDraft}
                disabled={!canEditSponsorDraft}
                message={logoAdjustMessage}
                onFileSelected={uploadSponsorLogo}
                onSmartAdjust={smartAdjustSponsorLogo}
                onClearLogo={() =>
                  setSponsorDraft((current) => ({
                    ...current,
                    logoUrl: "",
                  }))
                }
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  備援主色
                  <input
                    className="mt-2 h-10 w-full rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    type="color"
                    value={sponsorDraft.themeColor}
                    disabled={!canEditSponsorDraft}
                    onChange={(event) =>
                      setSponsorDraft((current) => ({
                        ...current,
                        themeColor: event.target.value,
                      }))
                    }
                  />
                </label>
                <TextInput
                  label="無圖時顯示文字"
                  value={sponsorDraft.logoText}
                  onChange={(logoText) =>
                    setSponsorDraft((current) => ({ ...current, logoText }))
                  }
                  disabled={!canEditSponsorDraft}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextInput
                  label="開始日期"
                  value={sponsorDraft.activeFrom}
                  onChange={(activeFrom) =>
                    setSponsorDraft((current) => ({ ...current, activeFrom }))
                  }
                />
                <TextInput
                  label="結束日期"
                  value={sponsorDraft.activeTo}
                  onChange={(activeTo) =>
                    setSponsorDraft((current) => ({ ...current, activeTo }))
                  }
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  className="w-full sm:w-auto"
                  type="button"
                  onClick={saveSponsorDraft}
                  disabled={
                    !sponsorDraft.name.trim() ||
                    !canEditSponsorDraft
                  }
                >
                  <Plus className="h-4 w-4" />
                  {editingSponsorId ? "儲存修改" : "新增企業"}
                </Button>
                {editingSponsorId && (
                  <Button
                    className="w-full sm:w-auto"
                    type="button"
                    variant="outline"
                    onClick={resetSponsorDraft}
                  >
                    取消修改
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-background p-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">贊助企業清單</h3>
              <span className="rounded-md bg-secondary px-2 py-1 text-xs">
                {managedSponsors.length} 家
              </span>
            </div>

            <div className="mt-3 grid gap-3">
              {managedSponsors.map((sponsor) => (
                <article key={sponsor.id} className="rounded-lg border bg-card p-3">
                  <div className="flex items-start gap-3">
                    <SponsorLogoMark sponsor={sponsor} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{sponsor.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {sponsor.industry} · {sponsor.activeFrom} 至 {sponsor.activeTo}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <button
                            aria-label={`修改 ${sponsor.name}`}
                            className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-muted-foreground hover:text-foreground"
                            type="button"
                            onClick={() => editSponsor(sponsor)}
                            disabled={!canUpdateSponsor}
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            aria-label={`刪除 ${sponsor.name}`}
                            className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-muted-foreground hover:text-destructive"
                            type="button"
                            onClick={() => deleteSponsor(sponsor.id)}
                            disabled={!canDeleteSponsor}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {sponsor.contributionLabel}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>}

      {activeTab === "responsibility" && <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-base font-semibold">責任歸屬</h2>
          <div className="mt-4 grid gap-3">
            <TextInput
              label="責任單位 / 法定代表"
              value={settings.legalOwnerName}
              disabled={!canUpdateWorkspace}
              onChange={(legalOwnerName) =>
                setSettings((current) => ({ ...current, legalOwnerName }))
              }
            />
            <TextInput
              label="管理責任人"
              value={settings.responsiblePerson}
              disabled={!canUpdateWorkspace}
              onChange={(responsiblePerson) =>
                setSettings((current) => ({ ...current, responsiblePerson }))
              }
            />
            <TextInput
              label="保險資訊"
              value={settings.insuranceInfo}
              disabled={!canUpdateWorkspace}
              onChange={(insuranceInfo) =>
                setSettings((current) => ({ ...current, insuranceInfo }))
              }
            />
            <TextArea
              label="服務聲明"
              value={settings.serviceDisclaimer}
              disabled={!canUpdateWorkspace}
              onChange={(serviceDisclaimer) =>
                setSettings((current) => ({ ...current, serviceDisclaimer }))
              }
            />
          </div>
        </div>
      </section>}

      {activeTab === "recovery" && <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-base font-semibold">維運治理</h2>
          <div className="mt-4 grid gap-3">
            <NumberInput
              label="Active logs 保留月數"
              value={settings.logRetentionMonths}
              disabled={!canUpdateWorkspace}
              onChange={(logRetentionMonths) =>
                setSettings((current) => ({ ...current, logRetentionMonths }))
              }
            />
            <NumberInput
              label="幾個月後封存"
              value={settings.archiveAfterMonths}
              disabled={!canUpdateWorkspace}
              onChange={(archiveAfterMonths) =>
                setSettings((current) => ({ ...current, archiveAfterMonths }))
              }
            />
            <NumberInput
              label="停用後可恢復天數"
              value={settings.restoreDeadlineDays}
              disabled={!canUpdateWorkspace}
              onChange={(restoreDeadlineDays) =>
                setSettings((current) => ({ ...current, restoreDeadlineDays }))
              }
            />
          </div>
          <div className="mt-4 rounded-lg border bg-background p-3 text-sm">
            <div className="flex items-center gap-2 font-semibold">
              <ArchiveRestore className="h-4 w-4" />
              可恢復期限
            </div>
            <p className="mt-2 text-muted-foreground">{softDeletePreview.message}</p>
            <p className="mt-1 font-medium">可恢復至：{softDeletePreview.canRestoreUntil}</p>
          </div>
          <Button
            variant="outline"
            className="mt-4 w-full"
            disabled={!canSoftDeleteWorkspace}
            onClick={simulateSoftDelete}
          >
            <Trash2 className="h-4 w-4" />
            模擬停用工作空間
          </Button>
          {softDeleteMessage && (
            <p className="mt-3 rounded-md bg-secondary p-3 text-sm text-muted-foreground">
              {softDeleteMessage}
            </p>
          )}
        </div>
      </section>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b pb-2 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function SponsorLogoUploader({
  sponsor,
  disabled,
  message,
  onFileSelected,
  onSmartAdjust,
  onClearLogo,
}: {
  sponsor: SponsorPartner;
  disabled: boolean;
  message: string | null;
  onFileSelected: (file: File | null) => void;
  onSmartAdjust: () => void;
  onClearLogo: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card p-3">
      <div className="grid gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <SponsorLogoMark sponsor={sponsor} size="xl" />
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <ImageIcon className="h-4 w-4 text-primary" />
              企業 LOGO
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              上傳後會自動等比例置中與縮放，讓後台標籤、Dashboard 與成果報告都能一致露出。
            </p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label
            className={`inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md border bg-background px-3 text-sm font-medium ${
              disabled ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <Upload className="h-4 w-4" />
            上傳 LOGO
            <input
              className="sr-only"
              type="file"
              accept="image/*"
              disabled={disabled}
              onChange={(event) => onFileSelected(event.target.files?.[0] ?? null)}
            />
          </label>
          <Button
            className="w-full"
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={onSmartAdjust}
          >
            <Sparkles className="h-4 w-4" />
            智慧調整
          </Button>
        </div>
      </div>

      {sponsor.logoUrl && (
        <button
          type="button"
          className="mt-3 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          disabled={disabled}
          onClick={onClearLogo}
        >
          移除目前 LOGO 圖片
        </button>
      )}

      <div className="mt-4 grid gap-2">
        <LogoPreviewCard title="後台頂部" subtitle={sponsor.shortName || "企業簡稱"} sponsor={sponsor} compact />
        <LogoPreviewCard title="Dashboard 成果" subtitle={sponsor.name || "企業全名"} sponsor={sponsor} />
        <LogoPreviewCard title="成果報告" subtitle={sponsor.name || "企業全名"} sponsor={sponsor} featured />
      </div>

      {message && (
        <p className="mt-3 rounded-md bg-secondary p-2 text-xs leading-5 text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}

function LogoPreviewCard({
  sponsor,
  title,
  subtitle,
  compact = false,
  featured = false,
}: {
  sponsor: SponsorPartner;
  title: string;
  subtitle: string;
  compact?: boolean;
  featured?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border bg-background p-3">
      <p className="truncate text-xs font-medium text-muted-foreground">{title}</p>
      <div className={`mt-3 flex items-center gap-3 ${featured ? "rounded-md bg-card p-3" : ""}`}>
        <SponsorLogoMark sponsor={sponsor} size={compact ? "sm" : featured ? "lg" : "md"} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{subtitle}</p>
          <p className="truncate text-xs text-muted-foreground">
            {compact ? "公益夥伴" : sponsor.contributionLabel || "支持公益服務"}
          </p>
        </div>
      </div>
    </div>
  );
}

function createEmptySponsor(): SponsorPartner {
  return {
    id: "",
    name: "",
    shortName: "",
    industry: "企業公益 / ESG",
    logoText: "",
    logoUrl: "",
    themeColor: "#4FA878",
    contributionLabel: "",
    visibilityLevel: "standard",
    activeFrom: new Date().toISOString().slice(0, 10),
    activeTo: "2026-12-31",
  };
}

function normalizeSponsor(sponsor: SponsorPartner): SponsorPartner {
  return {
    ...sponsor,
    shortName: sponsor.shortName || sponsor.name,
    logoText: (sponsor.logoText || sponsor.shortName || sponsor.name || "企").slice(0, 2),
    logoUrl: sponsor.logoUrl || "",
  };
}

function createSponsorShortName(name: string) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return "";
  }
  return trimmedName.length <= 6 ? trimmedName : trimmedName.slice(0, 6);
}

async function resizeLogoFile(file: File) {
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(imageUrl);
    const canvas = document.createElement("canvas");
    const size = 512;
    const safeArea = 420;
    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas is not available.");
    }

    context.clearRect(0, 0, size, size);
    const scale = Math.min(safeArea / image.naturalWidth, safeArea / image.naturalHeight, 1);
    const width = Math.round(image.naturalWidth * scale);
    const height = Math.round(image.naturalHeight * scale);
    const x = Math.round((size - width) / 2);
    const y = Math.round((size - height) / 2);
    context.drawImage(image, x, y, width, height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Logo image could not be loaded."));
    image.src = src;
  });
}

function TextInput({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <input
        className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <textarea
        className="mt-2 min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <input
        className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        min={1}
        type="number"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
