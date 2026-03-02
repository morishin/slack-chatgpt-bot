import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";

export const SystemMessageDatastore = DefineDatastore({
  // Keep the datastore name for backward compatibility with existing production data.
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
