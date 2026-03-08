import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { ConfigureChannelsModalFunctionDefinition } from "../functions/configure_channels_modal/configure_channels_modal_function.ts";

export const ConfigureChannelsWorkflow = DefineWorkflow({
  callback_id: "configure_channels",
  title: "Select channels where ChagGPT bot works",
  description:
    "Create or update event triggers (`app_mentioned` and `message_posted`) with specified channel IDs",
  input_parameters: {
    properties: {
      interactivity: { type: Schema.slack.types.interactivity },
    },
    required: ["interactivity"],
  },
});

ConfigureChannelsWorkflow.addStep(
  ConfigureChannelsModalFunctionDefinition,
  {
    interactivityPointer:
      ConfigureChannelsWorkflow.inputs.interactivity.interactivity_pointer,
  },
);
