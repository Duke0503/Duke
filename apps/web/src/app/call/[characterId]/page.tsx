"use client";

/**
 * The call.
 *
 * This screen does not hold a conversation — the agent process does. The browser's only jobs
 * are: ask the API for a room, join it, turn the microphone on, and play whatever comes back.
 * Everything else (Deepgram, Groq, Azure, the mood, barge-in) happens on the server.
 *
 * Three details that keep this honest:
 *
 *   1. **The token never touches the URL.** The room is opened by a `POST` from this screen, so
 *      a shared link cannot hand someone else your call.
 *   2. **Starting is idempotent.** React double-invokes effects in development; a second room
 *      would bill a second agent. `call !== null` is the guard.
 *   3. **Closing the tab still saves the call.** `pagehide` posts the end with `keepalive`, so a
 *      swipe-away does not lose the transcript bookkeeping.
 */

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";
import { PhoneOffIcon, MicIcon, MicOffIcon, ArrowRightIcon, SparklesIcon } from "lucide-react";
import { BareScreen } from "@/components/shell/app-shell";
import { Avatar, ErrorNote, MicroLabel, VoiceLine } from "@/components/duke/bits";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeading,
} from "@/components/ui/sheet";
import { endCallOnUnload, ApiError } from "@/lib/api";
import { formatClock, formatDuration, moodLabel, plural } from "@/lib/format";
import { useEndCall, useStartCall } from "@/lib/queries";
import type { EndedCall, StartedCall } from "@/lib/types";

type Phase = "starting" | "connecting" | "live" | "disconnected" | "ended" | "failed";

export default function CallPage() {
  return (
    <Suspense fallback={<BareScreen />}>
      <CallScreen />
    </Suspense>
  );
}

