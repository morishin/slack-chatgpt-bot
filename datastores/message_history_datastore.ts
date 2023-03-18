import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";

type GPTRole = "assistant" | "user";
export type Message = { role: GPTRole; content: string };

const MessageHistoryDatastore = DefineDatastore({
  name: "MessageHistory",
  primary_key: "channelId",
  attributes: {
    channelId: {
      type: Schema.types.string,
    },
    latestMessages: {
      // Message[]
      type: Schema.types.array,
    },
  },
});

export default MessageHistoryDatastore;
