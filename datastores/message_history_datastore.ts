import { DefineDatastore, Schema } from "deno-slack-sdk/mod.ts";
import { MessageType } from "../functions/types/message_type.ts";

export const MessageHistoryDatastore = DefineDatastore({
  name: "MessageHistory",
  primary_key: "channelId",
  attributes: {
    channelId: {
      type: Schema.types.string,
    },
    latestMessages: {
      type: Schema.types.array,
      items: {
        type: MessageType,
      },
    },
  },
});
