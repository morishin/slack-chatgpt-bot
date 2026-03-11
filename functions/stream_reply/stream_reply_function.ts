import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";

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

type SlackConversationRepliesResponse = {
  ok: boolean;
  error?: string;
  messages?: Array<{
    text?: string;
  }>;
};

type ConversationSession = {
  previousResponseId?: string;
  lastInteractionAt?: number;
};

type OpenAIResponsesApiResponse = Record<string, unknown>;

type OpenAIResponsesRequestInput = {
  apiKey: string;
  model: string;
  prompt: string;
  instructions: string;
  previousResponseId?: string;
  tools?: OpenAIResponseTool[];
};

const OPENAI_RESPONSES_API_URL = "https://api.openai.com/v1/responses";

type OpenAIResponseTool =
  | {
    type: "web_search";
  }
  | {
    type: "code_interpreter";
    container: {
      type: "auto";
    };
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

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const getStringField = (
  record: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const extractResponseId = (payload: unknown): string | undefined => {
  if (!isRecord(payload)) return undefined;
  return getStringField(payload, "id");
};

const extractResponseText = (payload: unknown): string => {
  if (!isRecord(payload)) return "";

  const outputText = payload["output_text"];
  if (typeof outputText === "string") {
    return outputText;
  }
  if (Array.isArray(outputText)) {
    const joinedOutputText = outputText
      .filter((part): part is string => typeof part === "string")
      .join("");
    if (joinedOutputText.length > 0) {
      return joinedOutputText;
    }
  }

  const output = payload["output"];
  if (!Array.isArray(output)) {
    return "";
  }

  const textParts: string[] = [];
  for (const item of output) {
    if (!isRecord(item)) continue;
    const content = item["content"];
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!isRecord(part)) continue;
      const partType = getStringField(part, "type");
      if (partType !== "output_text" && partType !== "text") continue;
      const text = getStringField(part, "text");
      if (text) textParts.push(text);
    }
  }
  return textParts.join("");
};

const extractToolCallTypes = (payload: unknown): string[] => {
  if (!isRecord(payload)) return [];
  const output = payload["output"];
  if (!Array.isArray(output)) return [];

  const toolTypes = new Set<string>();
  for (const item of output) {
    if (!isRecord(item)) continue;
    const itemType = getStringField(item, "type");
    if (itemType && itemType.endsWith("_call")) {
      toolTypes.add(itemType);
    }
  }
  return [...toolTypes];
};

const getConfiguredOpenAITools = (): OpenAIResponseTool[] => {
  const tools: OpenAIResponseTool[] = [];
  if (env.OPENAI_ENABLE_WEB_SEARCH) {
    tools.push({ type: "web_search" });
  }
  if (env.OPENAI_ENABLE_CODE_INTERPRETER) {
    tools.push({
      type: "code_interpreter",
      container: { type: "auto" },
    });
  }
  return tools;
};

const buildOpenAIResponsesRequestBody = (
  input: OpenAIResponsesRequestInput,
  stream: boolean,
): Record<string, unknown> => {
  return {
    model: input.model,
    input: input.prompt,
    instructions: input.instructions,
    ...(input.previousResponseId
      ? { previous_response_id: input.previousResponseId }
      : {}),
    ...(input.tools && input.tools.length > 0 ? { tools: input.tools } : {}),
    ...(stream ? { stream: true } : {}),
  };
};

