import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";

import { env } from "../../env.ts";
import { Message, MessageType } from "../types/message_type.ts";

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
  currentMessage: string;
  lastSentMessage: string | null;
  messageTimestamp: string | null;
  done: boolean;
};

export default SlackFunction(
  StreamReplyFunctionDefinition,
  async ({ inputs, client, env: slackEnv }) => {
    // This and the following functions should be skipped if skip is true
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

    const postMessage = async (state: State) => {
      if (
        state.currentMessage.length === 0 ||
        state.currentMessage === state.lastSentMessage
      ) return;

      const text = state.currentMessage + (state.done ? "↵" : "");

      if (state.messageTimestamp === null) {
        const message = await client.chat.postMessage({
          text,
          channel: inputs.channelId,
        });
        if (!message.ok) {
          throw new Error("Failed to post message");
        }
        state.messageTimestamp = message.ts;
        return;
      }

      await client.chat.update({
        text,
        channel: inputs.channelId,
        ts: state.messageTimestamp,
      });
      state.lastSentMessage = state.currentMessage;
    };

    const state: State = {
      currentMessage: "",
      lastSentMessage: null,
      messageTimestamp: null,
      done: false,
    };
    const intervalId = setInterval(() => postMessage(state), 500);

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("Failed to get reader from response");
    }
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const chunk = decoder.decode(value);
      chunk.split("\n").filter((line) => line.startsWith("data: ")).forEach(
        (line) => {
          const rawMessage = line.replace(/^data: /, "");
          if (rawMessage === "[DONE]") {
            state.done = true;
            return;
          }
          const data = JSON.parse(rawMessage);
          const message = data.choices[0].delta as Partial<Message>;
          if (message.content) {
            state.currentMessage += message.content;
          }
        },
      );
    }

    clearInterval(intervalId);
    await postMessage(state);

    return { outputs: { reply: state.currentMessage } };
  },
);
