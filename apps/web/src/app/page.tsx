"use client";

/**
 * Home — one friend in front of you, the rest a tap away.
 *
 * The hero is the friend you talked to most recently, not the first one alphabetically. That is
 * the whole point of the screen: opening Duke should continue a relationship, not show a list.
 *
 * A call is started by *navigating* to `/call/<friendId>`; the call screen makes the request.
 * That keeps the room token out of the URL, out of history and out of any shared link.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { voiceForRole } from "@duke/core";
import { ArrowRightIcon, PhoneIcon, SparklesIcon } from "lucide-react";
import { AppShell, ScreenBody } from "@/components/shell/app-shell";
import { TabBar } from "@/components/shell/tab-bar";
import { Avatar, EmptyState, ErrorNote, Headline, MicroLabel, VoiceLine } from "@/components/duke/bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { greetingForHour } from "@/lib/format";
import { useCharacters, useSessions, useSetup } from "@/lib/queries";
import type { SessionListItem } from "@/lib/types";

export default function HomePage() {
  const characters = useCharacters();
  const sessions = useSessions(1);
  const setup = useSetup();
  const [greeting] = useState(() => greetingForHour());

  const crew = characters.data ?? [];
  const lastCall: SessionListItem | undefined = sessions.data?.[0];

  // "Most recent" means the friend of the newest call; a brand-new user has none.
  const hero =
    crew.find((character) => character.id === lastCall?.characterId) ?? crew[0] ?? null;

  return (
    <AppShell>
      <ScreenBody>
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="bg-primary text-primary-foreground font-display grid size-8 place-items-center rounded-full text-sm font-bold">
              D
            </div>
            <span className="font-display text-lg font-semibold tracking-tight">Duke</span>
          </div>
          <Link
            href="/practice"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs"
          >
            <SparklesIcon className="size-3.5" />
            Reading
          </Link>
        </header>

        <div className="flex flex-col gap-2">
          <MicroLabel>{greeting}</MicroLabel>
          <Headline>
            Who do you want
            <br />
            to talk to?
          </Headline>
        </div>

        {setup.data !== undefined && !setup.data.ready ? (
          <Link href="/setup" className="block">
            <div className="border-duke-ember/40 bg-duke-ember/10 text-duke-ember flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm">
              <span>{setup.data.summary}</span>
              <ArrowRightIcon className="size-4 shrink-0" />
            </div>
          </Link>
        ) : null}

        {characters.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : characters.isError ? (
          <ErrorNote>{characters.error.message}</ErrorNote>
        ) : hero === null ? (
          <EmptyState
            title="No friends yet"
            body="A friend is a name and a role — “Leo, senior developer”. Duke gives them a voice and a personality, and you talk out loud."
            action={
              <Button asChild size="lg">
                <Link href="/create">
                  Create your first friend
                  <ArrowRightIcon />
                </Link>
              </Button>
            }
          />
        ) : (
          <HeroCard
            id={hero.id}
            name={hero.name}
            role={hero.role}
            avatarUrl={hero.avatarUrl}
            savage={hero.savage}
            lastSummary={lastCall?.characterId === hero.id ? lastCall.summary : null}
          />
        )}

        {crew.length > 0 ? (
          <section className="flex flex-col gap-3">
            <MicroLabel>Your crew</MicroLabel>
            <ul className="divide-border divide-y">
              {crew.map((character) => {
                const voice = voiceForRole(character.role);
                return (
                  <li key={character.id} className="flex items-center gap-3 py-3">
                    <Avatar name={character.name} url={character.avatarUrl} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{character.name}</p>
                      <p className="text-muted-foreground truncate font-mono text-[11px] tracking-wide">
                        {voice.label} · {voice.feeling}
                      </p>
                    </div>
                    <Button asChild variant="secondary" size="sm">
                      <Link href={`/call/${character.id}`}>Call</Link>
                    </Button>
                  </li>
                );
              })}
            </ul>
            <Button asChild variant="outline" className="w-full">
              <Link href="/create">Add another friend</Link>
            </Button>
          </section>
        ) : null}
      </ScreenBody>

      <TabBar />
    </AppShell>
  );
}

function HeroCard({
  id,
  name,
  role,
  avatarUrl,
  savage,
  lastSummary,
}: {
  id: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  savage: boolean;
  lastSummary: string | null;
}) {
  const router = useRouter();
  const voice = voiceForRole(role);

  return (
    <Card className="bg-duke-card-2 gap-4 px-4 py-4">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="font-display truncate text-xl font-semibold">{name}</p>
            {savage ? (
              <span className="bg-duke-ember/15 text-duke-ember rounded-full px-2 py-0.5 font-mono text-[10px] tracking-wider uppercase">
                Savage
              </span>
            ) : null}
          </div>
          <p className="text-muted-foreground mt-0.5 truncate text-xs capitalize">{role}</p>
          <p className="text-muted-foreground mt-0.5 truncate font-mono text-[11px]">
            {voice.label} · {voice.feeling}
          </p>
        </div>
        <Avatar name={name} url={avatarUrl} size="lg" />
      </div>

      {lastSummary !== null ? (
        <p className="text-muted-foreground line-clamp-2 border-l-2 border-border pl-3 text-xs leading-relaxed italic">
          Last time: {lastSummary}
        </p>
      ) : (
        <VoiceLine live />
      )}

      <Button
        size="lg"
        className="h-12 w-full text-base"
        onClick={() => router.push(`/call/${id}`)}
      >
        <PhoneIcon />
        Start a voice call
      </Button>
    </Card>
  );
}
