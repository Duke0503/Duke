import { MOODS, MOOD_TO_STYLE } from "@duke/core";
import { Button } from "@/components/ui/button";

/**
 * M0 placeholder — a wiring check, not a screen. It proves five things:
 *   1. Tailwind v4 is running,
 *   2. the Duke palette reaches the shadcn variable names (`bg-primary` is our
 *      green, `bg-card` is our card, `bg-accent` is our card-2 — not shadcn grey),
 *   3. `@duke/core` is importable from the web app,
 *   4. the 3 fonts load,
 *   5. a shadcn component renders.
 *
 * The real screens land in M4. Delete this file then.
 */

const SWATCHES = [
  { name: "background", className: "bg-background", ink: "text-foreground" },
  { name: "card", className: "bg-card", ink: "text-foreground" },
  { name: "card-2 / accent", className: "bg-accent", ink: "text-accent-foreground" },
  { name: "primary", className: "bg-primary", ink: "text-primary-foreground" },
  { name: "ember", className: "bg-duke-ember", ink: "text-primary-foreground" },
  { name: "sage", className: "bg-duke-sage", ink: "text-primary-foreground" },
  { name: "moss", className: "bg-duke-moss", ink: "text-primary-foreground" },
  { name: "danger", className: "bg-destructive", ink: "text-primary-foreground" },
];

export default function Home() {
  const styled = MOODS.filter((mood) => MOOD_TO_STYLE[mood].style !== null);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col gap-6 p-6">
      <p className="font-mono text-xs tracking-widest text-primary">// DUKE</p>

      <h1 className="font-display text-3xl font-semibold text-foreground">
        Your English-speaking friend.
      </h1>

      <section className="rounded-xl border border-border bg-card p-4">
        <p className="font-mono text-[11px] tracking-widest text-muted-foreground">// DESIGN TOKENS</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {SWATCHES.map((swatch) => (
            <div
              key={swatch.name}
              className={`${swatch.className} ${swatch.ink} rounded-md border border-border px-2.5 py-2 font-mono text-[10px] tracking-wide`}
            >
              {swatch.name}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <p className="font-mono text-[11px] tracking-widest text-muted-foreground">// SHADCN</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button>Start talking</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">End call</Button>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <p className="font-mono text-[11px] tracking-widest text-muted-foreground">// CORE IS CONNECTED</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {MOODS.length} moods, {styled.length} with a real Azure emotion.
        </p>
      </section>

      <p className="mt-auto font-mono text-[11px] text-muted-foreground">
        // M0 SCAFFOLD — SCREENS COME IN M4
      </p>
    </main>
  );
}
