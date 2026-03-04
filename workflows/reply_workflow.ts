import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { StreamReplyFunctionDefinition } from "../functions/stream_reply/stream_reply_function.ts";

export const ReplyWorkflow = DefineWorkflow({
  callback_id: "reply_workflow",
  title: "Reply workflow",
  input_parameters: {
    properties: {
      channelId: { type: Schema.slack.types.channel_id },
      message: { type: Schema.types.string },
      userId: { type: Schema.slack.types.user_id },
      teamId: { type: Schema.slack.types.team_id },
      messageTs: { type: Schema.slack.types.timestamp },
      threadTs: { type: Schema.slack.types.timestamp },
    },
    required: ["channelId", "message"],
  },
});

ReplyWorkflow.addStep(StreamReplyFunctionDefinition, {
  channelId: ReplyWorkflow.inputs.channelId,
  message: ReplyWorkflow.inputs.message,
  userId: ReplyWorkflow.inputs.userId,
  teamId: ReplyWorkflow.inputs.teamId,
  messageTs: ReplyWorkflow.inputs.messageTs,
  threadTs: ReplyWorkflow.inputs.threadTs,
});
