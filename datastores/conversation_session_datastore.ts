import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";

export const ConversationSessionDatastore = DefineDatastore({
  name: "ConversationSession",
  primary_key: "sessionKey",
  attributes: {
    sessionKey: {
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
