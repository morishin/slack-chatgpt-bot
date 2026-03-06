import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";

export const ConversationSessionDatastore = DefineDatastore({
  name: "ConversationSession",
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
  },
});
