import { Trigger } from "deno-slack-api/types.ts";
import { ConfigureSystemMessageWorkflow } from "../workflows/configure_system_message_workflow.ts";
import { TriggerContextData, TriggerTypes } from "deno-slack-api/mod.ts";

const trigger: Trigger<typeof ConfigureSystemMessageWorkflow.definition> = {
  type: TriggerTypes.Shortcut,
  name: "Configure ChatGPT system message",
  description: "Configure a system message to be sent to ChatGPT API",
  workflow:
    `#/workflows/${ConfigureSystemMessageWorkflow.definition.callback_id}`,
  inputs: {
    interactivity: {
      value: TriggerContextData.Shortcut.interactivity,
    },
    channelId: {
      value: TriggerContextData.Shortcut.channel_id,
    },
  },
};

export default trigger;
