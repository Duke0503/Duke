"use client";

/**
 * Crew — every friend you have made, and what you can do with one.
 *
 * Tapping a row opens a sheet rather than navigating, because the decision is small (call them,
 * call them fresh, edit, delete) and a whole page for four buttons would lose the list behind
 * it. The sheet is also where "Switch Character" lives if it is opened from a call.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FEEDBACK_STYLE_LABELS, voiceForRole } from "@duke/core";
import { PencilIcon, PhoneIcon, PlusIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { AppShell, ScreenBody } from "@/components/shell/app-shell";
import { TabBar } from "@/components/shell/tab-bar";
import { Avatar, EmptyState, ErrorNote, Headline, MicroLabel } from "@/components/duke/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetHeading,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useCharacters, useDeleteCharacter } from "@/lib/queries";
import type { Character } from "@/lib/types";

export default function CrewPage() {
  const characters = useCharacters();
  const [selected, setSelected] = useState<Character | null>(null);

  const crew = characters.data ?? [];

  return (
    <AppShell>
      <ScreenBody>
        <div className="flex flex-col gap-2">
          <MicroLabel>Crew · {crew.length} total</MicroLabel>
          <Headline>Your friends</Headline>
        </div>

        {characters.isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : characters.isError ? (
          <ErrorNote>{characters.error.message}</ErrorNote>
        ) : crew.length === 0 ? (
          <EmptyState
            title="Nobody here yet"
            body="Create a friend — a name, a job, and a voice. Duke does the rest."
            action={
              <Button asChild size="lg">
                <Link href="/create">
                  <PlusIcon />
                  Create a friend
                </Link>
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {crew.map((character) => {
              const voice = voiceForRole(character.role);
              return (
                <li key={character.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(character)}
                    className="border-border bg-card hover:border-primary/40 flex w-full items-center gap-3.5 rounded-xl border px-3.5 py-3.5 text-left transition-colors"
                  >
                    <Avatar name={character.name} url={character.avatarUrl} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{character.name}</p>
                        {character.savage ? <Badge variant="ember">Savage</Badge> : null}
                      </div>
                      <p className="text-muted-foreground mt-0.5 truncate text-xs capitalize">
                        {character.role}
                      </p>
                      <p className="text-muted-foreground mt-0.5 truncate font-mono text-[10px] tracking-wide">
                        {voice.label} · {FEEDBACK_STYLE_LABELS[character.feedbackStyle]}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {crew.length > 0 ? (
          <Button asChild variant="outline" className="w-full">
            <Link href="/create">
              <PlusIcon />
              Add another friend
            </Link>
          </Button>
        ) : null}
      </ScreenBody>

      <TabBar />
      {selected !== null ? (
        <CharacterSheet character={selected} onClose={() => setSelected(null)} />
      ) : null}
    </AppShell>
  );
}

/** One friend's four options. Continue is first because it is the common one. */
function CharacterSheet({
  character,
  onClose,
}: {
  character: Character;
  onClose: () => void;
}) {
  const router = useRouter();
  const remove = useDeleteCharacter();
  const [confirming, setConfirming] = useState(false);

  return (
    <Sheet open onOpenChange={(open) => (open ? undefined : onClose())}>
      <SheetContent>
        <SheetHeader>
          <div className="flex items-center gap-3">
            <Avatar name={character.name} url={character.avatarUrl} />
            <div className="min-w-0">
              <SheetHeading className="truncate">{character.name}</SheetHeading>
              <SheetTitle className="text-muted-foreground truncate text-xs font-normal capitalize">
                {character.role}
              </SheetTitle>
            </div>
          </div>
        </SheetHeader>

        <SheetBody>
          {remove.isError ? <ErrorNote>{remove.error.message}</ErrorNote> : null}

          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              className="h-12 w-full"
              onClick={() => router.push(`/call/${character.id}`)}
            >
              <PhoneIcon />
              Continue where we left off
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="h-12 w-full"
              onClick={() => router.push(`/call/${character.id}?fresh=1`)}
            >
              <RotateCcwIcon />
              Start a fresh call
            </Button>
          </div>
        </SheetBody>

        <SheetFooter>
          <Button asChild variant="ghost" className="w-full justify-start">
            <Link href={`/create?id=${character.id}`}>
              <PencilIcon />
              Edit
            </Link>
          </Button>

          {confirming ? (
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground text-xs leading-relaxed">
                This removes the friend. Your past calls with them stay in History.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={remove.isPending}
                  onClick={() =>
                    remove.mutate(character.id, {
                      onSuccess: () => onClose(),
                    })
                  }
                >
                  {remove.isPending ? "Removing…" : "Yes, remove"}
                </Button>
                <Button variant="ghost" className="flex-1" onClick={() => setConfirming(false)}>
                  Keep
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              className="text-duke-danger hover:text-duke-danger w-full justify-start"
              onClick={() => setConfirming(true)}
            >
              <Trash2Icon />
              Remove
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
