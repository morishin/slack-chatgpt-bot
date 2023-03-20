import { Trigger } from "deno-slack-api/types.ts";
import { ConfigurePromptWorkflow } from "../workflows/configure_prompt_workflow.ts";

const trigger: Trigger<typeof ConfigurePromptWorkflow.definition> = {
  type: "shortcut",
  name: "Configure ChatGPT bot prompt",
  description: "Configure a prompt message for ChatGPT",
  workflow: `#/workflows/${ConfigurePromptWorkflow.definition.callback_id}`,
  inputs: {
    interactivity: {
      value: "{{data.interactivity}}",
    },
    channelId: {
      value: "{{data.channel_id}}",
    },
  },
};

export default trigger;
