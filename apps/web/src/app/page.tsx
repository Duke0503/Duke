import { MOODS, MOOD_TO_STYLE } from "@duke/core";

/**
 * M0 placeholder. Proves three things at once:
 *   1. Tailwind v4 is wired,
 *   2. the Duke tokens resolve,
 *   3. the workspace package `@duke/core` is importable from the web app.
 */
export default function Home() {
  const styled = MOODS.filter((mood) => MOOD_TO_STYLE[mood].style !== null);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col gap-6 p-6">
      <p className="font-mono text-xs tracking-widest text-[var(--accent)]">// DUKE</p>

      <h1 className="font-display text-3xl font-semibold">Your English-speaking friend.</h1>

      <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--card)] p-4">
        <p className="font-mono text-[11px] tracking-widest text-[var(--ink-2)]">// DESIGN TOKENS</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-medium text-[var(--accent-ink)]">
            accent
          </span>
          <span className="rounded-full bg-[var(--card-2)] px-3 py-1 text-xs text-[var(--ink)]">card-2</span>
          <span className="rounded-full bg-[var(--ember)] px-3 py-1 text-xs text-[var(--accent-ink)]">ember</span>
          <span className="rounded-full bg-[var(--danger)] px-3 py-1 text-xs text-white">danger</span>
        </div>
      </div>

      <div className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--card)] p-4">
        <p className="font-mono text-[11px] tracking-widest text-[var(--ink-2)]">// CORE IS CONNECTED</p>
        <p className="mt-2 text-sm text-[var(--ink-2)]">
          {MOODS.length} moods, {styled.length} with a real Azure emotion.
        </p>
      </div>

      <p className="mt-auto font-mono text-[11px] text-[var(--ink-2)]">
        // M0 SCAFFOLD — SCREENS COME IN M4
      </p>
    </main>
  );
}
