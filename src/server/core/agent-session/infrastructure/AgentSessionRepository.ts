import { FileSystem, Path } from "@effect/platform";
import { Context, Effect, Layer } from "effect";
import { parseJsonl } from "../../claude-code/functions/parseJsonl";
import { decodeProjectId } from "../../project/functions/id";
import type { ExtendedConversation } from "../../types";

const LayerImpl = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  /**
   * Get agent session conversations by agentId.
   * Tries subagents path first (${sessionId}/subagents/agent-${agentId}.jsonl),
   * then falls back to flat path (agent-${agentId}.jsonl at project root).
   * Returns null if neither file exists.
   */
  const getAgentSessionByAgentId = (
    projectId: string,
    sessionId: string,
    agentId: string,
  ): Effect.Effect<ExtendedConversation[] | null, Error> =>
    Effect.gen(function* () {
      const projectPath = decodeProjectId(projectId);

      // New format: ${sessionId}/subagents/agent-${agentId}.jsonl
      const subagentsFilePath = path.resolve(
        projectPath,
        sessionId,
        "subagents",
        `agent-${agentId}.jsonl`,
      );

      const subagentsPathExists = yield* fs.exists(subagentsFilePath);
      if (subagentsPathExists) {
        const content = yield* fs.readFileString(subagentsFilePath);
        return parseJsonl(content);
      }

      // Legacy format: agent-${agentId}.jsonl at project root
      const flatFilePath = path.resolve(projectPath, `agent-${agentId}.jsonl`);

      const flatPathExists = yield* fs.exists(flatFilePath);
      if (flatPathExists) {
        const content = yield* fs.readFileString(flatFilePath);
        return parseJsonl(content);
      }

      return null;
    });

  return {
    getAgentSessionByAgentId,
  };
});

export class AgentSessionRepository extends Context.Tag(
  "AgentSessionRepository",
)<
  AgentSessionRepository,
  {
    readonly getAgentSessionByAgentId: (
      projectId: string,
      sessionId: string,
      agentId: string,
    ) => Effect.Effect<ExtendedConversation[] | null, Error>;
  }
>() {
  static Live = Layer.effect(this, LayerImpl);
}

export type IAgentSessionRepository = Context.Tag.Service<
  typeof AgentSessionRepository
>;
