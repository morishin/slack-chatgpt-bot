import { Trigger } from "deno-slack-api/types.ts";
import { ConfigureChannelsWorkflow } from "../workflows/configure_channels_workflow.ts";

const trigger: Trigger<typeof ConfigureChannelsWorkflow.definition> = {
  type: "shortcut",
  name: "Invite ChatGPT bot",
  description: "Add/Remove channels where ChatGPT bot works",
  workflow: `#/workflows/${ConfigureChannelsWorkflow.definition.callback_id}`,
  inputs: {
    interactivity: {
      value: "{{data.interactivity}}",
    },
  },
};

export default trigger;
