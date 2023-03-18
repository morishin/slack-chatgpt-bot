import { Trigger } from "deno-slack-api/types.ts";
import { SetupWorkflow } from "../workflows/setup_workflow.ts";

const trigger: Trigger<typeof SetupWorkflow.definition> = {
  type: "shortcut",
  name: "Setup ChatGPT bot",
  description: "Setup ChatGPT bot",
  workflow: `#/workflows/${SetupWorkflow.definition.callback_id}`,
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
