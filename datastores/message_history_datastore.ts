import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";

export const MessageHistoryDatastore = DefineDatastore({
  name: "MessageHistory",
  primary_key: "channelId",
  attributes: {
    channelId: {
      type: Schema.types.string,
    },
    systemMessage: {
      type: Schema.types.string,
    },
  },
});
