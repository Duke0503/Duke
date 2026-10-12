"use client";

/**
 * Reading practice.
 *
 * The one screen that does not need the API: the phone reads a short passage out loud and you
 * read along. It uses the browser's own speech engine, which is free, works offline, and needs
 * no key — so it is still useful on the day a provider runs out of free minutes.
 *
 * The sticky pill at the bottom is the design's answer to "where am I": the passage scrolls,
 * the pill does not, and it always says which passage and whether it is speaking.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { PauseIcon, PlayIcon, RotateCcwIcon, SkipForwardIcon } from "lucide-react";
import { AppShell, ScreenBody } from "@/components/shell/app-shell";
import { TabBar } from "@/components/shell/tab-bar";
import { ErrorNote, Headline, MicroLabel } from "@/components/duke/bits";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

interface Passage {
  readonly title: string;
  readonly level: string;
  readonly lines: readonly string[];
}

/** Short, plain English. The point is rhythm and mouth position, not vocabulary. */
const PASSAGES: readonly Passage[] = [
  {
    title: "The coffee order",
    level: "A2",
    lines: [
      "Good morning. Can I get a medium coffee, please?",
      "No sugar. Just a little milk.",
      "Could you make it to go? I am late for work.",
      "Thank you. Have a nice day.",
    ],
  },
  {
    title: "Asking for help",
    level: "B1",
    lines: [
      "Excuse me, I think I am lost.",
      "I am trying to find the train station, but the map is not clear.",
      "Is it far from here? Should I take a bus?",
      "Thank you so much. You have been very kind.",
    ],
  },
  {
    title: "The job interview",
    level: "B2",
    lines: [
      "Thank you for meeting me today.",
      "I have been working as a developer for four years.",
      "What I enjoy most is turning a vague idea into something people can actually use.",
      "I would like to grow into a role where I also help others learn.",
    ],
  },
  {
    title: "Talking about the weekend",
    level: "B1",
    lines: [
      "So, what did you get up to at the weekend?",
      "I went hiking with a couple of friends. The weather was better than we expected.",
      "We walked for about four hours and stopped for lunch by a lake.",
      "Honestly, I was exhausted, but it was worth it.",
    ],
  },
];

const RATES = [0.75, 0.9, 1] as const;

export default function PracticePage() {
  const [index, setIndex] = useState(0);
  const [rate, setRate] = useState<number>(0.9);
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(true);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const passage = PASSAGES[index] as Passage;
  const text = passage.lines.join(" ");

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    utteranceRef.current = null;
    setSpeaking(false);
  }, []);

  const play = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setSupported(false);
      return;
    }
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = rate;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }, [rate, text]);

  // Replaying at a new speed, or leaving the screen, must not leave a voice behind.
  useEffect(() => {
    return () => window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    stop();
  }, [index, rate, stop]);

  return (
    <AppShell>
      <ScreenBody className="pb-32">
        <div className="flex flex-col gap-2">
          <MicroLabel>
            Reading · passage {index + 1} of {PASSAGES.length}
          </MicroLabel>
          <Headline>Read it out loud</Headline>
        </div>

        {!supported ? (
          <ErrorNote>
            This browser has no speech engine, so it cannot read to you. Try Chrome or Safari.
          </ErrorNote>
        ) : null}

        <article className="border-border bg-card rounded-xl border px-4 py-4">
          <div className="flex items-center justify-between">
            <p className="font-display text-base font-semibold">{passage.title}</p>
            <span className="border-border text-muted-foreground rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-wider">
              {passage.level}
            </span>
          </div>
          <div className="mt-3 flex flex-col gap-2.5">
            {passage.lines.map((line, lineIndex) => (
              <p key={lineIndex} className="text-[15px] leading-relaxed">
                {line}
              </p>
            ))}
          </div>
        </article>

        <div className="flex flex-col gap-3">
          <MicroLabel>Speed</MicroLabel>
          <div className="flex gap-2">
            {RATES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setRate(option)}
                className={cn(
                  "flex-1 rounded-lg border py-2.5 font-mono text-xs transition-colors",
                  rate === option
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {option.toFixed(2)}×
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <MicroLabel>Another one</MicroLabel>
          <ul className="divide-border divide-y">
            {PASSAGES.map((item, itemIndex) => (
              <li key={item.title}>
                <button
                  type="button"
                  onClick={() => setIndex(itemIndex)}
                  className="hover:bg-card flex w-full items-center justify-between gap-3 rounded-lg px-1 py-3 text-left transition-colors"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{item.title}</span>
                    <span className="text-muted-foreground block font-mono text-[10px] tracking-wide">
                      {item.level} · {item.lines.length} lines
                    </span>
                  </span>
                  {itemIndex === index ? (
                    <span className="text-primary font-mono text-[10px] tracking-wider uppercase">
                      here
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </ScreenBody>

      {/* the sticky pill */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[68px] z-40 mx-auto flex w-full max-w-[430px] justify-center px-5"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="border-border bg-duke-card-2/95 pointer-events-auto flex w-full items-center gap-3 rounded-full border px-2 py-2 shadow-xl backdrop-blur">
          <Button
            size="icon-lg"
            className="rounded-full"
            onClick={speaking ? stop : play}
            aria-label={speaking ? "Stop reading" : "Read it to me"}
          >
            {speaking ? <PauseIcon /> : <PlayIcon />}
          </Button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{passage.title}</p>
            <p className="text-muted-foreground font-mono text-[10px] tracking-wide">
              {speaking ? `reading at ${rate.toFixed(2)}×` : `paused · ${passage.level}`}
            </p>
          </div>

          <Button
            size="icon-sm"
            variant="ghost"
            className="rounded-full"
            onClick={play}
            aria-label="Restart"
          >
            <RotateCcwIcon />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="rounded-full"
            onClick={() => setIndex((value) => (value + 1) % PASSAGES.length)}
            aria-label="Next passage"
          >
            <SkipForwardIcon />
          </Button>
        </div>
      </div>

      <TabBar />
    </AppShell>
  );
}
