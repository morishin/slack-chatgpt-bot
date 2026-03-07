import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { generateText, streamText } from "npm:ai";
import {
  createOpenAI,
  type OpenAILanguageModelResponsesOptions,
} from "npm:@ai-sdk/openai";

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

export const streamReplyInternals = {
  getChainTimeoutMs,
  getPreviousResponseId,
  toThreadTs,
};

export default SlackFunction(
  StreamReplyFunctionDefinition,
  async ({ inputs, client, env: slackEnv }) => {
    const content = trimMention(inputs.systemMessage);
    if (isBlank(content)) {
      console.log("Skipping: StreamReplyFunction (empty message)");
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
        await client.chat.postMessage({
          channel: inputs.channelId,
          ...(options?.threadTs ? { thread_ts: options.threadTs } : {}),
          text: reply,
        });
        return { reply };
      }

      const reply = result.text;
      await client.chat.postMessage({
        channel: inputs.channelId,
        ...(options?.threadTs ? { thread_ts: options.threadTs } : {}),
        text: reply,
      });
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
          throw new Error(
            `Failed to append Slack stream: ${
              appendResponse.error ?? "unknown_error"
            }`,
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
            throw new Error(
              `Failed to start Slack stream: ${
                startResponse.error ?? "unknown_error"
              }`,
            );
          }
          streamTs = startResponse.ts;
          continue;
        }

        pending += chunk;
        if (pending.length >= 160) {
          await appendStream();
        }
      }

      if (!streamTs) {
        throw new Error("No stream output produced.");
      }

      await appendStream();
      const stopResponse = await client.apiCall("chat.stopStream", {
        channel: inputs.channelId,
        ts: streamTs,
      }) as SlackStreamResponse;
      if (!stopResponse.ok) {
        throw new Error(
          `Failed to stop Slack stream: ${
            stopResponse.error ?? "unknown_error"
          }`,
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

    let reply: string;
    let responseId: string | undefined;

    if (canStream) {
      try {
        const streamOutcome = await runStreaming();
        reply = streamOutcome.reply;
        responseId = streamOutcome.responseId;
      } catch (error) {
        console.warn(
          `Streaming mode failed. Falling back to non-streaming mode. Error: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        const nonStreamingOutcome = await runNonStreaming({
          threadTs: replyInThread ? threadTs : undefined,
        });
        reply = nonStreamingOutcome.reply;
        responseId = nonStreamingOutcome.responseId;
      }
    } else {
      if (!replyInThread) {
        console.log(
          "Streaming disabled: channel is configured for non-thread replies.",
        );
      } else if (!streamTeamId) {
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
