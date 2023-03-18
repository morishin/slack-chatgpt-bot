import { Trigger } from "deno-slack-api/types.ts";
import { PopulatedArray } from "https://deno.land/x/deno_slack_api@1.7.0/type-helpers.ts";
import { TriggerEventTypes } from "https://deno.land/x/deno_slack_api@1.7.0/typed-method-types/workflows/triggers/trigger-event-types.ts";
import { env } from "../.env.ts";
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
    channel_ids: env.SLACK_CHANNEL_IDS as PopulatedArray<string>,
  },
};

export default trigger;
