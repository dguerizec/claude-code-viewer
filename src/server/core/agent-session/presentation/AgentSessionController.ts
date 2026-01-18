import { Context, Effect, Layer } from "effect";
import type { ControllerResponse } from "../../../lib/effect/toEffectResponse";
import type { InferEffect } from "../../../lib/effect/types";
import { AgentSessionRepository } from "../infrastructure/AgentSessionRepository";

const LayerImpl = Effect.gen(function* () {
  const repository = yield* AgentSessionRepository;

  /**
   * Get agent session by agentId.
   * Reads agent session file with V3→V2 path fallback.
   */
  const getAgentSession = (params: {
    projectId: string;
    sessionId: string;
    agentId: string;
  }) =>
    Effect.gen(function* () {
      const { projectId, sessionId, agentId } = params;

      // Read conversations directly using agentId with V3→V2 fallback
      const conversations = yield* repository.getAgentSessionByAgentId(
        projectId,
        sessionId,
        agentId,
      );

      if (conversations === null) {
        return {
          status: 200,
          response: {
            agentSessionId: null,
            conversations: [],
          },
        } as const satisfies ControllerResponse;
      }

      return {
        status: 200,
        response: {
          agentSessionId: agentId,
          conversations,
        },
      } as const satisfies ControllerResponse;
    });

  return {
    getAgentSession,
  };
});

export type IAgentSessionController = InferEffect<typeof LayerImpl>;

export class AgentSessionController extends Context.Tag(
  "AgentSessionController",
)<AgentSessionController, IAgentSessionController>() {
  static Live = Layer.effect(this, LayerImpl);
}