function CallScreen() {
  const params = useParams<{ characterId: string }>();
  const characterId = typeof params?.characterId === "string" ? params.characterId : "";
  const fresh = useSearchParams()?.get("fresh") === "1";

  const router = useRouter();
  const start = useStartCall();
  const end = useEndCall();

  const [phase, setPhase] = useState<Phase>("starting");
  const [call, setCall] = useState<StartedCall | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [result, setResult] = useState<EndedCall | null>(null);
  const [ending, setEnding] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const secondsRef = useRef(0);
  const phaseRef = useRef<Phase>("starting");
  phaseRef.current = phase;
  secondsRef.current = seconds;

  // ------------------------------------------------------------------ 1. ask for a room
  const { mutate: startCall, isPending: startPending, isSuccess: startSucceeded, isError: startFailed } = start;

  useEffect(() => {
    if (characterId.length === 0) {
      setPhase("failed");
      return;
    }
    // Already have one (or a request is on its way): doing it twice would bill two agents.
    if (call !== null || startPending || startSucceeded || startFailed) return;

    startCall(
      { characterId, continueFromLast: !fresh },
      {
        onSuccess: (data) => {
          setCall(data);
          setPhase("connecting");
        },
        onError: () => setPhase("failed"),
      },
    );
  }, [characterId, call, fresh, startCall, startPending, startSucceeded, startFailed]);

  // ------------------------------------------------------------------ 2. join it
  const connect = useCallback(async (started: StartedCall) => {
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    roomRef.current = room;

    // The agent's voice arrives as a remote audio track; attaching it to a hidden element is
    // what actually makes it audible.
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio) return;
      const element = track.attach();
      element.style.display = "none";
      document.body.appendChild(element);
    });

    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      if (track.kind !== Track.Kind.Audio) return;
      track.detach().forEach((element) => element.remove());
    });

    room.on(RoomEvent.Disconnected, () => {
      // If the call is already being closed on purpose, that path owns the ending.
      if (phaseRef.current === "live") setPhase("disconnected");
    });

    try {
      await room.connect(started.url, started.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      // Mobile browsers need this to be called after a tap before audio is allowed out.
      await room.startAudio();
      setPhase("live");
    } catch {
      setPhase("failed");
    }
  }, []);

  useEffect(() => {
    if (call === null) return;
    void connect(call);
    // No teardown here on purpose: React re-runs this effect in development, and tearing the
    // room down between the two runs would leave a live call with no audio.
  }, [call, connect]);

  // Real unmount: leave the room. At the developer double-mount this is a no-op, because the
  // room has not been created yet.
  useEffect(() => {
    return () => {
      void roomRef.current?.disconnect();
    };
  }, []);

  // ------------------------------------------------------------------ 3. the timer
  useEffect(() => {
    if (phase !== "live") return;
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  // ------------------------------------------------------------------ 4. closing the tab
  useEffect(() => {
    const sessionId = call?.sessionId;
    if (sessionId === undefined) return;

    const onHide = (): void => {
      if (phaseRef.current !== "live") return;
      endCallOnUnload(sessionId, secondsRef.current);
    };

    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [call]);

  // ------------------------------------------------------------------ actions
  const finish = useCallback(async () => {
    const sessionId = call?.sessionId;
    if (sessionId === undefined || ending) return;

    setEnding(true);
    await roomRef.current?.disconnect();

    try {
      const ended = await end.mutateAsync({
        sessionId,
        durationSec: secondsRef.current,
        summarise: true,
      });
      setResult(ended);
    } catch {
      // The call is over either way. The notes will be missing; say so on the way out.
      setResult(null);
    }
    setPhase("ended");
  }, [call, end, ending]);

  // If the room drops on its own (agent gone, network gone), close the books anyway rather
  // than leaving an open session behind.
  useEffect(() => {
    if (phase === "disconnected") void finish();
  }, [phase, finish]);

  const toggleMic = useCallback(async () => {
    const room = roomRef.current;
    if (room === null) return;
    const next = !muted;
    setMuted(next);
    await room.localParticipant.setMicrophoneEnabled(!next);
  }, [muted]);

  // ------------------------------------------------------------------ screens
  const startError = start.error instanceof ApiError ? start.error : null;
  const setupNeeded = startError?.code === "ENV_MISSING";

  if (phase === "failed") {
    return (
      <BareScreen>
        <div className="flex flex-1 flex-col justify-center gap-4 px-6">
          <MicroLabel>Call failed</MicroLabel>
          <p className="font-display text-xl font-semibold">
            {setupNeeded ? "Duke is not set up yet" : "That call did not connect"}
          </p>
          <ErrorNote>
            {startError?.message ?? "The room or the agent could not be reached."}
          </ErrorNote>
          <div className="mt-2 flex flex-col gap-2">
            {setupNeeded ? (
              <Button asChild size="lg" className="h-12 w-full">
                <Link href="/setup">
                  Open the setup checklist
                  <ArrowRightIcon />
                </Link>
              </Button>
            ) : null}
            <Button variant="secondary" size="lg" className="h-12 w-full" onClick={() => router.push("/")}>
              Back to Home
            </Button>
          </div>
        </div>
      </BareScreen>
    );
  }

  const live = phase === "live";
  const phaseLabel =
    phase === "live"
      ? "Live call"
      : phase === "connecting"
        ? "Connecting"
        : phase === "starting"
          ? "Starting"
          : phase === "disconnected"
            ? "Signal lost"
            : "Ended";
  const memory = call?.memoryCard;
  const remembered =
    memory !== undefined &&
    (memory.summary !== null || memory.topic !== null || memory.mistakes.length > 0);

  return (
    <BareScreen>
      <div className="flex flex-1 flex-col px-6 pt-6 pb-8">
        {/* header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={
                live
                  ? "bg-duke-danger size-2 animate-pulse rounded-full"
                  : "bg-border size-2 rounded-full"
              }
              aria-hidden
            />
            <MicroLabel className={live ? "text-duke-danger" : undefined}>
              {phaseLabel}
            </MicroLabel>
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">
            {call?.roomId.slice(-6) ?? "······"}
          </span>
        </div>

        {/* the friend */}
        <div className="flex flex-1 flex-col items-center justify-center gap-5">
          <div className="relative">
            {live ? (
              <span className="border-primary/25 absolute -inset-4 animate-ping rounded-full border" aria-hidden />
            ) : null}
            <Avatar
              name={call?.characterName ?? "…"}
              size="lg"
              className="size-28 text-4xl"
            />
          </div>

          <div className="text-center">
            <p className="font-display text-2xl font-semibold">{call?.characterName ?? "…"}</p>
            <p className="text-muted-foreground mt-1 font-mono text-[11px] tracking-wide">
              {live ? "listening" : phase === "connecting" ? "waking up" : "…"}
            </p>
          </div>

          <VoiceLine live={live} className="h-10" />

          <p className="font-mono text-3xl tabular-nums">{formatClock(seconds)}</p>

          {remembered ? (
            <div className="border-border bg-card/60 w-full max-w-[320px] rounded-lg border px-3.5 py-3">
              <div className="flex items-center gap-1.5">
                <SparklesIcon className="text-primary size-3.5" />
                <span className="font-mono text-[10px] tracking-[0.14em] text-primary uppercase">
                  remembers
                </span>
              </div>
              <p className="text-muted-foreground mt-1.5 line-clamp-3 text-xs leading-relaxed">
                {memory?.summary ?? memory?.topic ?? `${plural(memory?.mistakes.length ?? 0, "note")} from last time`}
              </p>
            </div>
          ) : null}
        </div>

        {/* controls */}
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => void toggleMic()}
            disabled={!live}
            aria-label={muted ? "Unmute microphone" : "Mute microphone"}
            className="border-border bg-card text-foreground hover:border-primary/40 grid size-14 place-items-center rounded-full border transition-colors disabled:opacity-40"
          >
            {muted ? <MicOffIcon className="size-5" /> : <MicIcon className="size-5" />}
          </button>

          <button
            type="button"
            onClick={() => void finish()}
            disabled={ending || phase === "starting"}
            aria-label="Hang up"
            className="bg-duke-danger text-white grid size-16 place-items-center rounded-full transition-transform active:scale-95 disabled:opacity-40"
          >
            <PhoneOffIcon className="size-6" />
          </button>

          <button
            type="button"
            onClick={() => router.push("/crew")}
            disabled={!live}
            aria-label="Switch friend"
            className="border-border bg-card text-foreground hover:border-primary/40 grid size-14 place-items-center rounded-full border transition-colors disabled:opacity-40"
          >
            <SparklesIcon className="size-5" />
          </button>
        </div>

        {end.isError ? (
          <p className="text-duke-danger mt-4 text-center text-xs">
            The notes could not be saved: {end.error.message}
          </p>
        ) : null}
      </div>

      {/* end of call */}
      <Sheet open={phase === "ended"} onOpenChange={() => undefined}>
        <SheetContent showClose={false}>
          <SheetBody className="pt-4">
            <MicroLabel>Call ended</MicroLabel>
            <SheetHeading className="mt-2">
              That was {formatDuration(result?.durationSec ?? seconds)} with{" "}
              {call?.characterName ?? "your friend"}.
            </SheetHeading>

            {result === null ? (
              <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
                The notes could not be saved this time. The call still happened.
              </p>
            ) : (
              <>
                {result.mood !== null ? (
                  <p className="text-muted-foreground mt-3 font-mono text-[11px] tracking-wide">
                    mood · {moodLabel(result.mood)}
                  </p>
                ) : null}

                {result.summary !== null ? (
                  <p className="border-border mt-4 border-l-2 pl-3 text-sm leading-relaxed">
                    {result.summary}
                  </p>
                ) : (
                  <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
                    No summary — the call was too short to learn anything from.
                  </p>
                )}

                <div className="mt-5 grid grid-cols-2 gap-2">
                  <Stat label="Fixes" value={String(result.corrections)} />
                  <Stat label="New words" value={String(result.newWords)} />
                </div>
              </>
            )}
          </SheetBody>

          <SheetFooter>
            {result !== null ? (
              <Button asChild size="lg" className="h-12 w-full">
                <Link href={`/history/${result.sessionId}`}>
                  See the full notes
                  <ArrowRightIcon />
                </Link>
              </Button>
            ) : null}
            <Button
              variant={result === null ? "default" : "secondary"}
              size="lg"
              className="h-12 w-full"
              onClick={() => router.push("/")}
            >
              Done
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </BareScreen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border bg-duke-card-2 rounded-lg border px-3 py-2.5">
      <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="font-display mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
