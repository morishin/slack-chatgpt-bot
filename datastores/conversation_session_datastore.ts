import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";

export const ConversationSessionDatastore = DefineDatastore({
  // Keep Slack datastore name as "MessageHistory" for backward compatibility
  // so existing production systemMessage records are preserved.
  name: "MessageHistory",
  primary_key: "channelId",
  attributes: {
    channelId: {
      type: Schema.types.string,
    },
    systemMessage: {
      type: Schema.types.string,
    },
    previousResponseId: {
      type: Schema.types.string,
    },
    lastInteractionAt: {
      type: Schema.types.number,
    },
    replyInThread: {
      type: Schema.types.boolean,
    },
  },
});
