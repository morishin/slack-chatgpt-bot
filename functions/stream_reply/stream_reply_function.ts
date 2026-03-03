import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { generateText, streamText } from "npm:ai";
import {
  createOpenAI,
  type OpenAILanguageModelResponsesOptions,
} from "npm:@ai-sdk/openai";

import { ConversationSessionDatastore } from "../../datastores/conversation_session_datastore.ts";
import { SystemMessageDatastore } from "../../datastores/system_message_datastore.ts";
import { env } from "../../env.ts";

export const StreamReplyFunctionDefinition = DefineFunction({
  callback_id: "stream_reply_function",
  title: "Stream reply function",
  source_file: "functions/stream_reply/stream_reply_function.ts",
  input_parameters: {
    properties: {
      channelId: {
        type: Schema.types.string,
      },
      message: {
        type: Schema.types.string,
      },
      userId: {
        type: Schema.types.string,
      },
      teamId: {
        type: Schema.types.string,
      },
      messageTs: {
        type: Schema.types.string,
      },
      threadTs: {
        type: Schema.types.string,
      },
    },
    required: ["channelId", "message"],
  },
  output_parameters: {
    properties: {
      reply: {
        type: Schema.types.string,
      },
    },
    required: ["reply"],
  },
});

type SlackStreamResponse = {
  ok: boolean;
  error?: string;
  ts?: string;
};

type OpenAIProviderMetadata = {
  openai?: {
    responseId?: string | null;
  };
};

type ConversationSession = {
  previousResponseId?: string;
  lastInteractionAt?: number;
};

const trimMention = (message: string): string => {
  return message.replace(/<@.+>\s?/, "").trim();
};

const isBlank = (text: string): boolean => {
  return text.replaceAll(/\s/g, "").length === 0;
};

const getSessionKey = (
  channelId: string,
  threadTs: string | undefined,
): string => {
  if (threadTs) {
    return `thread:${channelId}:${threadTs}`;
  }
  return `channel:${channelId}`;
};

const getChainTimeoutMs = (timeoutMinutesRaw: string | undefined): number => {
  const fallback = env.RESPONSE_CHAIN_TIMEOUT_MINUTES;
  const parsed = Number(timeoutMinutesRaw);
  const timeoutMinutes = Number.isFinite(parsed) && parsed > 0
    ? parsed
    : fallback;
  return timeoutMinutes * 60 * 1000;
};

const getPreviousResponseId = (
  session: ConversationSession,
  nowMs: number,
  timeoutMs: number,
): string | undefined => {
  if (!session.previousResponseId || !session.lastInteractionAt) {
    return undefined;
  }
  const elapsedMs = nowMs - session.lastInteractionAt;
  if (elapsedMs > timeoutMs) {
    return undefined;
  }
  return session.previousResponseId;
};

const extractResponseId = (
  providerMetadata: OpenAIProviderMetadata | undefined,
): string | undefined => {
  const responseId = providerMetadata?.openai?.responseId;
  return typeof responseId === "string" && responseId.length > 0
    ? responseId
    : undefined;
};

export const streamReplyInternals = {
  getSessionKey,
  getChainTimeoutMs,
  getPreviousResponseId,
};

