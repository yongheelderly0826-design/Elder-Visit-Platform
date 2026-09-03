"use client";

import { useState } from "react";
import Link from "next/link";
import { LogOut, Menu, X } from "lucide-react";
import { getVisibleNavItems, navGroups, type NavItem, type NavKey } from "@/lib/domain/navigation";
import type { Capability } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

const primaryNavOrder: NavKey[] = ["dashboard", "tasks", "clock", "assignments", "cases"];

function isNavItem(item: NavItem | undefined): item is NavItem {
  return Boolean(item);
}

export function BottomNav({
  active,
  capabilities,
  roleLabel,
}: {
  active: NavKey;
  capabilities: Capability[];
  roleLabel: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const items = getVisibleNavItems(capabilities);
  const primaryItems = primaryNavOrder
    .map((key) => items.find((item) => item.key === key))
    .filter(isNavItem)
    .slice(0, 4);
  const primaryKeys = new Set(primaryItems.map((item) => item.key));
  const secondaryItems = items.filter((item) => !primaryKeys.has(item.key));
  const isActiveInMore = secondaryItems.some((item) => item.key === active);
  const secondaryGroups = navGroups.filter((group) =>
    secondaryItems.some((item) => item.group === group.key),
  );
  const activeGroup =
    secondaryItems.find((item) => item.key === active)?.group ?? secondaryGroups[0]?.key ?? null;
  const [openGroupKey, setOpenGroupKey] = useState<typeof activeGroup | null>(activeGroup);

  return (
    <div className="lg:hidden">
      {isOpen && (
        <button
          aria-label="關閉功能選單"
          className="fixed inset-0 z-20 bg-foreground/10 backdrop-blur-[1px]"
          type="button"
          onClick={() => setIsOpen(false)}
        />
      )}

      <section
        className={cn(
          "safe-bottom fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 max-h-[70dvh] overflow-hidden border-t bg-card shadow-[0_-12px_32px_rgba(15,23,42,0.14)] transition-transform duration-200 sm:mx-auto sm:max-w-md sm:rounded-t-lg sm:border-x",
          isOpen ? "translate-y-0" : "pointer-events-none translate-y-[calc(100%+4rem)]",
        )}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold">全部功能</p>
            <p className="text-xs text-muted-foreground">依工作流程分組顯示</p>
          </div>
          <button
            aria-label="關閉功能選單"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-muted-foreground"
            type="button"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex max-h-[calc(70dvh-4.5rem)] flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {navGroups.map((group) => {
              if (group.key === "daily") {
                return null;
              }
              const groupItems = secondaryItems.filter((item) => item.group === group.key);
              if (groupItems.length === 0) {
                return null;
              }

              const isGroupOpen = openGroupKey === group.key;

              return (
                <section key={group.key} className="mb-2 rounded-lg border bg-background">
                  <button
                    type="button"
                    aria-expanded={isGroupOpen}
                    className="flex h-10 w-full items-center justify-between px-3 text-sm font-semibold"
                    onClick={() =>
                      setOpenGroupKey((current) => (current === group.key ? null : group.key))
                    }
                  >
                    <span>{group.label}</span>
                    <span className="text-xs font-medium text-muted-foreground">
                      {groupItems.length}
                    </span>
                  </button>
                  {isGroupOpen && (
                  <div className="grid grid-cols-3 gap-2 border-t p-2">
                    {groupItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = item.key === active;

                      return (
                        <Link
                          key={item.key}
                          href={item.href}
                          className={cn(
                            "flex min-h-16 flex-col items-center justify-center gap-1 rounded-md px-2 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                            isActive && "bg-primary/10 text-primary",
                          )}
                          onClick={() => setIsOpen(false)}
                        >
                          <Icon className="h-5 w-5 shrink-0" />
                          <span className="line-clamp-2 leading-tight">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                  )}
                </section>
              );
            })}
          </div>
          <div className="border-t bg-card p-3">
            <div className="mb-2 rounded-md bg-secondary px-3 py-2">
              <p className="text-xs text-muted-foreground">目前角色</p>
              <p className="mt-0.5 text-sm font-semibold">{roleLabel}</p>
            </div>
            <a
              href="/api/auth/logout"
              className="flex h-10 items-center justify-center gap-2 rounded-md border bg-background text-sm font-medium text-muted-foreground"
            >
              <LogOut className="h-4 w-4" />
              登出並切換角色
            </a>
          </div>
        </div>
      </section>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 px-2">
          {primaryItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === active;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "flex min-w-0 flex-col items-center justify-center gap-1 rounded-md text-xs text-muted-foreground",
                isActive && "bg-primary/10 text-primary",
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
          })}

          <button
            aria-expanded={isOpen}
            aria-label={isOpen ? "關閉更多功能" : "開啟更多功能"}
            className={cn(
              "flex min-w-0 flex-col items-center justify-center gap-1 rounded-md text-xs text-muted-foreground",
              (isOpen || isActiveInMore) && "bg-primary/10 text-primary",
            )}
            type="button"
            onClick={() => setIsOpen((current) => !current)}
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            <span className="truncate">更多</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
