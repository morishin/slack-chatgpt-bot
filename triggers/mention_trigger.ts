import { Trigger } from "deno-slack-api/types.ts";
import { TriggerEventTypes } from "https://deno.land/x/deno_slack_api@1.7.0/typed-method-types/workflows/triggers/trigger-event-types.ts";
import { ReplyWorkflow } from "../workflows/reply_workflow.ts";

const trigger: Trigger<typeof ReplyWorkflow.definition> = {
  type: "event",
  name: "mention trigger",
  workflow: `#/workflows/${ReplyWorkflow.definition.callback_id}`,
  inputs: {
    channelId: {
      value: "{{data.channel_id}}",
    },
    message: {
      value: "{{data.text}}",
    },
  },
  event: {
    event_type: TriggerEventTypes.AppMentioned,
    channel_ids: ["C04SXQZAJ6B"], // tmp
  },
};

export default trigger;
