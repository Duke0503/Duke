"use client";

/**
 * Setup — the checklist for the last step of the project.
 *
 * This screen exists because pasting keys is the only manual step, and getting it wrong is
 * boring rather than interesting: a key with a typo, a key pasted into the wrong variable, a
 * key that is right but a region that is wrong. So instead of guessing, the API is asked what
 * it can see, and the answer is rendered with the place each value is copied from.
 *
 * Secrets are never echoed. A non-secret value is shown, which is how "eastus" is confirmed
 * against "westus" without ever printing a key.
 */

import { useState } from "react";
import {
  CheckCircle2Icon,
  CircleDashedIcon,
  ExternalLinkIcon,
  RotateCwIcon,
  ServerIcon,
} from "lucide-react";
import { AppShell, ScreenBody } from "@/components/shell/app-shell";
import { TabBar } from "@/components/shell/tab-bar";
import { ErrorNote, Headline, MicroLabel } from "@/components/duke/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "cn";
import { useSetup } from "@/lib/queries";
import type { KeyStatus, SetupGroup } from "@/lib/types";

export default function SetupPage() {
  const setup = useSetup();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const data = setup.data;

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      setCopiedKey(null);
    }
  }

  return (
    <AppShell>
      <ScreenBody>
        <div className="flex flex-col gap-2">
          <MicroLabel>Setup · {data?.requiredCount ?? 9} required keys</MicroLabel>
          <Headline>
            {data === undefined
              ? "Checking the keys"
              : data.ready
                ? "Everything is connected"
                : "A few keys left to paste"}
          </Headline>
        </div>

        {setup.isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : setup.isError ? (
          <div className="flex flex-col gap-3">
            <ErrorNote>
              Could not reach the API. Start it with{" "}
              <code className="font-mono text-[11px]">pnpm --filter @duke/api serve</code>, then
              check again.
            </ErrorNote>
            <p className="text-muted-foreground text-xs leading-relaxed">
              {setup.error.message}
            </p>
            <Button variant="secondary" className="w-full" onClick={() => void setup.refetch()}>
              <RotateCwIcon />
              Check again
            </Button>
          </div>
        ) : data === undefined ? null : (
          <>
            <div
              className={cn(
                "flex items-start gap-3 rounded-xl border px-4 py-3.5",
                data.ready
                  ? "border-primary/40 bg-primary/5"
                  : "border-duke-ember/40 bg-duke-ember/10",
              )}
            >
              <ServerIcon
                className={cn("mt-0.5 size-4 shrink-0", data.ready ? "text-primary" : "text-duke-ember")}
              />
              <div className="min-w-0">
                <p className="text-sm">{data.summary}</p>
                {!data.ready && data.missing.length > 0 ? (
                  <p className="text-muted-foreground mt-1 font-mono text-[10px] leading-relaxed break-words">
                    {data.missing.join("  ")}
                  </p>
                ) : null}
              </div>
            </div>

            <Button
              variant="secondary"
              className="w-full"
              onClick={() => void setup.refetch()}
            >
              <RotateCwIcon />
              Check again
            </Button>

            <div className="flex flex-col gap-5">
              {data.groups.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  copiedKey={copiedKey}
                  onCopy={copy}
                />
              ))}
            </div>

            <Separator />

            <section className="flex flex-col gap-2">
              <MicroLabel>How this works</MicroLabel>
              <ol className="text-muted-foreground flex flex-col gap-2 text-xs leading-relaxed">
                <li>1. Put each value in <code className="font-mono">.env</code> at the top of the repo.</li>
                <li>2. Restart the API — the environment is read once, at boot.</li>
                <li>3. Come back here and check again.</li>
              </ol>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                Nothing here is stored in the browser, and no secret is ever sent back to this
                page. <code className="font-mono">.env.example</code> lists every name.
              </p>
            </section>
          </>
        )}
      </ScreenBody>

      <TabBar />
    </AppShell>
  );
}

function GroupCard({
  group,
  copiedKey,
  onCopy,
}: {
  group: SetupGroup;
  copiedKey: string | null;
  onCopy: (value: string, key: string) => void | Promise<void>;
}) {
  return (
    <section className="border-border bg-card flex flex-col gap-3 rounded-xl border px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-sm font-semibold">{group.title}</p>
          <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">{group.why}</p>
        </div>
        <Badge variant={group.complete ? "accent" : "default"}>
          {group.complete ? "ready" : "needed"}
        </Badge>
      </div>

      <ul className="flex flex-col gap-1.5">
        {group.keys.map((key) => (
          <KeyRow
            key={key.key}
            status={key}
            copied={copiedKey === key.key}
            onCopy={onCopy}
          />
        ))}
      </ul>

      <a
        href={group.url}
        target="_blank"
        rel="noreferrer"
        className="text-muted-foreground hover:text-primary flex w-fit items-center gap-1.5 font-mono text-[10px] tracking-wide transition-colors"
      >
        {group.url.replace(/^https?:\/\//, "")}
        <ExternalLinkIcon className="size-3" />
      </a>
    </section>
  );
}

function KeyRow({
  status,
  copied,
  onCopy,
}: {
  status: KeyStatus;
  copied: boolean;
  onCopy: (value: string, key: string) => void | Promise<void>;
}) {
  const done = status.set && !status.placeholder;

  return (
    <li className="border-border flex items-start gap-2.5 rounded-lg border px-3 py-2.5">
      {done ? (
        <CheckCircle2Icon className="text-primary mt-0.5 size-3.5 shrink-0" />
      ) : (
        <CircleDashedIcon
          className={cn("mt-0.5 size-3.5 shrink-0", status.optional ? "text-muted-foreground" : "text-duke-ember")}
        />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <code className="truncate font-mono text-[11px]">{status.key}</code>
          {status.optional ? (
            <span className="text-muted-foreground font-mono text-[9px] tracking-wider uppercase">
              optional
            </span>
          ) : null}
          {status.placeholder ? (
            <span className="text-duke-ember font-mono text-[9px] tracking-wider uppercase">
              placeholder
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-0.5 text-[11px] leading-relaxed">{status.where}</p>

        {status.value !== null && status.value.length > 0 ? (
          <button
            type="button"
            onClick={() => void onCopy(status.value ?? "", status.key)}
            className="text-muted-foreground hover:text-foreground mt-1 font-mono text-[10px] transition-colors"
          >
            = {status.value} {copied ? "· copied" : ""}
          </button>
        ) : null}
      </div>
    </li>
  );
}
