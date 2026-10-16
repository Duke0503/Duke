/**
 * The character on the call.
 *
 * The personality is not here. It is in `brief.systemPrompt`, rendered by the API from the
 * character, the memory card and the budget, and handed to the model as the instructions. This
 * class adds the two things a plain `voice.Agent` cannot do: it takes the `[[mood]]` tag off
 * the live reply and turns it into the Azure emotion for that sentence, and it makes the reply's
 * punctuation safe to speak, so no dash reaches the voice whatever the model sends. For a savage
 * character it also reads each sentence before the voice does.
 *
 * It overrides `llmNode` rather than reading the finished reply, because a call has no finished
 * reply — the first sentence is already being spoken while the third is still arriving. The
 * tag has to be gone before the first word reaches Azure, and that is what `llmNode` guarantees.
 */

import {
  voice,
  type ChatContext,
  type ModelSettings,
  type ToolContext,
} from "@livekit/agents";
import type { SessionBrief } from "@duke/core";
import type { AzureTts } from "./azure-tts";
import { stripDashesFromStream } from "./dash-filter";
import { stripMoodFromStream, type ReplyChunk } from "./mood-filter";
import { guardSavageStream } from "./savage-filter";

export class DukeAgent extends voice.Agent<unknown> {
  constructor(
    private readonly brief: SessionBrief,
    private readonly azure: AzureTts,
    /** Called once per sentence the savage guard had to rewrite. Reason is for the log. */
    private readonly onSavageFlag: (reason: string) => void = () => undefined,
  ) {
    super({ instructions: brief.systemPrompt });
  }

  /** The character's own name, for the logs. */
  get characterName(): string {
    return this.brief.characterName;
  }

  /** The reply stream: mood taken off and applied to the voice, then the savage guard. */
  override async llmNode(
    chatCtx: ChatContext,
    toolCtx: ToolContext,
    modelSettings: ModelSettings,
  ): Promise<ReadableStream<ReplyChunk> | null> {
    // A new turn starts plain. If this reply opens with a mood, it arrives with the next token.
    this.azure.setMood(null);

    const upstream = await voice.Agent.default.llmNode(this, chatCtx, toolCtx, modelSettings);
    if (upstream === null) return null;

    const clean = stripMoodFromStream(upstream, (mood) => this.azure.setMood(mood));

    // The prompt asks for no dashes between the parts of a sentence; this is what makes it true
    // rather than merely requested. See `dash-filter.ts` and `DashRewriter`.
    const dashed = stripDashesFromStream(clean);

    // Off for everyone else: the guard's rules are conservative enough that a friendly teacher
    // would lose a good sentence to them. See `savage-filter.ts` for the reasoning.
    if (!this.brief.savage) return dashed;

    return guardSavageStream(dashed, (reason) => this.onSavageFlag(reason));
  }
}
