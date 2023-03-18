import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { GenerateReplyFunctionDefinition } from "../functions/generate_reply_function.ts";
import { PutMessageHistoryFunctionDefinition } from "../functions/put_message_history_function.ts";

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

// MessageHistoryDatastore にユーザの発言を保存する
const putMessageHistoryFunctionOutput = ReplyWorkflow.addStep(
  PutMessageHistoryFunctionDefinition,
  {
    channelId: ReplyWorkflow.inputs.channelId,
    message: ReplyWorkflow.inputs.message,
    isUserMessage: true,
  },
);

// ChatGPT API から返信を生成する
const generateReplyFunctionOutput = ReplyWorkflow.addStep(
  GenerateReplyFunctionDefinition,
  {
    latestMessages: putMessageHistoryFunctionOutput.outputs.latestMessages,
  },
);

// 返信を Slack に送信する
ReplyWorkflow.addStep(Schema.slack.functions.SendMessage, {
  channel_id: ReplyWorkflow.inputs.channelId,
  message: generateReplyFunctionOutput.outputs.reply,
});

// MessageHistoryDatastore に bot の返信を保存する
ReplyWorkflow.addStep(
  PutMessageHistoryFunctionDefinition,
  {
    channelId: ReplyWorkflow.inputs.channelId,
    message: generateReplyFunctionOutput.outputs.reply,
    isUserMessage: false,
  },
);
