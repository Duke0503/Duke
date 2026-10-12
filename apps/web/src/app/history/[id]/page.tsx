"use client";

/**
 * Session Detail — the notes from one call.
 *
 * Order matters here. The summary comes first because that is what you actually want to
 * remember; the corrections and new words next, because they are the study material; the full
 * transcript last, because it is the long part and you usually do not need it.
 *
 * The friend's name is allowed to be missing (the character could have been deleted). The
 * transcript is still yours, so the page still works.
 */

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeftIcon, MessageSquareIcon, RepeatIcon } from "lucide-react";
import { AppShell, ScreenBody } from "@/components/shell/app-shell";
import { Avatar, ErrorNote, Headline, MicroLabel } from "@/components/duke/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDay, formatDuration, formatTime, moodLabel } from "@/lib/format";
import { useSession } from "@/lib/queries";

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : undefined;
  const detail = useSession(id);
  const router = useRouter();

  const data = detail.data;

  return (
    <AppShell>
      <ScreenBody>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-muted-foreground hover:text-foreground -ml-1 flex w-fit items-center gap-1.5 text-xs"
        >
          <ArrowLeftIcon className="size-3.5" />
          History
        </button>

        {detail.isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : detail.isError ? (
          <ErrorNote>{detail.error.message}</ErrorNote>
        ) : data === undefined ? null : (
          <>
            <Card className="gap-3 px-4 py-4">
              <div className="flex items-center gap-3.5">
                <Avatar name={data.character?.name ?? data.session.characterName} />
                <div className="min-w-0 flex-1">
                  <Headline className="truncate text-xl">
                    {data.character?.name ?? data.session.characterName}
                  </Headline>
                  <p className="text-muted-foreground truncate text-xs capitalize">
                    {data.character?.role ?? "Your friend"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] tracking-wide text-muted-foreground">
                <span>{formatDay(data.session.startedAt)}</span>
                <span>·</span>
                <span>{formatTime(data.session.startedAt)}</span>
                <span>·</span>
                <span>{formatDuration(data.session.durationSec)}</span>
                {data.session.mood !== null ? (
                  <>
                    <span>·</span>
                    <Badge>{moodLabel(data.session.mood)}</Badge>
                  </>
                ) : null}
                {data.session.open ? <Badge variant="accent">Still open</Badge> : null}
              </div>
            </Card>

            {data.session.summary !== null ? (
              <section className="flex flex-col gap-2">
                <MicroLabel>What happened</MicroLabel>
                <p className="text-sm leading-relaxed">{data.session.summary}</p>
              </section>
            ) : null}

            {data.corrections.length > 0 ? (
              <section className="flex flex-col gap-3">
                <MicroLabel>Fixed · {data.corrections.length}</MicroLabel>
                <ul className="flex flex-col gap-2">
                  {data.corrections.map((correction) => (
                    <li
                      key={correction.id}
                      className="border-border bg-card rounded-lg border px-3.5 py-3"
                    >
                      <p className="text-muted-foreground text-xs line-through">{correction.said}</p>
                      <p className="text-primary mt-1 text-sm">{correction.fixed}</p>
                      {correction.note !== null ? (
                        <p className="text-muted-foreground mt-1 font-mono text-[10px] tracking-wide">
                          {correction.note}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {data.vocabulary.length > 0 ? (
              <section className="flex flex-col gap-3">
                <MicroLabel>New words · {data.vocabulary.length}</MicroLabel>
                <ul className="flex flex-col gap-2">
                  {data.vocabulary.map((word) => (
                    <li key={word.id} className="border-border bg-card rounded-lg border px-3.5 py-3">
                      <p className="font-display text-sm font-semibold">{word.word}</p>
                      <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
                        {word.meaning}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <Separator />

            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <MicroLabel>Transcript</MicroLabel>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {data.turns.length} turns
                </span>
              </div>

              {data.turns.length === 0 ? (
                <p className="text-muted-foreground flex items-center gap-2 text-sm">
                  <MessageSquareIcon className="size-4" />
                  Nothing was written down for this call.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {data.turns.map((turn) => (
                    <li
                      key={turn.id}
                      className={turn.speaker === "character" ? "flex flex-col gap-1" : "flex flex-col gap-1 items-end"}
                    >
                      <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                        {turn.speaker === "character"
                          ? (data.character?.name ?? "Friend")
                          : "You"}
                      </span>
                      <p
                        className={
                          turn.speaker === "character"
                            ? "bg-duke-card-2 max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed"
                            : "bg-primary/15 text-foreground max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed"
                        }
                      >
                        {turn.text}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </ScreenBody>

      {data !== undefined ? (
        <div
          className="border-border bg-background/95 fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[430px] border-t px-5 py-3 backdrop-blur-sm"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          <Button asChild size="lg" className="h-12 w-full text-base">
            <Link href={`/call/${data.session.characterId}`}>
              <RepeatIcon />
              Continue this conversation
            </Link>
          </Button>
        </div>
      ) : null}
    </AppShell>
  );
}
