import { EventTriggerResponseObject } from "deno-slack-api/typed-method-types/workflows/triggers/event.ts";
import {
  TriggerContextData,
  ValidTriggerTypes,
} from "deno-slack-api/typed-method-types/workflows/triggers/mod.ts";
import { TriggerEventTypes } from "deno-slack-api/typed-method-types/workflows/triggers/trigger-event-types.ts";
import { SlackAPIClient } from "deno-slack-api/types.ts";
import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { ReplyWorkflow } from "../../workflows/reply_workflow.ts";

export const ConfigureChannelsModalFunctionDefinition = DefineFunction({
  callback_id: "configure_channels_modal_function",
  title: "Configure channels where ChatGPT bot works",
  source_file:
    "functions/configure_channels_modal/configure_channels_modal_function.ts",
  input_parameters: {
    properties: {
      interactivityPointer: { type: Schema.types.string },
    },
    required: ["interactivityPointer"],
  },
});

export default SlackFunction(
  ConfigureChannelsModalFunctionDefinition,
  async ({ inputs, client }) => {
    const triggers = await findMentionTriggers(client);
    const existingChannelIds = triggers.flatMap((trigger) =>
      trigger.channel_ids
    );

    const response = await client.views.open({
      interactivity_pointer: inputs.interactivityPointer,
      view: buildModalView(existingChannelIds),
    });
    if (!response.ok) {
      return { error: `Failed to open configurator modal: ${response.error}` };
    }

    // Set this to continue the interaction with this user
    return { completed: false };
  },
).addViewSubmissionHandler(
  ["configure_channels_modal_view"],
  async ({ view, client }) => {
    const triggers = await findMentionTriggers(client);

    const obsoleteTriggers = triggers.filter((trigger) =>
      trigger.channel_ids.length > 1
    );
    if (obsoleteTriggers.length > 0) {
      console.log(`${obsoleteTriggers.length} obsolete triggers found`);
      await Promise.all(
        obsoleteTriggers.map((trigger) => deleteTrigger(client, trigger.id)),
      );
      console.log(
        `💥 Obsolete triggers removed: ${
          JSON.stringify(obsoleteTriggers.map((trigger) => trigger.id))
        }`,
      );
    }

    const inputChannelIds = view.state.values.channels_block.channel
      .selected_channels as string[];
    if (inputChannelIds.length === 0) {
      return { error: "Please select at least one channel" };
    }

    const singleChannelTriggers = triggers.filter((trigger) =>
      trigger.channel_ids.length === 1
    );
    if (singleChannelTriggers.length > 0) {
      await Promise.all(
        singleChannelTriggers.map((trigger) =>
          deleteTrigger(client, trigger.id)
        ),
      );
      console.log(
        `💥 Triggers removed: ${
          JSON.stringify(
            singleChannelTriggers.map((trigger) => ({
              id: trigger.id,
              channel_ids: trigger.channel_ids,
            })),
            null,
            2,
          )
        }`,
      );
    }

    const createResponse = await Promise.all(
      inputChannelIds.map((channelId) =>
        createMentionTrigger(client, channelId)
      ),
    );
    console.log(
      `✅ New triggers created: ${
        JSON.stringify(
          createResponse.map((res) => ({
            id: res.trigger?.id,
            channel_ids: res.trigger?.channel_ids,
          })),
          null,
          2,
        )
      }`,
    );

    return {
      response_action: "update",
      view: {
        type: "modal",
        callback_id: "configure_channels_modal_view",
        notify_on_close: true,
        title: {
          type: "plain_text",
          text: "Select channels",
        },
        blocks: [
          {
            type: "section",
            text: {
              type: "plain_text",
              text: "✅ Saved!",
            },
          },
        ],
      },
    };
  },
).addViewClosedHandler(
  ["configure_channels_modal_view"],
  () => ({ outputs: {}, completed: true }),
);

const buildModalView = (channelIds: string[]) => ({
  type: "modal",
  callback_id: "configure_channels_modal_view",
  title: {
    type: "plain_text",
    text: "Select channels",
  },
  submit: {
    type: "plain_text",
    text: "Save",
  },
  blocks: [
    {
      type: "input",
      block_id: "channels_block",
      element: {
        type: "multi_channels_select",
        placeholder: {
          type: "plain_text",
          text: "Select channels where ChatGPT bot works",
        },
        initial_channels: channelIds,
        action_id: "channel",
      },
      label: {
        type: "plain_text",
        text: "Channels where ChatGPT bot works",
      },
    },
  ],
});

const findMentionTriggers = async (client: SlackAPIClient): Promise<
  EventTriggerResponseObject<typeof ReplyWorkflow.definition>[]
> => {
  const allTriggers = await client.workflows.triggers.list({ is_owner: true });
  if (!allTriggers.ok) {
    throw new Error("Failed to fetch triggers list");
  }

  // Find app_mention event triggers to update
  const existingTriggers = allTriggers.triggers.filter((trigger) =>
    trigger.workflow.callback_id ===
      ReplyWorkflow.definition.callback_id &&
    trigger.event_type === TriggerEventTypes.AppMentioned
  ) as EventTriggerResponseObject<typeof ReplyWorkflow.definition>[];

  return existingTriggers;
};

const createMentionTrigger = async (
  client: SlackAPIClient,
  channelId: string,
): Promise<{
  error?: string;
  trigger?: EventTriggerResponseObject<typeof ReplyWorkflow.definition>;
}> => {
  const createTriggerResponse = await client.workflows.triggers.create<
    typeof ReplyWorkflow.definition
  >(makeMentionTriggerConfig(channelId));
  if (!createTriggerResponse.ok) {
    return { error: createTriggerResponse.error };
  }

  return { trigger: createTriggerResponse.trigger };
};

const deleteTrigger = (client: SlackAPIClient, triggerId: string) =>
  client.workflows.triggers.delete({ trigger_id: triggerId });

const makeMentionTriggerConfig = (channelId: string): ValidTriggerTypes<
  typeof ReplyWorkflow.definition
> => (
  {
    type: "event",
    name: "mention trigger",
    workflow: `#/workflows/${ReplyWorkflow.definition.callback_id}`,
    inputs: {
      channelId: {
        value: TriggerContextData.Event.AppMentioned.channel_id,
      },
      message: {
        value: TriggerContextData.Event.AppMentioned.text,
      },
      userId: {
        value: TriggerContextData.Event.AppMentioned.user_id,
      },
      messageTs: {
        value: TriggerContextData.Event.AppMentioned.message_ts,
      },
      eventTimestamp: {
        value: TriggerContextData.Event.AppMentioned.event_timestamp,
      },
    },
    event: {
      event_type: TriggerEventTypes.AppMentioned,
      channel_ids: [channelId],
    },
  }
);
