import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { generateText, streamText } from "npm:ai";

import { ConversationSessionDatastore } from "../../datastores/conversation_session_datastore.ts";
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
      systemMessage: {
        type: Schema.types.string,
      },
      userId: {
        type: Schema.types.string,
      },
      messageTs: {
        type: Schema.slack.types.message_ts,
      },
      eventType: {
        type: Schema.types.string,
      },
    },
    required: ["channelId", "systemMessage"],
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

type OpenAIProviderMetadata = {
  openai?: {
    responseId?: string | null;
  };
};

type SlackStreamResponse = {
  ok: boolean;
  error?: string;
  ts?: string;
};

type SlackMessageResponse = {
  ok: boolean;
  error?: string;
  ts?: string;
};

type ConversationSession = {
  previousResponseId?: string;
  lastInteractionAt?: number;
};

class StreamingReplyError extends Error {
  streamStarted: boolean;
  partialReply: string;

  constructor(
    message: string,
    options?: { streamStarted?: boolean; partialReply?: string },
  ) {
    super(message);
    this.name = "StreamingReplyError";
    this.streamStarted = options?.streamStarted ?? false;
    this.partialReply = options?.partialReply ?? "";
  }
}

const trimMention = (message: string): string => {
  return message.replace(/<@.+>\s?/, "").trim();
};

const isBlank = (text: string): boolean => {
  return text.replaceAll(/\s/g, "").length === 0;
};

