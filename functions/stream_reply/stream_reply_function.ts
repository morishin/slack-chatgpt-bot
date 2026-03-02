import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import {
  generateText,
  streamText,
  type ModelMessage,
} from "npm:ai";
import { createOpenAI } from "npm:@ai-sdk/openai";

import { env } from "../../env.ts";
import { MessageType } from "../types/message_type.ts";

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

type SlackStreamResponse = {
  ok: boolean;
  error?: string;
  ts?: string;
};

const buildMessages = (
  systemMessage: string | undefined,
  latestMessages: { role: string; content: string }[],
): ModelMessage[] => {
  return [
    {
      role: "system",
      content: systemMessage ?? env.INITIAL_SYSTEM_MESSAGE,
    },
    ...latestMessages.map((message) => ({
      role: message.role as "assistant" | "user",
      content: message.content,
    })),
  ];
};

const generateNonStreamingReply = async (
  messages: ModelMessage[],
  openAIKey: string,
): Promise<string> => {
  const openAI = createOpenAI({ apiKey: openAIKey });
  const { text } = await generateText({
    model: openAI(env.GPT_MODEL),
    messages,
  });
  return text;
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

    const messages = buildMessages(inputs.systemMessage, inputs.latestMessages);
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

    const openAI = createOpenAI({ apiKey: slackEnv.OPENAI_API_KEY });
    const streamResult = streamText({
      model: openAI(env.GPT_MODEL),
      messages,
    });

    let reply = "";
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

    for await (const content of streamResult.textStream) {
      if (!content) continue;

      reply += content;
      pending += content;
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

    return { outputs: { reply } };
  },
);
