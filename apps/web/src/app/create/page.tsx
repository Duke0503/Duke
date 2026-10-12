"use client";

/**
 * Create a friend — and edit one.
 *
 * The screen has one idea: you write a **name** and a **role**, and everything else follows.
 * The voice is picked from the role ("my old maths teacher" → the teacher voice) and the savage
 * switch defaults to on if you typed the word "savage" yourself. Both are only defaults — the
 * moment you touch the voice picker, your choice wins and stops being overwritten.
 *
 * The limits come from `CHARACTER_LIMITS` in `@duke/core`, the same numbers the API validates
 * with, so the counter and the error can never disagree.
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CHARACTER_LIMITS,
  FEEDBACK_STYLE_LABELS,
  FEEDBACK_STYLES,
  ROLE_VOICES,
  looksSavage,
  voiceForRole,
  type FeedbackStyle,
} from "@duke/core";
import { ArrowLeftIcon, CheckIcon } from "lucide-react";
import { AppShell, ScreenBody } from "@/components/shell/app-shell";
import { ErrorNote, Headline, MicroLabel } from "@/components/duke/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "cn";
import { ApiError } from "@/lib/api";
import { useCharacter, useCreateCharacter, useUpdateCharacter } from "@/lib/queries";

/** The first words the role field suggests, so the screen is never blank. */
const ROLE_SUGGESTIONS = ["English teacher", "Senior developer", "Coffee barista", "Savage friend"];

export default function CreateCharacterPage() {
  // `useSearchParams` needs a Suspense boundary above it during a static pass.
  return (
    <Suspense fallback={<CreateFallback />}>
      <CreateCharacterForm />
    </Suspense>
  );
}

function CreateFallback() {
  return (
    <AppShell>
      <ScreenBody>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64 w-full" />
      </ScreenBody>
    </AppShell>
  );
}