const getChainTimeoutMs = (timeoutMinutes: number): number => {
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

const toThreadTs = (
  messageTs: string | number | undefined,
): string | undefined => {
  if (typeof messageTs === "string" && /^\d+\.\d+$/.test(messageTs)) {
    return messageTs;
  }

  if (typeof messageTs === "number" && Number.isFinite(messageTs)) {
    const seconds = Math.trunc(messageTs);
    const microsValue = Math.round((messageTs - seconds) * 1_000_000);
    const normalizedSeconds = seconds + Math.trunc(microsValue / 1_000_000);
    const normalizedMicros = microsValue % 1_000_000;
    return `${normalizedSeconds}.${String(normalizedMicros).padStart(6, "0")}`;
  }

  return undefined;
};

const CHANNEL_PSEUDO_STREAM_MIN_APPEND_CHARS = 160;
const CHANNEL_PSEUDO_STREAM_MIN_UPDATE_INTERVAL_MS = 800;

const shouldFlushChannelPseudoStream = (
  pendingChars: number,
  elapsedMs: number,
): boolean => {
  return pendingChars >= CHANNEL_PSEUDO_STREAM_MIN_APPEND_CHARS ||
    elapsedMs >= CHANNEL_PSEUDO_STREAM_MIN_UPDATE_INTERVAL_MS;
};

const normalizeEventType = (
  eventType: string | undefined,
): string | undefined => {
  if (!eventType) return undefined;
  const suffix = eventType.split("/").at(-1);
  return suffix ?? eventType;
};

const shouldHandleEventType = (
  eventType: string | undefined,
  replyInThread: boolean,
): boolean => {
  const normalizedEventType = normalizeEventType(eventType);
  if (!normalizedEventType || normalizedEventType === "app_mentioned") {
    return true;
  }
  if (normalizedEventType === "message_posted") {
    return replyInThread;
  }
  return true;
};

const hasAnyMentionToken = (text: string): boolean => /<@[A-Z0-9]+>/.test(text);

type CreateOpenAIFactory = Awaited<
  typeof import("npm:@ai-sdk/openai")
>["createOpenAI"];

let cachedCreateOpenAI: CreateOpenAIFactory | undefined;

const getCreateOpenAI = async (): Promise<CreateOpenAIFactory> => {
  if (cachedCreateOpenAI) {
    return cachedCreateOpenAI;
  }
  const module = await import("npm:@ai-sdk/openai");
  cachedCreateOpenAI = module.createOpenAI;
  return cachedCreateOpenAI;
};

export const streamReplyInternals = {
  getChainTimeoutMs,
  getPreviousResponseId,
  toThreadTs,
  shouldFlushChannelPseudoStream,
  normalizeEventType,
  shouldHandleEventType,
  hasAnyMentionToken,
  getCreateOpenAI,
};

export default SlackFunction(
  StreamReplyFunctionDefinition,
  async ({ inputs, client, env: slackEnv }) => {
    const eventType = typeof inputs.eventType === "string"
      ? inputs.eventType
      : undefined;
    const normalizedEventType = normalizeEventType(eventType);

    const content = trimMention(inputs.systemMessage);
    if (isBlank(content)) {
      console.log(
        `Skipping: StreamReplyFunction (empty message, eventType=${
          normalizedEventType ?? "unknown"
        }, userId=${inputs.userId ?? "unknown"})`,
      );
      return {
        outputs: {
          reply: "",
        },
      };
    }

    const timeoutMs = getChainTimeoutMs(env.RESPONSE_CHAIN_TIMEOUT_MINUTES);
    const sessionChannelId = inputs.channelId;

    const sessionResponse = await client.apps.datastore.get<
      typeof ConversationSessionDatastore.definition
    >({
      datastore: "MessageHistory",
      id: sessionChannelId,
    });
    if (!sessionResponse.ok) {
      return {
        error: `Failed to get conversation session: ${sessionResponse.error}`,
      };
    }

    const nowMs = Date.now();
    const systemMessage = sessionResponse.item?.systemMessage as
      | string
      | undefined ?? env.INITIAL_SYSTEM_MESSAGE;
    const replyInThread = (sessionResponse.item?.replyInThread as
      | boolean
      | undefined) ?? false;
    if (!shouldHandleEventType(eventType, replyInThread)) {
      console.log(
        `Skipping: StreamReplyFunction (eventType=${eventType}, replyInThread=${replyInThread})`,
      );
      return {
        outputs: {
          reply: "",
        },
      };
    }
    if (
      normalizedEventType === "message_posted" &&
      hasAnyMentionToken(inputs.systemMessage)
    ) {
      console.log(
        "Skipping: StreamReplyFunction (message_posted with mention text)",
      );
      return {
        outputs: {
          reply: "",
        },
      };
    }
    if (normalizedEventType === "message_posted" && inputs.userId) {
      const authTestResponse = await client.auth.test();
      if (authTestResponse.ok && authTestResponse.user_id === inputs.userId) {
        console.log(
          "Skipping: StreamReplyFunction (message_posted from bot user)",
        );
        return {
          outputs: {
            reply: "",
          },
        };
      }
    }

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

    const openAIOptions = {
      instructions: systemMessage,
      ...(previousResponseId ? { previousResponseId } : {}),
    };

    const createOpenAI = await getCreateOpenAI();
    const openAI = createOpenAI({
      apiKey: slackEnv.OPENAI_API_KEY,
      baseURL: "https://api.openai.com/v1",
    });

    const runNonStreaming = async (
      options?: { threadTs?: string },
    ): Promise<{
      reply: string;
      responseId?: string;
    }> => {
      console.log("Slack reply mode: non-streaming");
      let result;
      try {
        result = await generateText({
          model: openAI(env.GPT_MODEL),
          prompt: content,
          providerOptions: {
            openai: openAIOptions,
          },
        });
      } catch (error) {
        console.warn(
          `OpenAI reply request failed. Falling back to static message. Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        const reply =
          "Failed to generate a response. Please try again in a moment.";
        try {
          await client.chat.postMessage({
            channel: inputs.channelId,
            ...(options?.threadTs ? { thread_ts: options.threadTs } : {}),
            text: reply,
          });
        } catch (_postError) {
          // Ignore Slack posting errors in fallback path.
        }
        return { reply };
      }

      const reply = result.text;
      try {
        await client.chat.postMessage({
          channel: inputs.channelId,
          ...(options?.threadTs ? { thread_ts: options.threadTs } : {}),
          text: reply,
        });
      } catch (error) {
        console.warn(
          `Failed to post non-streaming Slack message: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      return {
        reply,
        responseId: extractResponseId(
          result.providerMetadata as OpenAIProviderMetadata | undefined,
        ),
      };
    };

    const streamTeamId = env.SLACK_TEAM_ID?.trim();
    const threadTs = toThreadTs(
      inputs.messageTs as string | number | undefined,
    );
    const canStream = Boolean(
      replyInThread &&
        streamTeamId && inputs.userId && threadTs,
    );

    const runStreaming = async (): Promise<{
      reply: string;
      responseId?: string;
    }> => {
      console.log("Slack reply mode: streaming");
      const streamResult = streamText({
        model: openAI(env.GPT_MODEL),
        prompt: content,
        providerOptions: {
          openai: openAIOptions,
        },
      });

      let reply = "";
      let streamTs: string | undefined;
      let streamStarted = false;
      let pending = "";

      const appendStream = async () => {
        if (!streamTs || pending.length === 0) return;
        const text = pending;
        pending = "";
        const appendResponse = await client.apiCall("chat.appendStream", {
          channel: inputs.channelId,
          ts: streamTs,
          markdown_text: text,
        }) as SlackStreamResponse;
        if (!appendResponse.ok) {
          throw new StreamingReplyError(
            `Failed to append Slack stream: ${
              appendResponse.error ?? "unknown_error"
            }`,
            { streamStarted, partialReply: reply },
          );
        }
      };

      for await (const chunk of streamResult.textStream) {
        reply += chunk;
        if (!streamTs) {
          const startResponse = await client.apiCall("chat.startStream", {
            channel: inputs.channelId,
            thread_ts: threadTs as string,
            recipient_user_id: inputs.userId as string,
            recipient_team_id: streamTeamId as string,
            markdown_text: chunk,
          }) as SlackStreamResponse;
          if (!startResponse.ok || !startResponse.ts) {
            throw new StreamingReplyError(
              `Failed to start Slack stream: ${
                startResponse.error ?? "unknown_error"
              }`,
              { streamStarted, partialReply: reply },
            );
          }
          streamTs = startResponse.ts;
          streamStarted = true;
          continue;
        }

        pending += chunk;
        if (pending.length >= 160) {
          await appendStream();
        }
      }

      if (!streamTs) {
        throw new StreamingReplyError(
          "No stream output produced.",
          { streamStarted, partialReply: reply },
        );
      }

      await appendStream();
      const stopResponse = await client.apiCall("chat.stopStream", {
        channel: inputs.channelId,
        ts: streamTs,
      }) as SlackStreamResponse;
      if (!stopResponse.ok) {
        throw new StreamingReplyError(
          `Failed to stop Slack stream: ${
            stopResponse.error ?? "unknown_error"
          }`,
          { streamStarted, partialReply: reply },
        );
      }

      const providerMetadata = await streamResult.providerMetadata;
      return {
        reply,
        responseId: extractResponseId(
          providerMetadata as OpenAIProviderMetadata | undefined,
        ),
      };
    };

    const runChannelPseudoStreaming = async (): Promise<{
      reply: string;
      responseId?: string;
    }> => {
      console.log("Slack reply mode: pseudo-streaming in channel");
      const streamResult = streamText({
        model: openAI(env.GPT_MODEL),
        prompt: content,
        providerOptions: {
          openai: openAIOptions,
        },
      });

      let reply = "";
      let messageTs: string | undefined;
      let pendingChars = 0;
      let lastUpdateAt = Date.now();

      const fallbackReply =
        "Failed to generate a response. Please try again in a moment.";

      const postInitialMessage = async (text: string): Promise<string> => {
        const postResponse = await client.chat.postMessage({
          channel: inputs.channelId,
          text,
        }) as SlackMessageResponse;
        if (!postResponse.ok || !postResponse.ts) {
          throw new Error(
            `Failed to post pseudo-stream message: ${
              postResponse.error ?? "unknown_error"
            }`,
          );
        }
        return postResponse.ts;
      };

      const updateMessage = async (ts: string, text: string): Promise<void> => {
        const updateResponse = await client.chat.update({
          channel: inputs.channelId,
          ts,
          text,
        }) as SlackMessageResponse;
        if (!updateResponse.ok) {
          throw new Error(
            `Failed to update pseudo-stream message: ${
              updateResponse.error ?? "unknown_error"
            }`,
          );
        }
      };

      try {
        for await (const chunk of streamResult.textStream) {
          reply += chunk;
          if (!messageTs) {
            messageTs = await postInitialMessage(reply);
            lastUpdateAt = Date.now();
            continue;
          }

          pendingChars += chunk.length;
          const now = Date.now();
          const elapsedMs = now - lastUpdateAt;
          if (!shouldFlushChannelPseudoStream(pendingChars, elapsedMs)) {
            continue;
          }

          await updateMessage(messageTs, reply);
          pendingChars = 0;
          lastUpdateAt = now;
        }

        if (!messageTs) {
          throw new Error("No stream output produced.");
        }

        if (pendingChars > 0) {
          await updateMessage(messageTs, reply);
        }

        const providerMetadata = await streamResult.providerMetadata;
        return {
          reply,
          responseId: extractResponseId(
            providerMetadata as OpenAIProviderMetadata | undefined,
          ),
        };
      } catch (error) {
        console.warn(
          `Pseudo-streaming mode failed. Falling back to static message. Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        try {
          if (messageTs) {
            await updateMessage(messageTs, fallbackReply);
          } else {
            await postInitialMessage(fallbackReply);
          }
        } catch (_fallbackSlackError) {
          // Ignore fallback posting errors and return a safe reply string.
        }
        return { reply: fallbackReply };
      }
    };

    let reply: string;
    let responseId: string | undefined;

    if (canStream) {
      try {
        const streamOutcome = await runStreaming();
        reply = streamOutcome.reply;
        responseId = streamOutcome.responseId;
      } catch (error) {
        const streamError = error instanceof StreamingReplyError
          ? error
          : undefined;
        const errorMessage = error instanceof Error
          ? error.message
          : String(error);
        if (streamError?.streamStarted) {
          console.warn(
            `Streaming mode failed after stream started. Skipping fallback to avoid duplicate replies. Error: ${errorMessage}`,
          );
          return {
            outputs: {
              reply: streamError.partialReply,
            },
          };
        }
        console.warn(
          `Streaming mode failed before stream start. Falling back to non-streaming mode. Error: ${errorMessage}`,
        );
        const nonStreamingOutcome = await runNonStreaming({
          threadTs: replyInThread ? threadTs : undefined,
        });
        reply = nonStreamingOutcome.reply;
        responseId = nonStreamingOutcome.responseId;
      }
    } else if (!replyInThread) {
      const pseudoStreamingOutcome = await runChannelPseudoStreaming();
      reply = pseudoStreamingOutcome.reply;
      responseId = pseudoStreamingOutcome.responseId;
    } else {
      if (!streamTeamId) {
        console.log("Streaming disabled: SLACK_TEAM_ID is not configured.");
      } else {
        console.log("Streaming disabled: userId/messageTs is missing.");
      }
      const nonStreamingOutcome = await runNonStreaming({
        threadTs: replyInThread ? threadTs : undefined,
      });
      reply = nonStreamingOutcome.reply;
      responseId = nonStreamingOutcome.responseId;
    }

    if (!responseId) {
      return {
        outputs: {
          reply,
        },
      };
    }

    const updateSessionResponse = await client.apps.datastore.update<
      typeof ConversationSessionDatastore.definition
    >({
      datastore: "MessageHistory",
      item: {
        channelId: sessionChannelId,
        systemMessage,
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

    return {
      outputs: {
        reply,
      },
    };
  },
);
