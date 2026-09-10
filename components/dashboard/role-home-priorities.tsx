import Link from "next/link";
import {
  BarChart3,
  ClipboardCheck,
  FileCheck2,
  FileText,
  LayoutDashboard,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { WorkspaceRoleKey } from "@/lib/domain/types";

const rolePriorities: Record<
  WorkspaceRoleKey,
  {
    eyebrow: string;
    title: string;
    items: Array<{
      title: string;
      detail: string;
      href: string;
      icon: typeof LayoutDashboard;
    }>;
  }
> = {
  workspace_owner: {
    eyebrow: "今天先看",
    title: "組織治理的 3 個重點",
    items: [
      {
        title: "先看權限與成員",
        detail: "確認加入申請、角色分配與治理風險。",
        href: "/workspace/users",
        icon: Users,
      },
      {
        title: "再看稽核阻擋",
        detail: "優先掌握會影響核銷與成果輸出的阻塞案件。",
        href: "/manager/audit",
        icon: ShieldCheck,
      },
      {
        title: "最後看方案限制",
        detail: "確認工作空間設定、方案使用量與公告露出。",
        href: "/workspace/settings",
        icon: LayoutDashboard,
      },
    ],
  },
  workspace_manager: {
    eyebrow: "今天先做",
    title: "承辦管理的 4 個步驟",
    items: [
      {
        title: "先分派今天任務",
        detail: "高風險案件先派，避免後段流程一起延誤。",
        href: "/manager/assignments",
        icon: ClipboardCheck,
      },
      {
        title: "再追待補件",
        detail: "把定位、同意與照片缺漏先補齊。",
        href: "/manager/notifications",
        icon: FileCheck2,
      },
      {
        title: "接著確認稽核",
        detail: "讓可通過案件盡快往核銷階段移動。",
        href: "/manager/audit",
        icon: ShieldCheck,
      },
      {
        title: "最後處理匯出",
        detail: "只把已通過資料進入核銷與成果匯出。",
        href: "/manager/exports",
        icon: FileText,
      },
    ],
  },
  supervisor: {
    eyebrow: "今天先判斷",
    title: "督導要先處理的 3 件事",
    items: [
      {
        title: "先處理高風險",
        detail: "急迫健康或資料異常先做人工判斷。",
        href: "/manager/notifications",
        icon: ShieldCheck,
      },
      {
        title: "再看補件與回覆",
        detail: "確認訪員已補正哪些案件，哪些仍待追蹤。",
        href: "/manager/audit",
        icon: FileCheck2,
      },
      {
        title: "最後覆核派案",
        detail: "處理需要主管判斷的容量與資格提醒。",
        href: "/manager/assignments",
        icon: ClipboardCheck,
      },
    ],
  },
  visitor: {
    eyebrow: "今天先完成",
    title: "訪員的 3 個任務",
    items: [
      {
        title: "先出示訪員證",
        detail: "首頁顯示個人 QR，給櫃檯掃或自己掃櫃檯 QR。",
        href: "/visitor/home",
        icon: FileCheck2,
      },
      {
        title: "再看今日任務",
        detail: "確認先訪哪幾案、是否有續訪案件。",
        href: "/visitor/tasks",
        icon: ClipboardCheck,
      },
      {
        title: "最後看核銷",
        detail: "訪視通過後，可查看核銷是否鎖定通過。",
        href: "/visitor/payments",
        icon: FileText,
      },
    ],
  },
  auditor: {
    eyebrow: "今天先檢查",
    title: "稽核工作的 3 個焦點",
    items: [
      {
        title: "先看阻擋案件",
        detail: "確認哪些案件不得通過，必須退回補件。",
        href: "/manager/audit",
        icon: ShieldCheck,
      },
      {
        title: "再看可核銷案件",
        detail: "確認可以建立或鎖定核銷的案件。",
        href: "/manager/exports",
        icon: FileText,
      },
      {
        title: "最後看成果趨勢",
        detail: "檢查通過率、異常與服務成果是否穩定。",
        href: "/manager/kpi",
        icon: BarChart3,
      },
    ],
  },
  viewer: {
    eyebrow: "今天先閱讀",
    title: "檢視者可看的 3 件事",
    items: [
      {
        title: "先看服務總覽",
        detail: "快速理解目前整體服務進度。",
        href: "/dashboard",
        icon: LayoutDashboard,
      },
      {
        title: "再看成果 KPI",
        detail: "查看授權範圍內的成果指標與趨勢。",
        href: "/manager/kpi",
        icon: BarChart3,
      },
      {
        title: "最後看名冊",
        detail: "依授權範圍查閱基本服務資料。",
        href: "/manager/cases",
        icon: Users,
      },
    ],
  },
};

export function RoleHomePriorities({ roleKey }: { roleKey: WorkspaceRoleKey }) {
  const priority = rolePriorities[roleKey];

  return (
    <section className="rounded-lg border bg-card p-4">
      <p className="text-sm font-medium text-primary">{priority.eyebrow}</p>
      <h2 className="mt-1 text-base font-semibold">{priority.title}</h2>
      <div className="mt-4 grid gap-3 lg:grid-cols-3 xl:grid-cols-4">
        {priority.items.map((item) => {
          const Icon = item.icon;

          return (
            <Link key={item.title} href={item.href} className="rounded-lg border bg-background p-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </span>
              <p className="mt-3 text-sm font-semibold">{item.title}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.detail}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
