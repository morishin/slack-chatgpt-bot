import { DefineType, Schema } from "deno-slack-sdk/mod.ts";

export const MessageType = DefineType({
  name: "Message",
  type: Schema.types.object,
  properties: {
    role: {
      type: Schema.types.string,
    },
    content: {
      type: Schema.types.string,
    },
  },
  required: ["role", "content"],
});

type GPTRole = "assistant" | "user";
export type Message = { role: GPTRole; content: string };