const requestOpenAIResponses = async (
  input: OpenAIResponsesRequestInput,
  stream: boolean,
): Promise<Response> => {
  const response = await fetch(OPENAI_RESPONSES_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${input.apiKey}`,
      ...(stream ? { "Accept": "text/event-stream" } : {}),
    },
    body: JSON.stringify(buildOpenAIResponsesRequestBody(input, stream)),
  });

  if (response.ok) {
    return response;
  }

  const errorBody = await response.text().catch(() => "");
  const errorDetail = errorBody.length > 0
    ? errorBody.slice(0, 500)
    : response.statusText;
  throw new Error(
    `OpenAI Responses API request failed (${response.status}): ${errorDetail}`,
  );
};

const generateOpenAIResponse = async (
  input: OpenAIResponsesRequestInput,
): Promise<{ reply: string; responseId?: string; toolCallTypes: string[] }> => {
  const response = await requestOpenAIResponses(input, false);
  const payload = await response.json() as OpenAIResponsesApiResponse;
  const reply = extractResponseText(payload);
  if (reply.length === 0) {
    throw new Error("OpenAI Responses API returned empty output text.");
  }
  return {
    reply,
    responseId: extractResponseId(payload),
    toolCallTypes: extractToolCallTypes(payload),
  };
};

const streamOpenAIResponse = async (
  input: OpenAIResponsesRequestInput,
  onDelta: (delta: string) => Promise<void> | void,
): Promise<{ reply: string; responseId?: string; toolCallTypes: string[] }> => {
  const response = await requestOpenAIResponses(input, true);
  if (!response.body) {
    throw new Error("OpenAI Responses API stream body is missing.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";
  let responseId: string | undefined;
  const toolCallTypes = new Set<string>();

  const processEventData = async (data: string) => {
    if (data.length === 0 || data === "[DONE]") {
      return;
    }

    const payload = JSON.parse(data) as unknown;
    if (!isRecord(payload)) {
      return;
    }

    const type = getStringField(payload, "type");
    if (type === "response.output_text.delta") {
      const delta = getStringField(payload, "delta");
      if (delta) {
        reply += delta;
        await onDelta(delta);
      }
      const responseIdFromEvent = getStringField(payload, "response_id");
      if (responseIdFromEvent) {
        responseId = responseIdFromEvent;
      }
      return;
    }

    if (type === "response.created" || type === "response.completed") {
      const responsePayload = payload["response"];
      if (extractResponseId(responsePayload)) {
        responseId = extractResponseId(responsePayload);
      }
      if (type === "response.completed" && reply.length === 0) {
        const completedText = extractResponseText(responsePayload);
        if (completedText.length > 0) {
          reply = completedText;
          await onDelta(completedText);
        }
      }
      for (const toolCallType of extractToolCallTypes(responsePayload)) {
        toolCallTypes.add(toolCallType);
      }
      return;
    }

    if (type && type.includes("_call")) {
      const normalizedType = type.replace(/^response\./, "").replace(
        /\.(in_progress|completed|delta)$/,
        "",
      );
      if (normalizedType.endsWith("_call")) {
        toolCallTypes.add(normalizedType);
      }
      return;
    }

    if (type === "response.error" || type === "error") {
      const error = payload["error"];
      if (isRecord(error)) {
        const message = getStringField(error, "message");
        if (message) {
          throw new Error(`OpenAI Responses API stream error: ${message}`);
        }
      }
      throw new Error("OpenAI Responses API stream returned an error event.");
    }
  };

  const processEventBlock = async (eventBlock: string) => {
    if (eventBlock.trim().length === 0) {
      return;
    }
    const dataLines: string[] = [];
    for (const line of eventBlock.split("\n")) {
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
    if (dataLines.length === 0) {
      return;
    }
    await processEventData(dataLines.join("\n"));
  };

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true }).replaceAll("\r\n", "\n");
    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex !== -1) {
      const eventBlock = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      await processEventBlock(eventBlock);
      separatorIndex = buffer.indexOf("\n\n");
    }
  }

  buffer += decoder.decode();
  if (buffer.length > 0) {
    await processEventBlock(buffer);
  }

  if (reply.length === 0) {
    throw new Error("OpenAI Responses API stream returned no output text.");
  }

  return { reply, responseId, toolCallTypes: [...toolCallTypes] };
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

const hasSpecificMentionToken = (text: string, userId: string): boolean =>
  text.includes(`<@${userId}>`);

export const streamReplyInternals = {
  getChainTimeoutMs,
  getPreviousResponseId,
  extractResponseText,
  buildOpenAIResponsesRequestBody,
  toThreadTs,
  shouldFlushChannelPseudoStream,
  normalizeEventType,
  shouldHandleEventType,
  hasAnyMentionToken,
  hasSpecificMentionToken,
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
    if (normalizedEventType === "message_posted") {
      const authTestResponse = await client.auth.test();
      const botUserId = authTestResponse.ok
        ? authTestResponse.user_id
        : undefined;
      if (!botUserId) {
        console.log(
          `Skipping: StreamReplyFunction (failed auth.test for message_posted: ${authTestResponse.error ?? "unknown_error"})`,
        );
        return {
          outputs: {
            reply: "",
          },
        };
      }
      if (botUserId === inputs.userId) {
        console.log(
          "Skipping: StreamReplyFunction (message_posted from bot user)",
        );
        return {
          outputs: {
            reply: "",
          },
        };
      }

      const threadTs = toThreadTs(
        inputs.messageTs as string | number | undefined,
      );
      if (!threadTs) {
        console.log(
          "Skipping: StreamReplyFunction (message_posted without valid thread ts)",
        );
        return {
          outputs: {
            reply: "",
          },
        };
      }

      // Only continue thread follow-up if the thread root explicitly mentions this bot.
      const repliesResponse = await client.conversations.replies({
        channel: inputs.channelId,
        ts: threadTs,
        oldest: threadTs,
        inclusive: true,
        limit: 1,
      }) as SlackConversationRepliesResponse;
      if (!repliesResponse.ok) {
        console.log(
          `Skipping: StreamReplyFunction (failed to fetch thread root: ${repliesResponse.error ?? "unknown_error"})`,
        );
        return {
          outputs: {
            reply: "",
          },
        };
      }

      const rootText = repliesResponse.messages?.[0]?.text ?? "";
      if (!hasSpecificMentionToken(rootText, botUserId)) {
        console.log(
          "Skipping: StreamReplyFunction (thread root is not bot-mention initiated)",
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

    const openAIRequestInput: OpenAIResponsesRequestInput = {
      apiKey: slackEnv.OPENAI_API_KEY,
      model: env.GPT_MODEL,
      prompt: content,
      instructions: systemMessage,
      tools: getConfiguredOpenAITools(),
      ...(previousResponseId ? { previousResponseId } : {}),
    };
    console.log(
      `Configured OpenAI tools: ${
        openAIRequestInput.tools?.map((tool) => tool.type).join(", ") ??
          "none"
      }`,
    );

    const runNonStreaming = async (
      options?: { threadTs?: string },
    ): Promise<{
      reply: string;
      responseId?: string;
      toolCallTypes: string[];
    }> => {
      console.log("Slack reply mode: non-streaming");
      let result;
      try {
        result = await generateOpenAIResponse(openAIRequestInput);
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
        return { reply, toolCallTypes: [] };
      }

      const reply = result.reply;
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
        responseId: result.responseId,
        toolCallTypes: result.toolCallTypes,
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
      toolCallTypes: string[];
    }> => {
      console.log("Slack reply mode: streaming");

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

      const streamResult = await streamOpenAIResponse(
        openAIRequestInput,
        async (chunk) => {
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
            return;
          }

          pending += chunk;
          if (pending.length >= 160) {
            await appendStream();
          }
        },
      );

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

      return {
        reply: streamResult.reply,
        responseId: streamResult.responseId,
        toolCallTypes: streamResult.toolCallTypes,
      };
    };

    const runChannelPseudoStreaming = async (): Promise<{
      reply: string;
      responseId?: string;
      toolCallTypes: string[];
    }> => {
      console.log("Slack reply mode: pseudo-streaming in channel");

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
        const streamResult = await streamOpenAIResponse(
          openAIRequestInput,
          async (chunk) => {
            reply += chunk;
            if (!messageTs) {
              messageTs = await postInitialMessage(reply);
              lastUpdateAt = Date.now();
              return;
            }

            pendingChars += chunk.length;
            const now = Date.now();
            const elapsedMs = now - lastUpdateAt;
            if (!shouldFlushChannelPseudoStream(pendingChars, elapsedMs)) {
              return;
            }

            await updateMessage(messageTs, reply);
            pendingChars = 0;
            lastUpdateAt = now;
          },
        );

        if (!messageTs) {
          throw new Error("No stream output produced.");
        }

        if (pendingChars > 0) {
          await updateMessage(messageTs, reply);
        }

        return {
          reply: streamResult.reply,
          responseId: streamResult.responseId,
          toolCallTypes: streamResult.toolCallTypes,
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
        return { reply: fallbackReply, toolCallTypes: [] };
      }
    };

    let reply: string;
    let responseId: string | undefined;
    let toolCallTypes: string[] = [];

    if (canStream) {
      try {
        const streamOutcome = await runStreaming();
        reply = streamOutcome.reply;
        responseId = streamOutcome.responseId;
        toolCallTypes = streamOutcome.toolCallTypes;
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
        toolCallTypes = nonStreamingOutcome.toolCallTypes;
      }
    } else if (!replyInThread) {
      const pseudoStreamingOutcome = await runChannelPseudoStreaming();
      reply = pseudoStreamingOutcome.reply;
      responseId = pseudoStreamingOutcome.responseId;
      toolCallTypes = pseudoStreamingOutcome.toolCallTypes;
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
      toolCallTypes = nonStreamingOutcome.toolCallTypes;
    }

    if (toolCallTypes.length > 0) {
      console.log(`OpenAI tools used: ${toolCallTypes.join(", ")}`);
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
