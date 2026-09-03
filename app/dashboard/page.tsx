import { cookies } from "next/headers";
import {
  Activity,
  ArrowRight,
  BarChart3,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileText,
  FormInput,
  LayoutDashboard,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { RoleHomePriorities } from "@/components/dashboard/role-home-priorities";
import { StatCard } from "@/components/stat-card";
import { TaskThread } from "@/components/task-thread";
import { PageIntro } from "@/components/ui/page-intro";
import { ManagementPriorityQueue, ManagementWorkflowBar } from "@/components/manage/management-workflow-bar";
import { LimitUsageList } from "@/components/workspace/limit-usage-list";
import { getUnit } from "@/lib/domain/mock-data";
import { getRoleByKey } from "@/lib/domain/permissions";
import type { ActivityItem, WorkspaceRoleKey } from "@/lib/domain/types";
import { getRepository } from "@/lib/repositories";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const roleKey = (cookieStore.get("demo_role")?.value ?? "workspace_manager") as WorkspaceRoleKey;
  const role = getRoleByKey(roleKey);
  const roleDashboard = dashboardByRole[roleKey] ?? dashboardByRole.workspace_manager;
  const repository = getRepository();
  const workspace = await repository.getCurrentWorkspace();
  const unit = getUnit(workspace.unitId);

  return (
    <AppShell active="dashboard">
      <PageIntro
        icon={LayoutDashboard}
        eyebrow={`${role.label}工作台`}
        title={roleDashboard.title}
        description={roleDashboard.description}
        aside={
          <div className="grid gap-2 rounded-lg border bg-background p-3 text-sm sm:min-w-[16rem]">
            <StatusRow label="工作空間" value={workspace.name} />
            <StatusRow label="服務單位" value={unit?.unitName ?? "未指定單位"} />
            <StatusRow label="目前方案" value={workspace.planName} />
          </div>
        }
      />
      <RoleHomePriorities roleKey={roleKey} />

      {(roleKey === "workspace_manager" || roleKey === "supervisor") && (
        <>
          <ManagementWorkflowBar active={roleKey === "supervisor" ? "audit" : "assignments"} />
          <ManagementPriorityQueue />
        </>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {roleDashboard.focusCards.map((card) => (
          <article key={card.title} className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{card.title}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{card.detail}</p>
              </div>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <card.icon className="h-5 w-5" />
              </span>
            </div>
            <Link
              href={card.href}
              className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary"
            >
              前往處理
              <ArrowRight className="h-4 w-4" />
            </Link>
          </article>
        ))}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {roleDashboard.metrics.map((metric) => (
          <StatCard
            key={metric.key}
            icon={metric.icon}
            label={metric.label}
            value={metric.value}
            detail={metric.detail}
          />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold">{roleDashboard.workQueueTitle}</h2>
              <p className="text-sm text-muted-foreground">{roleDashboard.workQueueHint}</p>
            </div>
            <span className="rounded-md bg-secondary px-2.5 py-1 text-xs font-medium">
              今日
            </span>
          </div>
          <TaskThread items={roleDashboard.activityItems} />
        </div>

        <div className="rounded-lg border bg-card p-4">
          <h2 className="text-base font-semibold">{roleDashboard.sidePanelTitle}</h2>
          <div className="mt-4 grid gap-3">
            {roleDashboard.sidePanelRows.map((row) => (
              <div key={row.label} className="rounded-md border bg-background p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-medium">{row.label}</p>
                  <span className="rounded-md bg-secondary px-2 py-1 text-xs">{row.value}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{row.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {roleDashboard.showPlanLimits && (
        <section className="rounded-lg border bg-card p-4">
          <div className="mb-4">
            <h2 className="text-base font-semibold">方案限制</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              建立工作空間、案件、匯出與通知前會先檢查方案使用量。
            </p>
          </div>
          <LimitUsageList limits={workspace.planLimits} />
        </section>
      )}
    </AppShell>
  );
}

const dashboardByRole: Record<
  WorkspaceRoleKey,
  {
    title: string;
    description: string;
    workQueueTitle: string;
    workQueueHint: string;
    sidePanelTitle: string;
    showPlanLimits: boolean;
    metrics: Array<{
      key: string;
      label: string;
      value: string;
      detail: string;
      icon: typeof LayoutDashboard;
    }>;
    activityItems: ActivityItem[];
    focusCards: Array<{
      title: string;
      detail: string;
      href: string;
      icon: typeof LayoutDashboard;
    }>;
    sidePanelRows: Array<{ label: string; value: string; detail: string }>;
  }
> = {
  workspace_owner: {
    title: "組織治理與營運總覽",
    description: "掌握工作空間、權限、方案限制、公告與稽核風險，適合用來看整體營運健康度。",
    workQueueTitle: "今日治理摘要",
    workQueueHint: "顯示需要管理者注意的權限、公告、稽核與設定事件",
    sidePanelTitle: "管理者決策區",
    showPlanLimits: true,
    metrics: [
      { key: "cases", label: "名冊案件", value: "248", detail: "本月新增 32 件", icon: Users },
      { key: "completed", label: "已完成訪查", value: "154", detail: "完成率 62%", icon: ClipboardCheck },
      { key: "audit", label: "待稽核", value: "27", detail: "6 件需補件", icon: ShieldCheck },
      { key: "payments", label: "待核銷", value: "41", detail: "預估 38,600 元", icon: FileText },
    ],
    activityItems: [
      { author: "派案規則", content: "今日尚有 18 件訪查任務待分派，建議先處理高風險名冊。", tone: "system" },
      { author: "督導", content: "三筆訪查紀錄缺少同意書，需補件後才能進入核銷。", tone: "warning" },
      { author: "系統", content: "贊助聯名與公告發布設定可於空間規則調整。", tone: "default" },
    ],
    focusCards: [
      { title: "使用者與權限", detail: "審核加入申請、調整角色與檢查權限矩陣。", href: "/workspace/users", icon: Users },
      { title: "表單", detail: "管理生活關懷表、個資同意書與保密同意書版本。", href: "/manager/forms", icon: FormInput },
      { title: "稽核阻擋", detail: "查看高風險訪查與需覆核的核銷資料。", href: "/manager/audit", icon: ShieldCheck },
      { title: "空間規則", detail: "管理工作空間、贊助企業、公告與方案限制。", href: "/workspace/settings", icon: LayoutDashboard },
    ],
    sidePanelRows: [
      { label: "資料治理", value: "正常", detail: "權限、同意與日誌分層目前已啟用。" },
      { label: "公告發布", value: "2 則", detail: "含工作群組訊息與前台跑馬燈。" },
      { label: "方案使用", value: "注意", detail: "通知與匯出需持續觀察使用量。" },
    ],
  },
  workspace_manager: {
    title: "承辦作業與服務管理",
    description: "聚焦名冊、派案、通知、匯入匯出與日常行政處理，減少跨頁查找。",
    workQueueTitle: "承辦待辦",
    workQueueHint: "依派案、名冊、公告與匯出作業整理今日重點",
    sidePanelTitle: "營運狀態",
    showPlanLimits: true,
    metrics: [
      { key: "cases", label: "名冊案件", value: "248", detail: "本月新增 32 件", icon: Users },
      { key: "assignments", label: "待派案", value: "18", detail: "高風險 5 件", icon: ClipboardCheck },
      { key: "audit", label: "待補件", value: "6", detail: "需通知訪員", icon: ShieldCheck },
      { key: "exports", label: "待匯出", value: "2", detail: "核銷批次待確認", icon: FileText },
    ],
    activityItems: [
      { author: "派案規則", content: "今日尚有 18 件訪查任務待分派，建議先處理高風險名冊。", tone: "system" },
      { author: "通報", content: "有 1 則群組公告尚有未讀使用者。", tone: "warning" },
      { author: "匯出", content: "核銷批次需等稽核通過後再鎖定。", tone: "default" },
    ],
    focusCards: [
      { title: "名冊管理", detail: "新增、修改與追蹤服務對象資料狀態。", href: "/manager/cases", icon: Users },
      { title: "表單", detail: "維護縣市政府關懷表與同意書欄位模板。", href: "/manager/forms", icon: FormInput },
      { title: "派案作業", detail: "依區域、風險與訪員量能確認派案。", href: "/manager/assignments", icon: ClipboardCheck },
      { title: "志工出勤", detail: "外勤掃 QR、公所刷證，月底匯出 Excel。", href: "/manager/attendance", icon: Clock3 },
      { title: "訊息發布", detail: "發布工作群組公告、跑馬燈與個別通知。", href: "/manager/notifications", icon: FileText },
    ],
    sidePanelRows: [
      { label: "今日派案", value: "待確認", detail: "仍有建議派案需要承辦確認。" },
      { label: "匯出批次", value: "可處理", detail: "通過稽核後可進入核銷與匯出。" },
      { label: "公告回覆", value: "追蹤中", detail: "未讀與回覆紀錄可於通報頁查看。" },
    ],
  },
  supervisor: {
    title: "督導覆核與異常追蹤",
    description: "優先呈現異常通報、稽核阻擋、訪員回覆與需要督導判斷的事件。",
    workQueueTitle: "督導覆核清單",
    workQueueHint: "顯示需要人工判斷或回覆訪員的工作項目",
    sidePanelTitle: "督導提醒",
    showPlanLimits: false,
    metrics: [
      { key: "review", label: "待覆核", value: "9", detail: "含提醒項目 4 件", icon: ShieldCheck },
      { key: "incidents", label: "異常事件", value: "2", detail: "需追蹤處理", icon: Activity },
      { key: "replies", label: "訪員回覆", value: "5", detail: "今日新增", icon: Clock3 },
      { key: "assignments", label: "需覆核派案", value: "3", detail: "容量或訓練提醒", icon: ClipboardCheck },
    ],
    activityItems: [
      { author: "稽核", content: "兩筆訪查缺少定位或照片，需確認是否退回補件。", tone: "warning" },
      { author: "訪員", content: "王訪員已回覆補件說明，等待督導確認。", tone: "default" },
      { author: "通報", content: "疑似急迫健康風險案件需優先追蹤。", tone: "system" },
    ],
    focusCards: [
      { title: "稽核佇列", detail: "處理定位、同意、照片與核銷阻擋。", href: "/manager/audit", icon: ShieldCheck },
      { title: "異常通報", detail: "追蹤健康風險、未遇與資料異常。", href: "/manager/notifications", icon: Activity },
      { title: "訪員任務", detail: "查看訪員任務狀態與回覆紀錄。", href: "/visitor/tasks", icon: ClipboardCheck },
    ],
    sidePanelRows: [
      { label: "高風險事件", value: "2 件", detail: "需先確認是否通知主管或標記結案。" },
      { label: "補件狀態", value: "待追", detail: "未回覆補件需再次提醒訪員。" },
      { label: "LINE 回覆", value: "規劃中", detail: "正式串接後會回寫到訊息紀錄。" },
    ],
  },
  visitor: {
    title: "訪員個人任務工作台",
    description: "只顯示個人需要執行的訪查任務、草稿、送出狀態與公告訊息。",
    workQueueTitle: "我的訪查動態",
    workQueueHint: "顯示個人任務、草稿與已送出紀錄",
    sidePanelTitle: "訪員提醒",
    showPlanLimits: false,
    metrics: [
      { key: "my_tasks", label: "今日任務", value: "3", detail: "待訪 2 件、已訪 1 件", icon: ClipboardCheck },
      { key: "drafts", label: "離線草稿", value: "1", detail: "尚未同步送出", icon: FileText },
      { key: "photos", label: "需補照片", value: "1", detail: "請補門口或環境照片", icon: ShieldCheck },
      { key: "messages", label: "未讀公告", value: "1", detail: "督導群組提醒", icon: Clock3 },
    ],
    activityItems: [
      { author: "我的任務", content: "今日尚有 2 件待訪，請依任務順序完成訪查紀錄。", tone: "system" },
      { author: "草稿", content: "有 1 筆離線草稿尚未送出，送出前請確認照片與定位。", tone: "warning" },
      { author: "公告", content: "督導提醒：拍照上傳時系統會自動取得定位。", tone: "default" },
    ],
    focusCards: [
      { title: "我的任務", detail: "查看今日待訪、已訪與未遇案件。", href: "/visitor/tasks", icon: ClipboardCheck },
      { title: "出勤簽到", detail: "外勤掃 QR 記錄出缺勤時間。", href: "/volunteer/clock", icon: Clock3 },
      { title: "離線草稿", detail: "網路不穩時先暫存，回到線上後再送出。", href: "/visitor/drafts", icon: FileText },
      { title: "工作公告", detail: "查看頁面上方跑馬燈與督導提醒。", href: "/dashboard", icon: Clock3 },
    ],
    sidePanelRows: [
      { label: "今日任務", value: "3 件", detail: "請依任務順序完成訪查紀錄。" },
      { label: "未同步草稿", value: "1 筆", detail: "送出前請確認同意與照片欄位。" },
      { label: "未讀公告", value: "1 則", detail: "督導公告會出現在頁面上方跑馬燈。" },
    ],
  },
  auditor: {
    title: "稽核與核銷檢查工作台",
    description: "聚焦稽核規則、阻擋原因、核銷鎖定與可追溯紀錄。",
    workQueueTitle: "稽核工作摘要",
    workQueueHint: "顯示需要檢查、退回或核准的案件",
    sidePanelTitle: "稽核控制",
    showPlanLimits: false,
    metrics: [
      { key: "pending_audit", label: "待稽核", value: "4", detail: "今日待處理", icon: ShieldCheck },
      { key: "blocked", label: "已阻擋", value: "2", detail: "需退回補件", icon: FileCheck2 },
      { key: "payment_ready", label: "可核銷", value: "2", detail: "待鎖定批次", icon: FileText },
      { key: "accuracy", label: "核銷準確率", value: "93%", detail: "目標 98%", icon: BarChart3 },
    ],
    activityItems: [
      { author: "稽核", content: "阻擋項目未通過的案件不得核准，需退回補件。", tone: "warning" },
      { author: "核銷", content: "兩筆已通過案件可建立核銷草稿。", tone: "default" },
      { author: "系統", content: "稽核決策會保留不可覆寫的紀錄。", tone: "system" },
    ],
    focusCards: [
      { title: "稽核檢查", detail: "執行規則檢查並留下處理紀錄。", href: "/manager/audit", icon: ShieldCheck },
      { title: "核銷匯出", detail: "確認可核銷批次與匯出紀錄。", href: "/manager/exports", icon: FileCheck2 },
      { title: "成果 KPI", detail: "查看服務量、通過率與異常趨勢。", href: "/manager/kpi", icon: BarChart3 },
    ],
    sidePanelRows: [
      { label: "待稽核", value: "4 件", detail: "需確認同意、照片、定位與補件狀態。" },
      { label: "可核銷", value: "2 批", detail: "通過後才可鎖定並匯出。" },
      { label: "稽核紀錄", value: "保留", detail: "決策紀錄需可追溯且不可覆寫。" },
    ],
  },
  viewer: {
    title: "唯讀成果與服務觀測",
    description: "只提供總覽、成果、KPI 與基本名冊查閱，不提供修改或刪除操作。",
    workQueueTitle: "觀測摘要",
    workQueueHint: "顯示可公開或可授權查看的服務狀態",
    sidePanelTitle: "唯讀限制",
    showPlanLimits: false,
    metrics: [
      { key: "completed", label: "已完成訪查", value: "154", detail: "完成率 62%", icon: ClipboardCheck },
      { key: "kpi", label: "成果指標", value: "4", detail: "可查看項目", icon: BarChart3 },
      { key: "cases", label: "授權名冊", value: "248", detail: "只可查閱", icon: Users },
      { key: "reports", label: "成果報表", value: "2", detail: "不可匯出明細", icon: FileText },
    ],
    activityItems: [
      { author: "成果", content: "本月完成率 62%，可至 KPI 查看趨勢。", tone: "system" },
      { author: "權限", content: "唯讀角色不提供新增、修改、刪除或匯出操作。", tone: "default" },
      { author: "資料治理", content: "個資欄位依授權範圍限制顯示。", tone: "warning" },
    ],
    focusCards: [
      { title: "服務總覽", detail: "查看服務數量、狀態與趨勢。", href: "/dashboard", icon: LayoutDashboard },
      { title: "成果 KPI", detail: "查看統計圖表與成果摘要。", href: "/manager/kpi", icon: BarChart3 },
      { title: "名冊查閱", detail: "依授權範圍查看基本資料。", href: "/manager/cases", icon: Users },
    ],
    sidePanelRows: [
      { label: "資料操作", value: "不可修改", detail: "唯讀角色不顯示新增、修改與刪除按鈕。" },
      { label: "個資範圍", value: "受限", detail: "只顯示授權可查看欄位。" },
      { label: "匯出權限", value: "關閉", detail: "不可匯出個案或核銷資料。" },
    ],
  },
};

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b pb-2 last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
