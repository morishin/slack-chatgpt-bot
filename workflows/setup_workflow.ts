import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { env } from "../.env.ts";
import { SetupFunctionDefinition } from "../functions/setup/setup_function.ts";

export const SetupWorkflow = DefineWorkflow({
  callback_id: "setup_workflow",
  title: "Setup ChatGPT bot",
  input_parameters: {
    properties: {
      interactivity: { type: Schema.slack.types.interactivity },
      channelId: {
        type: Schema.slack.types.channel_id,
      },
    },
    required: ["interactivity"],
  },
});

const openFormStep = SetupWorkflow.addStep(
  Schema.slack.functions.OpenForm,
  {
    title: "Setup ChatGPT bot",
    interactivity: SetupWorkflow.inputs.interactivity,
    submit_label: "Save",
    fields: {
      elements: [{
        name: "channelId",
        title: "Channel where the system message is used",
        type: Schema.slack.types.channel_id,
        default: SetupWorkflow.inputs.channelId,
      }, {
        name: "systemMessage",
        title: "System message for ChatGPT",
        type: Schema.types.string,
        long: true,
        default: env.INITIAL_SYSTEM_MESSAGE, // TODO: 現在の設定値を入れる
      }],
      required: ["channelId", "systemMessage"],
    },
  },
);

SetupWorkflow.addStep(
  SetupFunctionDefinition,
  {
    channelId: openFormStep.outputs.fields.channelId,
    systemMessage: openFormStep.outputs.fields.systemMessage,
  },
);
