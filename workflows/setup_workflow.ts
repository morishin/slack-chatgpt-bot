import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";

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

SetupWorkflow.addStep(
  Schema.slack.functions.OpenForm,
  {
    title: "Setup ChatGPT bot",
    interactivity: SetupWorkflow.inputs.interactivity,
    submit_label: "Save",
    fields: {
      elements: [{
        name: "channel_id",
        title: "Channel where the system message is used",
        type: Schema.slack.types.channel_id,
        default: SetupWorkflow.inputs.channelId,
      }, {
        name: "system_message",
        title: "System message for ChatGPT",
        type: Schema.types.string,
        long: true,
        default: "You are a helpful assistant.",
      }],
      required: ["system_message"],
    },
  },
);
