import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { PutMessageHistoryFunctionDefinition } from "../functions/put_message_history/put_message_history_function.ts";
import { StreamReplyFunctionDefinition } from "../functions/stream_reply/stream_reply_function.ts";

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

// Save a user's message to MessageHistoryDatastore
const putMessageHistoryFunctionOutput = ReplyWorkflow.addStep(
  PutMessageHistoryFunctionDefinition,
  {
    channelId: ReplyWorkflow.inputs.channelId,
    message: ReplyWorkflow.inputs.message,
    isUserMessage: true,
  },
);

// Generate and post a reply message
const streamReplyFunctionOutput = ReplyWorkflow.addStep(
  StreamReplyFunctionDefinition,
  {
    channelId: ReplyWorkflow.inputs.channelId,
    systemMessage: putMessageHistoryFunctionOutput.outputs.systemMessage,
    latestMessages: putMessageHistoryFunctionOutput.outputs.latestMessages,
    skip: putMessageHistoryFunctionOutput.outputs.skipped,
  },
);

// Save a reply message to MessageHistoryDatastore
ReplyWorkflow.addStep(
  PutMessageHistoryFunctionDefinition,
  {
    channelId: ReplyWorkflow.inputs.channelId,
    message: streamReplyFunctionOutput.outputs.reply,
    isUserMessage: false,
    skip: streamReplyFunctionOutput.outputs.skipped,
  },
);
