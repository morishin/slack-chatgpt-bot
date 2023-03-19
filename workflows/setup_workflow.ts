import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { SetupModalFunctionDefinition } from "../functions/setup_modal/setup_modal_function.ts";

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
    required: ["interactivity", "channelId"],
  },
});

SetupWorkflow.addStep(
  SetupModalFunctionDefinition,
  {
    channelId: SetupWorkflow.inputs.channelId,
    interactivityPointer:
      SetupWorkflow.inputs.interactivity.interactivity_pointer,
  },
);
