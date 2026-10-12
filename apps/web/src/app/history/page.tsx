"use client";

/**
 * History — every call, newest first.
 *
 * An open session is shown at the top with a marker rather than hidden. It is almost always a
 * call that is still happening on another tab, or one whose ending never landed; either way
 * showing it is more honest than a list that quietly disagrees with the database.
 */

import Link from "next/link";
import { ChevronRightIcon, PhoneIcon } from "lucide-react";
import { AppShell, ScreenBody } from "@/components/shell/app-shell";
import { TabBar } from "@/components/shell/tab-bar";
import { Avatar, EmptyState, ErrorNote, Headline, MicroLabel } from "@/components/duke/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDay, formatDuration, formatTime, moodLabel, plural } from "@/lib/format";
import { useSessions } from "@/lib/queries";

export default function HistoryPage() {
  const sessions = useSessions(50);
  const calls = sessions.data ?? [];

  return (
    <AppShell>
      <ScreenBody>
        <div className="flex flex-col gap-2">
          <MicroLabel>
            History · {calls.length === 0 ? "nothing yet" : plural(calls.length, "call")}
          </MicroLabel>
          <Headline>Every time we talked</Headline>
        </div>

        {sessions.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : sessions.isError ? (
          <ErrorNote>{sessions.error.message}</ErrorNote>
        ) : calls.length === 0 ? (
          <EmptyState
            title="No calls yet"
            body="When you finish a call, Duke writes down what you talked about, what you fixed, and the new words you met."
            action={
              <Button asChild size="lg">
                <Link href="/">
                  <PhoneIcon />
                  Start a call
                </Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-border divide-y">
            {calls.map((call) => (
              <li key={call.id}>
                <Link
                  href={`/history/${call.id}`}
                  className="hover:bg-card -mx-1 flex items-center gap-3 rounded-lg px-1 py-3.5 transition-colors"
                >
                  <Avatar name={call.characterName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{call.characterName}</p>
                      {call.open ? (
                        <Badge variant="accent">Open</Badge>
                      ) : call.mood !== null ? (
                        <Badge>{moodLabel(call.mood)}</Badge>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground mt-0.5 truncate text-xs">
                      {call.summary ?? call.topic ?? "No summary"}
                    </p>
                    <p className="text-muted-foreground mt-0.5 font-mono text-[10px] tracking-wide">
                      {formatDay(call.startedAt)} · {formatTime(call.startedAt)} ·{" "}
                      {formatDuration(call.durationSec)}
                    </p>
                  </div>
                  <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </ScreenBody>

      <TabBar />
    </AppShell>
  );
}