function CreateCharacterForm() {
  const router = useRouter();
  const editingId = useSearchParams()?.get("id") ?? undefined;
  const isEditing = editingId !== undefined;

  const existing = useCharacter(editingId);
  const create = useCreateCharacter();
  const update = useUpdateCharacter(editingId ?? "");

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [personality, setPersonality] = useState("");
  const [accent, setAccent] = useState("");
  const [defaultTopic, setDefaultTopic] = useState("");
  const [feedbackStyle, setFeedbackStyle] = useState<FeedbackStyle>("quiet-tips");
  const [savage, setSavage] = useState(false);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Fill the form once, from the friend being edited.
  useEffect(() => {
    const found = existing.data;
    if (!isEditing || found === undefined || loaded) return;
    setName(found.name);
    setRole(found.role);
    setPersonality(found.personality);
    setAccent(found.accent);
    setDefaultTopic(found.defaultTopic ?? "");
    setFeedbackStyle(found.feedbackStyle);
    setSavage(found.savage);
    setVoiceId(found.voiceId);
    setLoaded(true);
  }, [existing.data, isEditing, loaded]);

  const suggested = voiceForRole(role);
  // Nothing picked yet means "follow the role"; once picked, the choice is the user's.
  const effectiveVoiceId = voiceId ?? suggested.voiceId;

  // A brand-new friend follows the role until a voice is chosen by hand. An edited one keeps
  // whatever was saved, even if it is not from our list.
  useEffect(() => {
    if (isEditing || voiceId !== null) return;
    setSavage(looksSavage(role));
  }, [role, isEditing, voiceId]);

  const mutation = isEditing ? update : create;
  const error = mutation.error instanceof ApiError ? mutation.error : null;

  const canSave = name.trim().length > 0 && role.trim().length > 0 && !mutation.isPending;

  function save() {
    const draft = {
      name: name.trim(),
      role: role.trim(),
      personality: personality.trim(),
      accent: accent.trim(),
      defaultTopic: defaultTopic.trim(),
      feedbackStyle,
      savage,
      voiceId: effectiveVoiceId,
    };

    if (isEditing && editingId !== undefined) {
      update.mutate(draft, { onSuccess: () => router.push("/crew") });
      return;
    }
    create.mutate(draft, { onSuccess: () => router.push("/crew") });
  }

  const voices = existing.data !== undefined && !ROLE_VOICES.some((v) => v.voiceId === existing.data.voiceId)
    ? [...ROLE_VOICES, { id: "custom", label: "Custom", voiceId: existing.data.voiceId, feeling: "set by you", keywords: [], genericKeywords: [] }]
    : ROLE_VOICES;

  return (
    <AppShell>
      <ScreenBody>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-muted-foreground hover:text-foreground -ml-1 flex w-fit items-center gap-1.5 text-xs"
        >
          <ArrowLeftIcon className="size-3.5" />
          Back
        </button>

        <div className="flex flex-col gap-2">
          <MicroLabel>{isEditing ? "Edit friend" : "New friend"}</MicroLabel>
          <Headline>{isEditing ? "Change how they sound" : "Who is this friend?"}</Headline>
        </div>

        {isEditing && existing.isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="flex flex-col gap-5">
            <Field label="Name" hint={`${name.length}/${CHARACTER_LIMITS.name}`}>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value.slice(0, CHARACTER_LIMITS.name))}
                placeholder="Leo"
                autoComplete="off"
                aria-invalid={error?.problems.some((p) => p.field === "name") ?? false}
              />
            </Field>

            <Field label="What are they?" hint={`${role.length}/${CHARACTER_LIMITS.role}`}>
              <Input
                value={role}
                onChange={(event) => setRole(event.target.value.slice(0, CHARACTER_LIMITS.role))}
                placeholder="Senior developer"
                autoComplete="off"
                aria-invalid={error?.problems.some((p) => p.field === "role") ?? false}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ROLE_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setRole(suggestion)}
                    className="border-border text-muted-foreground hover:border-primary/50 hover:text-foreground rounded-full border px-2.5 py-1 text-[11px] transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Personality" hint={`${personality.length}/${CHARACTER_LIMITS.personality}`}>
              <Textarea
                value={personality}
                onChange={(event) =>
                  setPersonality(event.target.value.slice(0, CHARACTER_LIMITS.personality))
                }
                placeholder="Patient, jokes a lot, asks about my day."
                rows={3}
              />
            </Field>

            <Separator />

            <Field label="Voice">
              <RadioGroup
                value={effectiveVoiceId}
                onValueChange={(value) => setVoiceId(value)}
                className="gap-2"
              >
                {voices.map((voice) => (
                  <label
                    key={voice.voiceId}
                    className={cn(
                      "border-border flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                      effectiveVoiceId === voice.voiceId
                        ? "border-primary/60 bg-primary/5"
                        : "hover:border-border/80",
                    )}
                  >
                    <RadioGroupItem value={voice.voiceId} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm">{voice.label}</span>
                      <span className="text-muted-foreground block font-mono text-[11px]">
                        {voice.feeling}
                      </span>
                    </span>
                    {effectiveVoiceId === voice.voiceId ? (
                      <span className="text-primary font-mono text-[10px] tracking-wider uppercase">
                        selected
                      </span>
                    ) : null}
                  </label>
                ))}
              </RadioGroup>
              {voiceId === null ? (
                <p className="text-muted-foreground mt-2 text-[11px]">
                  Following the role. Pick one to decide yourself.
                </p>
              ) : null}
            </Field>

            <Field label="Corrections">
              <RadioGroup
                value={feedbackStyle}
                onValueChange={(value) => setFeedbackStyle(value as FeedbackStyle)}
                className="gap-2"
              >
                {FEEDBACK_STYLES.map((style) => (
                  <label
                    key={style}
                    className={cn(
                      "border-border flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                      feedbackStyle === style ? "border-primary/60 bg-primary/5" : "hover:border-border/80",
                    )}
                  >
                    <RadioGroupItem value={style} />
                    <span className="text-sm">{FEEDBACK_STYLE_LABELS[style]}</span>
                  </label>
                ))}
              </RadioGroup>
              <p className="text-muted-foreground mt-2 text-[11px] leading-relaxed">
                Just talk: no correcting. Quiet tips: small hints now and then. Correct out loud:
                stops and fixes the sentence.
              </p>
            </Field>

            <div className="border-border bg-card flex items-start justify-between gap-4 rounded-lg border px-3.5 py-3">
              <div className="min-w-0">
                <p className="text-sm">Savage mode</p>
                <p className="text-muted-foreground mt-0.5 text-[11px] leading-relaxed">
                  Playful teasing only. Never a real insult, never about you as a person.
                </p>
              </div>
              <Switch
                checked={savage}
                onCheckedChange={setSavage}
                aria-label="Savage mode"
                className="mt-0.5"
              />
            </div>

            <Field label="Accent" hint="optional">
              <Input
                value={accent}
                onChange={(event) => setAccent(event.target.value.slice(0, CHARACTER_LIMITS.accent))}
                placeholder="American"
              />
            </Field>

            <Field label="Always starts with" hint="optional">
              <Input
                value={defaultTopic}
                onChange={(event) =>
                  setDefaultTopic(event.target.value.slice(0, CHARACTER_LIMITS.defaultTopic))
                }
                placeholder="How my week is going"
              />
            </Field>

            {error !== null && !error.problems.every((p) => p.field === "name" || p.field === "role") ? (
              <ErrorNote>{error.detail}</ErrorNote>
            ) : null}

            <div className="border-border bg-duke-card-2/40 flex flex-col gap-1 rounded-lg border p-3">
              <p className="font-mono text-[11px] tracking-wide text-muted-foreground">
                {isEditing ? "PATCH /api/characters/:id" : "POST /api/characters"}
              </p>
              <p className="text-muted-foreground text-[11px] leading-relaxed">
                Saving stores the friend. The voice and personality become the prompt the next
                time they answer the phone.
              </p>
            </div>
          </div>
        )}
      </ScreenBody>

      {/* Sticky action bar: on a phone the save button must not be scrolled away. */}
      <div
        className="border-border bg-background/95 fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[430px] border-t px-5 py-3 backdrop-blur-sm"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <Button
          size="lg"
          className="h-12 w-full text-base"
          disabled={!canSave}
          onClick={save}
        >
          <CheckIcon />
          {mutation.isPending ? "Saving…" : isEditing ? "Save changes" : "Create friend"}
        </Button>
      </div>
    </AppShell>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <Label>{label}</Label>
        {hint !== undefined ? (
          <span className="font-mono text-[10px] text-muted-foreground">{hint}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
