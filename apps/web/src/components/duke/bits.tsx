"use client";

/**
 * The small signature pieces every screen reuses.
 *
 * The `// LABEL` micro-label in mono, the avatar with an initial for a face, the animated voice
 * line, and the empty state. They are here rather than in each screen so the app cannot grow
 * four slightly different versions of "nothing here yet".
 */

import type { ReactNode } from "react";
import { cn } from "cn";

/** `// YOUR CREW` — the technical-label voice of the UI. */
export function MicroLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase", className)}>
      <span className="text-primary/60">//</span> {children}
    </p>
  );
}

/** The big left-aligned headline. Two short lines beat one long one on a phone. */
export function Headline({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1 className={cn("font-display text-[28px] leading-[1.15] font-semibold tracking-tight", className)}>
      {children}
    </h1>
  );
}

const AVATAR_TINTS = [
  "bg-duke-sage/15 text-duke-sage",
  "bg-duke-ember/15 text-duke-ember",
  "bg-duke-moss/15 text-duke-moss",
  "bg-primary/15 text-primary",
] as const;

/** A stable tint per name, so a friend keeps the same colour between visits. */
function tintFor(name: string): string {
  let sum = 0;
  for (let i = 0; i < name.length; i += 1) sum += name.charCodeAt(i);
  return AVATAR_TINTS[sum % AVATAR_TINTS.length] as string;
}

export function Avatar({
  name,
  url,
  size = "md",
  className,
}: {
  name: string;
  url?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "size-9 text-sm",
    md: "size-11 text-base",
    lg: "size-20 text-2xl",
  } as const;

  const shared = cn(
    "flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border font-display font-semibold",
    sizes[size],
    url ? "bg-duke-card-2" : tintFor(name),
    className,
  );

  if (url) {
    // A plain <img>, not next/image: avatars are URLs the user pasted, and next/image would
    // need a domain allow-list that nobody can fill in from a phone.
    return <img src={url} alt="" className={cn(shared, "object-cover")} />;
  }

  return (
    <div className={shared} aria-hidden>
      {name.trim().charAt(0).toUpperCase() || "?"}
    </div>
  );
}

/**
 * The signature voice line: a row of bars that move while the character talks.
 *
 * `live` is the only input. A still line would look broken, and a CSS animation is cheaper and
 * calmer than a canvas or a real audio analyser.
 */
export function VoiceLine({
  live = false,
  className,
}: {
  live?: boolean;
  className?: string;
}) {
  const BARS = [8, 16, 26, 14, 30, 20, 10, 24, 18, 28, 12, 22];
  return (
    <div className={cn("flex h-8 items-center gap-[3px]", className)} aria-hidden>
      {BARS.map((height, index) => (
        <span
          key={index}
          className={cn(
            "w-[3px] rounded-full",
            live ? "bg-primary animate-voice" : "bg-border",
          )}
          style={{
            height,
            animationDelay: live ? `${(index % 6) * 110}ms` : undefined,
          }}
        />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-border bg-card flex flex-col items-center gap-3 rounded-xl border border-dashed px-5 py-8 text-center">
      <p className="font-display text-base font-semibold">{title}</p>
      <p className="text-muted-foreground max-w-[36ch] text-sm leading-relaxed">{body}</p>
      {action}
    </div>
  );
}

/** A quiet inline error. Used on every screen, so the look is the same everywhere. */
export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="border-duke-danger/40 bg-duke-danger/10 text-duke-danger rounded-lg border px-3 py-2.5 text-sm leading-relaxed"
    >
      {children}
    </div>
  );
}
