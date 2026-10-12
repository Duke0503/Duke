/**
 * The character on the call.
 *
 * The personality is not here. It is in `brief.systemPrompt`, rendered by the API from the
 * character, the memory card and the budget, and handed to the model as the instructions. This
 * class adds exactly one thing a plain `voice.Agent` cannot do: it takes the `[[mood]]` tag off
 * the live reply and turns it into the Azure emotion for that sentence.
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
import { stripMoodFromStream, type ReplyChunk } from "./mood-filter";

export class DukeAgent extends voice.Agent<unknown> {
  constructor(
    private readonly brief: SessionBrief,
    private readonly azure: AzureTts,
  ) {
    super({ instructions: brief.systemPrompt });
  }

  /** The character's own name, for the logs. */
  get characterName(): string {
    return this.brief.characterName;
  }

  /** The reply stream, with the mood tag removed and applied to the voice. */
  override async llmNode(
    chatCtx: ChatContext,
    toolCtx: ToolContext,
    modelSettings: ModelSettings,
  ): Promise<ReadableStream<ReplyChunk> | null> {
    // A new turn starts plain. If this reply opens with a mood, it arrives with the next token.
    this.azure.setMood(null);

    const upstream = await voice.Agent.default.llmNode(this, chatCtx, toolCtx, modelSettings);
    if (upstream === null) return null;

    return stripMoodFromStream(upstream, (mood) => this.azure.setMood(mood));
  }
}
