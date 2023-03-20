import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { ConfigureSystemMessageModalFunctionDefinition } from "../functions/configure_system_message_modal/configure_system_message_modal_function.ts";

export const ConfigureSystemMessageWorkflow = DefineWorkflow({
  callback_id: "configure_system_message",
  title: "Configure system message",
  description: "Configure a system message for ChatGPT",
  input_parameters: {
    properties: {
      interactivity: { type: Schema.slack.types.interactivity },
      channelId: {
        type: Schema.slack.types.channel_id,
      },
    },
    required: ["interactivity", "channelId"],
  },
});

ConfigureSystemMessageWorkflow.addStep(
  ConfigureSystemMessageModalFunctionDefinition,
  {
    channelId: ConfigureSystemMessageWorkflow.inputs.channelId,
    interactivityPointer:
      ConfigureSystemMessageWorkflow.inputs.interactivity.interactivity_pointer,
  },
);
