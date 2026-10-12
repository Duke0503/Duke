"use client";

/**
 * The frame every screen lives in.
 *
 * Duke is a phone app that happens to run in a browser. On a phone this is simply the screen.
 * On a laptop it is a 430px column with a hairline down each side, so the layout is the one
 * that was actually designed instead of a stretched-out page with a floating button.
 *
 * `tabular` is a small thing that matters for a console look: numbers that change (the call
 * timer, the usage meters) must not jiggle the layout as the digits change.
 */

import type { ReactNode } from "react";
import { cn } from "cn";

export function AppShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="flex min-h-dvh justify-center bg-black/40">
      <div
        className={cn(
          "bg-background border-border relative flex w-full max-w-[430px] flex-col border-x",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** The padded area between the top of the screen and the tab bar. */
export function ScreenBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <main className={cn("flex min-h-0 flex-1 flex-col gap-5 px-5 pt-4 pb-28", className)}>
      {children}
    </main>
  );
}

/** A screen with no tab bar — the live call takes the whole phone. */
export function BareScreen({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-dvh justify-center bg-black/40", className)}>
      <div className="bg-background relative flex min-h-dvh w-full max-w-[430px] flex-col">
        {children}
      </div>
    </div>
  );
}
