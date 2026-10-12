"use client";

/**
 * Settings — how much of the free month is gone, and where to fix things.
 *
 * The meters are the important part. Duke runs on free tiers, and the failure mode without this
 * screen is a call that dies mid-sentence with a provider error that looks like a bug. Reading
 * the counters before that happens is the whole point.
 *
 * The device row is not decoration: the anonymous id is the only thing tying these friends to
 * this phone, so being able to see (and copy) it is how a lost browser gets explained.
 */

import Link from "next/link";
import { useState } from "react";
import {
  BookOpenIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CopyIcon,
  ShieldAlertIcon,
} from "lucide-react";
import { AppShell, ScreenBody } from "@/components/shell/app-shell";
import { TabBar } from "@/components/shell/tab-bar";
import { ErrorNote, Headline, MicroLabel } from "@/components/duke/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { deviceId } from "@/lib/device";
import { useSetup, useUsage } from "@/lib/queries";
import type { Usage } from "@/lib/types";

/**
 * How to phrase a budget level.
 *
 * `checkBudget` in core has exactly three: nothing used, close to the line, and full. The words
 * are the user's words, not the code's — "warn" is not English.
 */
const LEVEL_COPY: Readonly<
  Record<Usage["level"], { label: string; variant: "accent" | "ember" | "danger" }>
> = {
  ok: { label: "All good", variant: "accent" },
  warn: { label: "Running low", variant: "ember" },
  stop: { label: "Full for this month", variant: "danger" },
};

export default function SettingsPage() {
  const usage = useUsage();
  const setup = useSetup();
  const [copied, setCopied] = useState(false);

  const id = deviceId();

  async function copyDeviceId() {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <AppShell>
      <ScreenBody>
        <div className="flex flex-col gap-2">
          <MicroLabel>Settings</MicroLabel>
          <Headline>How much is left</Headline>
        </div>

        {usage.isPending ? (
          <Skeleton className="h-56 w-full" />
        ) : usage.isError ? (
          <ErrorNote>{usage.error.message}</ErrorNote>
        ) : usage.data === undefined ? null : (
          <section className="border-border bg-card flex flex-col gap-4 rounded-xl border px-4 py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  {new Date(`${usage.data.month}-01T00:00:00`).toLocaleDateString(undefined, {
                    month: "long",
                    year: "numeric",
                  })}
                </p>
                <p className="text-muted-foreground font-mono text-[10px] tracking-wide">
                  free tier · resets next month
                </p>
              </div>
              <Badge variant={LEVEL_COPY[usage.data.level].variant}>
                {LEVEL_COPY[usage.data.level].label}
              </Badge>
            </div>

            <div className="flex flex-col gap-3.5">
              {usage.data.meters.map((meter) => (
                <div key={meter.kind} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs">{meter.label}</span>
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {meter.limit === null
                        ? `${Math.round(meter.used)} ${meter.unit}`
                        : `${Math.round(meter.used)} / ${meter.limit} ${meter.unit}`}
                    </span>
                  </div>
                  <Progress
                    value={(meter.fraction ?? 0) * 100}
                    className={meter.kind === "llmTokens" ? "opacity-40" : undefined}
                  />
                </div>
              ))}
            </div>

            {usage.data.reason !== null ? (
              <p className="border-duke-ember/40 bg-duke-ember/10 text-duke-ember flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed">
                <ShieldAlertIcon className="mt-0.5 size-3.5 shrink-0" />
                {usage.data.reason}
              </p>
            ) : null}

            {usage.data.replyScale < 1 ? (
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                Answers are being kept short to save the budget ({Math.round(usage.data.replyScale * 100)}%
                of normal length).
              </p>
            ) : null}
          </section>
        )}

        <section className="flex flex-col gap-2">
          <MicroLabel>Duke</MicroLabel>
          <ul className="divide-border divide-y">
            <SettingRow
              icon={<BookOpenIcon className="size-4" />}
              title="Reading practice"
              detail="Have a passage read out loud"
              href="/practice"
            />
            <SettingRow
              icon={
                setup.data?.ready === true ? (
                  <CheckCircle2Icon className="text-primary size-4" />
                ) : (
                  <ShieldAlertIcon className="text-duke-ember size-4" />
                )
              }
              title="Keys and setup"
              detail={setup.data?.summary ?? "Checking…"}
              href="/setup"
            />
          </ul>
        </section>

        <Separator />

        <section className="flex flex-col gap-2">
          <MicroLabel>This phone</MicroLabel>
          <div className="border-border bg-card flex items-center gap-3 rounded-xl border px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm">Anonymous device id</p>
              <p className="text-muted-foreground mt-0.5 truncate font-mono text-[10px]">{id}</p>
            </div>
            <Button size="icon-sm" variant="ghost" onClick={() => void copyDeviceId()} aria-label="Copy">
              {copied ? <CheckCircle2Icon className="text-primary" /> : <CopyIcon />}
            </Button>
          </div>
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            There is no account. Your friends live with this id, in this browser. Clearing site
            data would lose them.
          </p>
        </section>
      </ScreenBody>

      <TabBar />
    </AppShell>
  );
}

function SettingRow({
  icon,
  title,
  detail,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  href: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="hover:bg-card -mx-1 flex items-center gap-3 rounded-lg px-1 py-3.5 transition-colors"
      >
        <span className="border-border bg-duke-card-2 grid size-8 shrink-0 place-items-center rounded-lg border">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm">{title}</span>
          <span className="text-muted-foreground block truncate text-xs">{detail}</span>
        </span>
        <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" />
      </Link>
    </li>
  );
}
