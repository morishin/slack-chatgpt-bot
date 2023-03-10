import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { GenerateReplyFunctionDefinition } from "../functions/generate_reply_function.ts";

export const ReplyWorkflow = DefineWorkflow({
  callback_id: "reply_workflow",
  title: "Reply workflow",
  input_parameters: {
    properties: {
      channelId: { type: Schema.slack.types.channel_id },
      message: { type: Schema.types.string },
    },
    required: ["channelId", "message"],
  },
});

const replyWorkflowStep = ReplyWorkflow.addStep(
  GenerateReplyFunctionDefinition,
  {
    message: ReplyWorkflow.inputs.message,
  },
);

ReplyWorkflow.addStep(Schema.slack.functions.SendMessage, {
  channel_id: ReplyWorkflow.inputs.channelId,
  message: replyWorkflowStep.outputs.reply,
});
