"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClockIcon, SettingsIcon, UsersIcon, HomeIcon, type LucideIcon } from "lucide-react";
import { cn } from "cn";

/**
 * The four places Duke has: Home, Crew, History, Settings.
 *
 * Four, not five, because a call is not a place you navigate to — it starts from Home or from
 * a row in Crew, and it takes the whole screen while it lasts. The active tab is decided from
 * the path, not from state, so a deep link or a refresh still lights the right one.
 */

const TABS: readonly { href: string; label: string; icon: LucideIcon; match: (path: string) => boolean }[] = [
  { href: "/", label: "Home", icon: HomeIcon, match: (path) => path === "/" },
  { href: "/crew", label: "Crew", icon: UsersIcon, match: (path) => path.startsWith("/crew") || path.startsWith("/create") },
  { href: "/history", label: "History", icon: ClockIcon, match: (path) => path.startsWith("/history") },
  { href: "/settings", label: "Settings", icon: SettingsIcon, match: (path) => path.startsWith("/settings") || path.startsWith("/setup") },
];

export function TabBar() {
  const pathname = usePathname() ?? "/";

  return (
    <nav
      className="border-border bg-background/95 fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-[430px] border-t backdrop-blur-sm"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Main"
    >
      {TABS.map((tab) => {
        const active = tab.match(pathname);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 pt-2.5 pb-2 transition-colors",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-5" strokeWidth={active ? 2.4 : 1.8} />
            <span className="font-mono text-[10px] tracking-[0.12em] uppercase">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
