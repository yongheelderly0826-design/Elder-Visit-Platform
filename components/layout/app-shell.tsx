import type { ReactNode } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, ChevronRight, LogOut, Search } from "lucide-react";
import { PermissionProvider } from "@/components/auth/permission-provider";
import { AnnouncementMarquee } from "@/components/communication/announcement-marquee";
import { BrandLogo } from "@/components/layout/brand-logo";
import { BottomNav } from "@/components/layout/bottom-nav";
import { SponsorLogoMark } from "@/components/sponsor/sponsor-logo";
import { getCurrentWorkspace } from "@/lib/domain/mock-data";
import { getRoleByKey } from "@/lib/domain/permissions";
import { getPrimarySponsor } from "@/lib/domain/sponsors";
import { getVisibleNavItems, navGroups, type NavKey } from "@/lib/domain/navigation";
import type { WorkspaceRoleKey } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export async function AppShell({
  active,
  children,
}: {
  active: NavKey;
  children: ReactNode;
}) {
  const workspace = getCurrentWorkspace();
  const cookieStore = await cookies();
  const roleCookie = cookieStore.get("demo_role")?.value;
  if (!roleCookie) {
    redirect("/login");
  }
  const roleKey = roleCookie as WorkspaceRoleKey;
  const role = getRoleByKey(roleKey);
  const items = getVisibleNavItems(role.capabilities, roleKey);
  const activeGroup = items.find((item) => item.key === active)?.group;
  const sponsor = getPrimarySponsor();
  const canManageSponsors = role.capabilities.includes("sponsors.manage");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r bg-card lg:flex lg:flex-col">
        <div className="border-b px-4 py-4">
          <div className="flex items-center gap-3">
            <BrandLogo size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">公益治理後台</p>
              <p className="truncate text-xs text-muted-foreground">{workspace.name}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {items
            .filter((item) => item.group === "daily")
            .map((item) => {
              const Icon = item.icon;
              const isActive = item.key === active;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={cn(
                    "mb-1 flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                    isActive && "bg-primary/10 text-primary",
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}

          {navGroups.map((group) => {
            if (group.key === "daily") {
              return null;
            }
            const groupItems = items.filter((item) => item.group === group.key);
            if (groupItems.length === 0) {
              return null;
            }
            const isOpen = group.key === activeGroup;

            return (
              <details key={group.key} className="group mb-2" open={isOpen}>
                <summary className="flex h-9 cursor-pointer list-none items-center justify-between rounded-md px-3 text-xs font-semibold uppercase text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground [&::-webkit-details-marker]:hidden">
                  <span>{group.label}</span>
                  <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                </summary>
                <div className="mt-1 space-y-1">
                  {groupItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = item.key === active;
                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        className={cn(
                          "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                          isActive && "bg-primary/10 text-primary",
                        )}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </nav>

        <div className="border-t p-4">
          <div className="rounded-md bg-secondary p-3">
            <p className="text-xs text-muted-foreground">目前角色</p>
            <p className="mt-1 text-sm font-semibold">{role.label}</p>
          </div>
          <a
            href="/api/auth/logout"
            className="mt-3 flex h-10 items-center justify-center gap-2 rounded-md border bg-background text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            登出並切換角色
          </a>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 lg:hidden">
              <BrandLogo size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">公益治理後台</p>
                <p className="truncate text-xs text-muted-foreground">{workspace.name}</p>
              </div>
            </div>

            <div className="hidden min-w-0 flex-1 items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm text-muted-foreground md:flex lg:max-w-xl">
              <Search className="h-4 w-4 shrink-0" />
              <span className="truncate">搜尋名冊、案號、訪員、匯出批次</span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              {canManageSponsors && (
                <div className="hidden items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs md:flex">
                  <SponsorLogoMark sponsor={sponsor} size="sm" />
                  <span className="text-muted-foreground">公益夥伴</span>
                  <span className="max-w-24 truncate font-medium">{sponsor.shortName}</span>
                </div>
              )}
              <button className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:text-foreground">
                <Bell className="h-5 w-5" />
              </button>
              <div className="hidden h-10 items-center gap-2 rounded-full bg-secondary px-3 text-sm font-medium sm:flex">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                  管
                </span>
                <span>{role.label}</span>
              </div>
            </div>
          </div>
        </header>

        <PermissionProvider capabilities={role.capabilities}>
          <main className="safe-page-bottom mx-auto flex w-full max-w-[112rem] flex-col gap-4 px-3 py-4 sm:px-5 lg:px-6 xl:px-8 lg:pb-8">
            <AnnouncementMarquee />
            {children}
          </main>
        </PermissionProvider>
      </div>

      <BottomNav
        active={active}
        capabilities={role.capabilities}
        roleKey={roleKey}
        roleLabel={role.label}
      />
    </div>
  );
}
