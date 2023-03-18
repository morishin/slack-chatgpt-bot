import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { GenerateReplyFunctionDefinition } from "../functions/generate_reply/generate_reply_function.ts";
import { PutMessageHistoryFunctionDefinition } from "../functions/put_message_history/put_message_history_function.ts";

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

// Generate a reply message with calling ChatGPT API
const generateReplyFunctionOutput = ReplyWorkflow.addStep(
  GenerateReplyFunctionDefinition,
  {
    systemMessage: putMessageHistoryFunctionOutput.outputs.systemMessage,
    latestMessages: putMessageHistoryFunctionOutput.outputs.latestMessages,
  },
);

// Post a reply message to Slack
ReplyWorkflow.addStep(Schema.slack.functions.SendMessage, {
  channel_id: ReplyWorkflow.inputs.channelId,
  message: generateReplyFunctionOutput.outputs.reply,
});

// Save a reply message to MessageHistoryDatastore
ReplyWorkflow.addStep(
  PutMessageHistoryFunctionDefinition,
  {
    channelId: ReplyWorkflow.inputs.channelId,
    message: generateReplyFunctionOutput.outputs.reply,
    isUserMessage: false,
  },
);
