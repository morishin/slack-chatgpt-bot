import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { ConfigurePromptModalFunctionDefinition } from "../functions/configure_prompt_modal/configure_prompt_modal_function.ts";

export const ConfigurePromptWorkflow = DefineWorkflow({
  callback_id: "configure_prompt",
  title: "Configure prompt",
  description: "Configure a prompt message for ChatGPT",
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

ConfigurePromptWorkflow.addStep(
  ConfigurePromptModalFunctionDefinition,
  {
    channelId: ConfigurePromptWorkflow.inputs.channelId,
    interactivityPointer:
      ConfigurePromptWorkflow.inputs.interactivity.interactivity_pointer,
  },
);
