"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BrainCircuit,
  ClipboardCheck,
  ClipboardList,
  Route,
  ShieldCheck,
  FileCheck2,
  UserRoundCheck,
} from "lucide-react";
import { useCan } from "@/components/auth/permission-provider";
import { Button } from "@/components/ui/button";
import { PageIntro } from "@/components/ui/page-intro";
import { ManagementWorkflowBar } from "@/components/manage/management-workflow-bar";
import { getAssignmentFormChecklist } from "@/lib/domain/visit-form-flow";
import type {
  AssignmentDecisionResult,
  AssignmentRecommendation,
  ElderCase,
  VisitorWorkerType,
  VisitorProfile,
} from "@/lib/domain/types";

type AssignmentPayload = {
  visitors: VisitorProfile[];
  recommendations: AssignmentRecommendation[];
  cases: ElderCase[];
};

const workerTypeLabels: Record<VisitorWorkerType, string> = {
  social_affairs: "社政",
  civil_affairs: "民政",
  general: "一般",
};

const certificateLabels: Record<VisitorProfile["certificateStatus"], string> = {
  valid: "有效",
  missing: "待補",
  expired: "逾期",
};

export function AssignmentDashboard() {
  const canConfirmAssignment = useCan("assignment.confirm");
  const [data, setData] = useState<AssignmentPayload | null>(null);
  const [decision, setDecision] = useState<AssignmentDecisionResult | null>(null);
  const [selectedRecommendationId, setSelectedRecommendationId] = useState<string | null>(null);
  const caseMap = useMemo(
    () => new Map((data?.cases ?? []).map((elderCase) => [elderCase.id, elderCase])),
    [data?.cases],
  );
  const formChecklist = useMemo(() => getAssignmentFormChecklist(), []);
  const selectedRecommendation =
    data?.recommendations.find((item) => item.id === selectedRecommendationId) ??
    data?.recommendations[0] ??
    null;

  useEffect(() => {
    void loadAssignments();
  }, []);

  async function loadAssignments() {
    const response = await fetch("/api/assignments");
    const result = (await response.json()) as { data?: AssignmentPayload };
    setData(result.data ?? null);
    setSelectedRecommendationId(result.data?.recommendations[0]?.id ?? null);
  }

  async function confirm(recommendationId: string, visitorId: string) {
    const response = await fetch("/api/assignments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recommendationId, visitorId }),
    });
    const result = (await response.json()) as { data?: AssignmentDecisionResult };
    setDecision(result.data ?? null);
    if (result.data?.status === "confirmed") {
      await loadAssignments();
    }
  }

  return (
    <div className="grid gap-4">
      <PageIntro
        icon={ClipboardList}
        title="派案管理"
        description="依里別、民政/社政身分、共訪需求、訪員資格、容量與風險產生派案建議，保留人工覆核。"
      />
      <ManagementWorkflowBar active="assignments" />

      <section className="rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">派案流程導覽</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              系統先用規則產生建議，再由承辦或督導確認；有風險提醒時不直接派案。
            </p>
          </div>
          <Link
            className="inline-flex items-center gap-2 text-sm font-medium text-primary"
            href="/system/sitemap"
          >
            查看完整流程導覽
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <AssignmentFlowStep
            icon={ClipboardList}
            title="待訪排程"
            detail="名冊與訪查期程先建立，才會進入派案佇列。"
          />
          <AssignmentFlowStep
            icon={Route}
            title="里別比對"
            detail="先比對長者所在里別，再比對行政區。"
          />
          <AssignmentFlowStep
            icon={BrainCircuit}
            title="身分與共訪"
            detail="確認社政、民政與共訪搭配是否符合案件需求。"
          />
          <AssignmentFlowStep
            icon={ShieldCheck}
            title="資格覆核"
            detail="訪員證、受訓紀錄、匯款帳戶缺漏時先送主管覆核。"
          />
          <AssignmentFlowStep
            icon={ClipboardCheck}
            title="任務送達"
            detail="確認後同步到訪員端任務清單。"
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <RuleCard label="同里別" value="+25" detail="優先派給熟悉該里別的訪查人員。" />
          <RuleCard label="民政/社政符合" value="+15" detail="依案件需求比對訪員身分。" />
          <RuleCard label="共訪搭配完整" value="+10" detail="需共訪案件必須有民政與社政雙角色。" />
          <RuleCard label="資格與匯款完整" value="+15" detail="訪員證、受訓與帳戶完整才可直接派案。" />
          <RuleCard label="同區域" value="+15" detail="降低移動成本，提升訪查效率。" />
          <RuleCard label="仍有容量" value="+15" detail="未超過每日任務上限才建議派案。" />
          <RuleCard label="完成訓練" value="+10" detail="涉及同意書或簽名案件需具備訓練。" />
          <RuleCard label="高風險優先" value="+15" detail="高風險個案會提高排序權重。" />
        </div>

        <div className="mt-4 rounded-lg border bg-background p-3">
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">派案內建表單檢查</h2>
          </div>
          <div className="mt-3 grid gap-2 lg:grid-cols-4">
            {formChecklist.map((form) => (
              <div key={form.templateId} className="rounded-md border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{form.name}</p>
                  <span className="shrink-0 rounded-md bg-secondary px-2 py-1 text-xs">
                    {form.stageLabel}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{form.usage}</p>
                <p className="mt-2 text-xs font-medium text-primary">
                  {form.owner} · {form.statusLabel}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {data && selectedRecommendation && (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(24rem,1.05fr)]">
          <div className="order-1 rounded-lg border bg-card p-4 xl:order-none">
            <h2 className="text-base font-semibold">左側：待派名冊</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              先點選要派案的個案，再到右側選定訪員。
            </p>
            <div className="mt-4 grid gap-2">
              {data.recommendations.map((recommendation) => {
                const elderCase = caseMap.get(recommendation.caseId);
                const selected = recommendation.id === selectedRecommendation.id;

                return (
                  <button
                    key={recommendation.id}
                    type="button"
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      selected ? "border-primary bg-primary/5" : "bg-background hover:bg-secondary"
                    }`}
                    onClick={() => setSelectedRecommendationId(recommendation.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{elderCase?.name ?? "未知個案"}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {elderCase?.caseCode ?? recommendation.caseId} · 待派案
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {elderCase?.district} · {elderCase?.village} ·{" "}
                          {elderCase?.requiredVisitorTypes
                            .map((type) => workerTypeLabels[type])
                            .join("＋")}
                          {elderCase?.coVisitRequired ? " · 需共訪" : ""}
                        </p>
                      </div>
                      <span className="rounded-md bg-secondary px-2 py-1 text-xs">
                        {recommendation.score} 分
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {recommendation.reasons.join("、")}
                    </p>
                    {recommendation.warnings.length > 0 && (
                      <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                        {recommendation.warnings.join(" ")}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="order-2 rounded-lg border bg-card p-4 xl:order-none">
            <h2 className="text-base font-semibold">右側：訪員分配</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              查看每位訪員工作量、區域與訓練狀態後，進行 1 對 1 分配。
            </p>
            <div className="mt-4 rounded-lg border bg-primary/5 p-3">
              <p className="text-xs font-medium text-primary">目前分配個案</p>
              <p className="mt-1 text-sm font-semibold">
                {caseMap.get(selectedRecommendation.caseId)?.name ?? "未知個案"}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {caseMap.get(selectedRecommendation.caseId)?.caseCode ?? selectedRecommendation.caseId}
                {" · "}
                建議分數 {selectedRecommendation.score} 分
              </p>
            </div>
            <div className="mt-4 grid gap-3">
              {data.visitors.map((visitor) => {
                const matched = visitor.id === selectedRecommendation.visitorId;
                const loadPercent = Math.min(
                  Math.round((visitor.activeTaskCount / visitor.maxDailyTasks) * 100),
                  100,
                );

                return (
                  <article
                    key={visitor.id}
                    className={`rounded-lg border p-3 ${
                      matched ? "border-primary bg-primary/5" : "bg-background"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <UserRoundCheck className="h-5 w-5 text-primary" />
                          <h3 className="font-semibold">{visitor.fullName}</h3>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {workerTypeLabels[visitor.workerType]} · {visitor.districtCoverage.join("、")} ·{" "}
                          {visitor.status}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          服務里別：{visitor.villageCoverage.join("、")}
                        </p>
                      </div>
                      <span className="rounded-md bg-secondary px-2 py-1 text-xs">
                        {matched ? "建議" : "可選"}
                      </span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${loadPercent}%` }} />
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      今日任務 {visitor.activeTaskCount}/{visitor.maxDailyTasks} · 已訓練：
                      {visitor.trainedModules.join("、")}
                    </p>
                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                      <span className="rounded-md bg-secondary px-2 py-1">
                        訪員證：{certificateLabels[visitor.certificateStatus]}
                      </span>
                      <span className="rounded-md bg-secondary px-2 py-1">
                        受訓：{visitor.trainingDate ?? "待補"}
                      </span>
                      <span className="rounded-md bg-secondary px-2 py-1">
                        匯款：{visitor.remittanceReady ? `末五碼 ${visitor.bankAccountLast5}` : "待建檔"}
                      </span>
                    </div>
                    <Button
                      className="mt-3 w-full"
                      variant={matched ? "default" : "outline"}
                      disabled={!canConfirmAssignment}
                      onClick={() => confirm(selectedRecommendation.id, visitor.id)}
                    >
                      {selectedRecommendation.warnings.length > 0 ? "送主管覆核" : "確認分配給此訪員"}
                    </Button>
                  </article>
                );
              })}
            </div>

            <div className="mt-4 rounded-md border bg-background p-3">
              <p className="text-sm font-semibold">本派案需帶入表單</p>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {formChecklist.map((form) => (
                  <p key={form.templateId}>
                    {form.stageLabel} · {form.name} · {form.statusLabel}
                  </p>
                ))}
              </div>
            </div>
            {!canConfirmAssignment && (
              <p className="mt-3 rounded-md bg-secondary p-3 text-sm text-muted-foreground">
                目前角色沒有確認派案權限。
              </p>
            )}
          </div>
        </section>
      )}

      {decision && (
        <section className="rounded-lg border bg-card p-4">
          <p className="font-semibold">{decision.message}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            狀態：{decision.status}
            {decision.assignedAt
              ? ` · ${new Date(decision.assignedAt).toLocaleString("zh-TW")}`
              : ""}
          </p>
        </section>
      )}
    </div>
  );
}

function AssignmentFlowStep({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof ClipboardList;
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p>
    </div>
  );
}

function RuleCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{label}</p>
        <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
          {value}
        </span>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
    </div>
  );
}
