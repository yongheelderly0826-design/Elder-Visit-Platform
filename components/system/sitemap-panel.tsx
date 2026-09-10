import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleHelp, Flag, Map, UsersRound } from "lucide-react";
import { PageIntro } from "@/components/ui/page-intro";
import { getVisibleNavItems, navItems } from "@/lib/domain/navigation";
import { sitemapSections } from "@/lib/domain/sitemap";
import type { WorkspaceRole } from "@/lib/domain/types";

export function SitemapPanel({ role }: { role: WorkspaceRole }) {
  const visibleNavItems = getVisibleNavItems(role.capabilities, role.key);
  const visibleHrefSet = new Set(visibleNavItems.map((item) => item.href));
  const visibleSections = getVisibleSitemapSections(role);

  return (
    <div className="grid gap-4">
      <PageIntro
        icon={Map}
        title="網站流程與使用者路徑"
        description="讓管理者、督導、訪員與檢視者理解系統從註冊、加入工作空間、派案到訪查成果匯出的完整流程。"
        aside={
          <div className="rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground">
            目前角色：<span className="font-medium text-foreground">{role.label}</span>
          </div>
        }
      />

      <section className="rounded-lg border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <GuideCard
            title="先確認角色"
            description="不同角色看到的入口不同，先確認自己是管理者、督導、訪員或檢視者。"
          />
          <GuideCard
            title="再看目前階段"
            description="從註冊、治理設定、營運、稽核到成果匯出，依流程往下走。"
          />
          <GuideCard
            title="最後看權限"
            description="如果按鈕不能按，通常是角色缺少該操作權限。"
          />
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">建議操作順序</h2>
          <span className="rounded-md bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
            依角色顯示
          </span>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
          {visibleSections.map((section, index) => (
            <Link
              key={section.title}
              href={getSafeSectionHref(section.href, visibleHrefSet)}
              className="rounded-lg border bg-background p-3 text-sm transition-colors hover:bg-secondary"
            >
              <p className="text-xs font-semibold text-primary">步驟 {index + 1}</p>
              <p className="mt-2 font-medium">{section.title}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        {visibleSections.map((section, sectionIndex) => {
          const sectionHref = getSafeSectionHref(section.href, visibleHrefSet);
          const visibleLinks = section.relatedLinks.filter((link) =>
            canAccessHref(link.href, visibleHrefSet),
          );

          return (
          <details key={section.title} className="group rounded-lg border bg-card" open={sectionIndex === 0}>
            <summary className="flex cursor-pointer list-none flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between [&::-webkit-details-marker]:hidden">
              <div>
                <p className="text-xs font-semibold text-primary">
                  流程 {String(sectionIndex + 1).padStart(2, "0")}
                </p>
                <h2 className="mt-1 text-lg font-semibold">{section.title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {section.description}
                </p>
              </div>
              <span className="w-fit rounded-md bg-secondary px-3 py-2 text-xs font-medium text-muted-foreground">
                點選展開
              </span>
            </summary>

            <div className="border-t p-4">
              <div className="mb-4 flex justify-start sm:justify-end">
                <Link
                  href={sectionHref}
                  className="inline-flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                >
                  前往入口
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

            <div className="grid gap-3 text-sm md:grid-cols-3">
              <PathInfo
                icon={UsersRound}
                label="適用角色"
                value={section.roles.join("、")}
              />
              <PathInfo
                icon={Flag}
                label="開始條件"
                value={section.entryCondition}
              />
              <PathInfo
                icon={CheckCircle2}
                label="完成結果"
                value={section.completionResult}
              />
            </div>

            <ol className="mt-4 grid gap-2">
              {section.steps.map((step, index) => (
                <li key={step} className="flex gap-3 rounded-md border bg-background p-3 text-sm leading-6">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {index + 1}
                  </span>
                  <span className="text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>

            <div className="mt-4 rounded-md border bg-background p-3">
              <div className="flex items-center gap-2">
                <CircleHelp className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">常見提醒</p>
              </div>
              <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                {section.commonQuestions.map((question) => (
                  <p key={question}>{question}</p>
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {visibleLinks.map((link) => (
                <Link
                  key={`${section.title}-${link.href}`}
                  href={link.href}
                  className="rounded-md bg-secondary px-3 py-2 text-sm font-medium transition-colors hover:bg-primary hover:text-primary-foreground"
                >
                  {link.label}
                </Link>
              ))}
              {visibleLinks.length === 0 && (
                <span className="rounded-md bg-secondary px-3 py-2 text-sm text-muted-foreground">
                  此角色目前沒有可直接進入的功能頁，請依權限由管理者協助。
                </span>
              )}
            </div>
            </div>
          </details>
          );
        })}
      </section>
    </div>
  );
}

function getVisibleSitemapSections(role: WorkspaceRole) {
  if (role.key === "workspace_owner" || role.key === "workspace_manager") {
    return sitemapSections;
  }

  return sitemapSections.filter((section) => section.roles.includes(role.label));
}

function canAccessHref(href: string, visibleHrefSet: Set<string>) {
  if (visibleHrefSet.has(href)) {
    return true;
  }

  const navItem = navItems.find((item) => item.href === href);
  return !navItem;
}

function getSafeSectionHref(href: string, visibleHrefSet: Set<string>) {
  return canAccessHref(href, visibleHrefSet) ? href : "/dashboard";
}

function GuideCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

function PathInfo({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UsersRound;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 text-sm leading-6">{value}</p>
    </div>
  );
}