export default SlackFunction(
  StreamReplyFunctionDefinition,
  async ({ inputs, client, env: slackEnv }) => {
    const content = trimMention(inputs.message);
    if (isBlank(content)) {
      console.log("Skipping: StreamReplyFunction (empty message)");
      return {
        outputs: {
          reply: "",
        },
      };
    }

    const systemMessageResponse = await client.apps.datastore.get<
      typeof SystemMessageDatastore.definition
    >({
      // Keep using the existing production datastore name for backward compatibility.
      datastore: "MessageHistory",
      id: inputs.channelId,
    });
    if (!systemMessageResponse.ok) {
      return {
        error:
          `Failed to get system message from datastore: ${systemMessageResponse.error}`,
      };
    }

    const systemMessage = systemMessageResponse.item?.systemMessage as
      | string
      | undefined
      ?? env.INITIAL_SYSTEM_MESSAGE;

    const timeoutMs = getChainTimeoutMs(
      slackEnv.RESPONSE_CHAIN_TIMEOUT_MINUTES,
    );
    const sessionKey = getSessionKey(inputs.channelId, inputs.threadTs);

    const sessionResponse = await client.apps.datastore.get<
      typeof ConversationSessionDatastore.definition
    >({
      datastore: "ConversationSession",
      id: sessionKey,
    });
    if (!sessionResponse.ok) {
      return {
        error: `Failed to get conversation session: ${sessionResponse.error}`,
      };
    }

    const nowMs = Date.now();
    const previousResponseId = getPreviousResponseId(
      {
        previousResponseId: sessionResponse.item?.previousResponseId as
          | string
          | undefined,
        lastInteractionAt: sessionResponse.item?.lastInteractionAt as
          | number
          | undefined,
      },
      nowMs,
      timeoutMs,
    );

    const openAIOptions: OpenAILanguageModelResponsesOptions = {
      instructions: systemMessage,
      ...(previousResponseId ? { previousResponseId } : {}),
    };

    const openAI = createOpenAI({ apiKey: slackEnv.OPENAI_API_KEY });
    const effectiveThreadTs = inputs.threadTs ?? inputs.messageTs;
    const hasStreamingContext = Boolean(inputs.userId && inputs.teamId);

    let reply = "";
    let responseId: string | undefined;

    if (!hasStreamingContext) {
      console.warn(
        "Streaming context is incomplete. Falling back to non-streaming reply.",
      );

      const result = await generateText({
        model: openAI(env.GPT_MODEL),
        prompt: content,
        providerOptions: {
          openai: openAIOptions,
        },
      });
      reply = result.text;

      await client.chat.postMessage({
        channel: inputs.channelId,
        text: reply,
        ...(effectiveThreadTs ? { thread_ts: effectiveThreadTs } : {}),
      });

      responseId = extractResponseId(
        result.providerMetadata as OpenAIProviderMetadata | undefined,
      );
    } else {
      const streamResult = streamText({
        model: openAI(env.GPT_MODEL),
        prompt: content,
        providerOptions: {
          openai: openAIOptions,
        },
      });

      let streamTs: string | null = null;
      let pending = "";

      const flushPending = async () => {
        if (!pending) return;
        const text = pending;
        pending = "";

        if (!streamTs) {
          const startResponse = await client.apiCall("chat.startStream", {
            channel: inputs.channelId,
            markdown_text: text,
            recipient_team_id: inputs.teamId as string,
            recipient_user_id: inputs.userId as string,
            ...(effectiveThreadTs ? { thread_ts: effectiveThreadTs } : {}),
          }) as SlackStreamResponse;

          if (!startResponse.ok || !startResponse.ts) {
            throw new Error(
              `Failed to start Slack stream: ${startResponse.error ?? "unknown error"}`,
            );
          }
          streamTs = startResponse.ts;
          return;
        }

        const appendResponse = await client.apiCall("chat.appendStream", {
          channel: inputs.channelId,
          ts: streamTs,
          markdown_text: text,
        }) as SlackStreamResponse;
        if (!appendResponse.ok) {
          throw new Error(
            `Failed to append Slack stream: ${appendResponse.error ?? "unknown error"}`,
          );
        }
      };

      for await (const textDelta of streamResult.textStream) {
        if (!textDelta) continue;

        reply += textDelta;
        pending += textDelta;
        if (pending.length >= 80) {
          await flushPending();
        }
      }

      await flushPending();

      if (streamTs) {
        const stopResponse = await client.apiCall("chat.stopStream", {
          channel: inputs.channelId,
          ts: streamTs,
        }) as SlackStreamResponse;
        if (!stopResponse.ok) {
          throw new Error(
            `Failed to stop Slack stream: ${stopResponse.error ?? "unknown error"}`,
          );
        }
      }

      const providerMetadata = await streamResult.providerMetadata;
      responseId = extractResponseId(
        providerMetadata as OpenAIProviderMetadata | undefined,
      );
    }

    if (responseId) {
      const updateSessionResponse = await client.apps.datastore.update<
        typeof ConversationSessionDatastore.definition
      >({
        datastore: "ConversationSession",
        item: {
          sessionKey,
          previousResponseId: responseId,
          lastInteractionAt: nowMs,
        },
      });

      if (!updateSessionResponse.ok) {
        return {
          error:
            `Failed to save conversation session: ${updateSessionResponse.error}`,
        };
      }
    } else {
      console.warn("OpenAI responseId is missing; session chain was not updated.");
    }

    return {
      outputs: {
        reply,
      },
    };
  },
);
