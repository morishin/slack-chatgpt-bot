import { Trigger } from "deno-slack-api/types.ts";
import { ConfigureChannelsWorkflow } from "../workflows/configure_channels_workflow.ts";
import { TriggerContextData, TriggerTypes } from "deno-slack-api/mod.ts";

const trigger: Trigger<typeof ConfigureChannelsWorkflow.definition> = {
  type: TriggerTypes.Shortcut,
  name: "Invite ChatGPT bot",
  description: "Add/Remove channels where ChatGPT bot works",
  workflow: `#/workflows/${ConfigureChannelsWorkflow.definition.callback_id}`,
  inputs: {
    interactivity: {
      value: TriggerContextData.Shortcut.interactivity,
    },
  },
};

export default trigger;
