import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";

import { env } from "../../env.ts";
import { Message as ConversationMessage, MessageType } from "../types/message_type.ts";

export const StreamReplyFunctionDefinition = DefineFunction({
  callback_id: "stream_reply_function",
  title: "Stream reply function",
  source_file: "functions/stream_reply/stream_reply_function.ts",
  input_parameters: {
    properties: {
      channelId: {
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
      systemMessage: {
        type: Schema.types.string,
      },
      latestMessages: {
        type: Schema.types.array,
        items: {
          type: MessageType,
        },
      },
      skip: {
        type: Schema.types.boolean,
      },
    },
    required: ["channelId", "latestMessages"],
  },
  output_parameters: {
    properties: {
      reply: {
        type: Schema.types.string,
      },
      skipped: {
        type: Schema.types.boolean,
      },
    },
    required: ["reply"],
  },
});

type State = {
  reply: string;
};

type OpenAIStreamChunk = {
  choices?: Array<{
    delta?: Partial<ConversationMessage>;
  }>;
};

type SlackStreamResponse = {
  ok: boolean;
  error?: string;
  ts?: string;
};

const generateNonStreamingReply = async (
  messages: { role: string; content: string }[],
  openAIKey: string,
): Promise<string> => {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${openAIKey}`,
    },
    body: JSON.stringify({
      model: env.GPT_MODEL,
      messages,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `OpenAI API request failed (non-stream): ${response.status} ${response.statusText}`,
    );
  }

  const completion = await response.json();
  return completion.choices?.[0]?.message?.content ?? "";
};

const processOpenAIStreamLine = (
  rawLine: string,
  state: State,
): string | null => {
  const line = rawLine.trim();
  if (!line.startsWith("data:")) {
    return null;
  }

  const payload = line.replace(/^data:\s?/, "");
  if (!payload || payload === "[DONE]") {
    return null;
  }

  let chunk: OpenAIStreamChunk;
  try {
    chunk = JSON.parse(payload) as OpenAIStreamChunk;
  } catch (error) {
    console.warn(`Failed to parse stream chunk: ${payload}`, error);
    return null;
  }

  const content = chunk.choices?.[0]?.delta?.content;
  if (!content) {
    return null;
  }

  state.reply += content;
  return content;
};

export default SlackFunction(
  StreamReplyFunctionDefinition,
  async ({ inputs, client, env: slackEnv }) => {
    if (inputs.skip) {
      console.log("Skipping: StreamReplyFunction");
      return {
        outputs: {
          reply: "",
          skipped: true,
        },
      };
    }

    const messages: { role: string; content: string }[] = [
      {
        role: "system",
        content: inputs.systemMessage ?? env.INITIAL_SYSTEM_MESSAGE,
      },
      ...inputs.latestMessages,
    ];
    console.log(
      `Payload to send to ChatGPT API: ${JSON.stringify(messages, null, 2)}`,
    );

    const hasStreamingContext = Boolean(inputs.userId && inputs.teamId);
    if (!hasStreamingContext) {
      console.warn(
        "Streaming context is incomplete. Falling back to non-streaming reply.",
      );
      const reply = await generateNonStreamingReply(
        messages,
        slackEnv.OPENAI_API_KEY,
      );
      await client.chat.postMessage({
        channel: inputs.channelId,
        text: reply,
      });
      return { outputs: { reply } };
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${slackEnv.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.GPT_MODEL,
        messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `OpenAI API request failed (stream): ${response.status} ${response.statusText}`,
      );
    }

    const state: State = { reply: "" };
    const effectiveThreadTs = inputs.threadTs ?? inputs.messageTs;

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

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Failed to get reader from response");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const content = processOpenAIStreamLine(line, state);
        if (!content) continue;

        pending += content;
        if (pending.length >= 80) {
          await flushPending();
        }
      }
    }

    if (buffer.length > 0) {
      const content = processOpenAIStreamLine(buffer, state);
      if (content) {
        pending += content;
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

    return { outputs: { reply: state.reply } };
  },
);
