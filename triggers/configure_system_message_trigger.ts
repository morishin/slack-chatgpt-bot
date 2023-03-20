import { Trigger } from "deno-slack-api/types.ts";
import { ConfigureSystemMessageWorkflow } from "../workflows/configure_system_message_workflow.ts";

const trigger: Trigger<typeof ConfigureSystemMessageWorkflow.definition> = {
  type: "shortcut",
  name: "Configure ChatGPT system message",
  description: "Configure a system message to be sent to ChatGPT API",
  workflow:
    `#/workflows/${ConfigureSystemMessageWorkflow.definition.callback_id}`,
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
