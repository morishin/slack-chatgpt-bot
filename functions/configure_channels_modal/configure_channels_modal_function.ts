import { EventTriggerResponseObject } from "deno-slack-api/typed-method-types/workflows/triggers/event.ts";
import {
  TriggerContextData,
  ValidTriggerTypes,
} from "deno-slack-api/typed-method-types/workflows/triggers/mod.ts";
import { TriggerEventTypes } from "deno-slack-api/typed-method-types/workflows/triggers/trigger-event-types.ts";
import { SlackAPIClient } from "deno-slack-api/types.ts";
import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";

const REPLY_WORKFLOW_CALLBACK_ID = "reply_workflow";

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
    const triggers = await findReplyWorkflowEventTriggers(client);
    const existingChannelIds = [
      ...new Set(
        triggers.flatMap((trigger) => trigger.channel_ids),
      ),
    ];

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
    const triggers = await findReplyWorkflowEventTriggers(client);

    const inputChannelIds = view.state.values.channels_block.channel
      .selected_channels as string[];
    if (inputChannelIds.length === 0) {
      return { error: "Please select at least one channel" };
    }

    if (triggers.length > 0) {
      await Promise.all(
        triggers.map((trigger) => deleteTrigger(client, trigger.id)),
      );
      console.log(
        `💥 Existing reply triggers removed: ${
          JSON.stringify(
            triggers.map((trigger) => ({
              id: trigger.id,
              event_type: trigger.event_type,
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
        createReplyTriggers(client, channelId)
      ),
    );
    const createErrors = createResponse.filter((res) => res.error);
    if (createErrors.length > 0) {
      return {
        error: `Failed to create triggers for all channels: ${
          createErrors[0].error
        }`,
      };
    }

    console.log(
      `✅ New triggers created: ${
        JSON.stringify(
          createResponse.flatMap((res) => res.triggers).map((trigger) => ({
            id: trigger?.id,
            event_type: trigger?.event_type,
            channel_ids: trigger?.channel_ids,
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

const findReplyWorkflowEventTriggers = async (client: SlackAPIClient): Promise<
  EventTriggerResponseObject<any>[]
> => {
  const allTriggers = await client.workflows.triggers.list({ is_owner: true });
  if (!allTriggers.ok) {
    throw new Error("Failed to fetch triggers list");
  }

  // Find reply workflow event triggers to update.
  const existingTriggers = allTriggers.triggers.filter((trigger) =>
    trigger.workflow.callback_id === REPLY_WORKFLOW_CALLBACK_ID &&
    (trigger.event_type === TriggerEventTypes.AppMentioned ||
      trigger.event_type === TriggerEventTypes.MessagePosted)
  ) as EventTriggerResponseObject<any>[];

  return existingTriggers;
};

const createReplyTriggers = async (
  client: SlackAPIClient,
  channelId: string,
): Promise<{
  error?: string;
  triggers: EventTriggerResponseObject<any>[];
}> => {
  const mention = await createReplyTrigger(
    client,
    makeMentionTriggerConfig(channelId),
  );
  if (!mention.ok || !mention.trigger) {
    return { error: mention.error, triggers: [] };
  }

  const threadFollowup = await createReplyTrigger(
    client,
    makeThreadFollowupTriggerConfig(channelId),
  );
  if (!threadFollowup.ok || !threadFollowup.trigger) {
    await deleteTrigger(client, mention.trigger.id);
    return { error: threadFollowup.error, triggers: [] };
  }

  return { triggers: [mention.trigger, threadFollowup.trigger] };
};

const createReplyTrigger = async (
  client: SlackAPIClient,
  config: ValidTriggerTypes<any>,
): Promise<{
  ok: boolean;
  error?: string;
  trigger?: EventTriggerResponseObject<any>;
}> => {
  const createTriggerResponse = await client.workflows.triggers.create(config);
  if (!createTriggerResponse.ok) {
    return { ok: false, error: createTriggerResponse.error };
  }

  return { ok: true, trigger: createTriggerResponse.trigger };
};

const deleteTrigger = (client: SlackAPIClient, triggerId: string) =>
  client.workflows.triggers.delete({ trigger_id: triggerId });

const makeMentionTriggerConfig = (
  channelId: string,
): ValidTriggerTypes<any> => (
  {
    type: "event",
    name: "mention trigger",
    workflow: `#/workflows/${REPLY_WORKFLOW_CALLBACK_ID}`,
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
      eventType: {
        value: TriggerContextData.Event.AppMentioned.event_type,
      },
    },
    event: {
      event_type: TriggerEventTypes.AppMentioned,
      channel_ids: [channelId],
    },
  }
);

const makeThreadFollowupTriggerConfig = (
  channelId: string,
): ValidTriggerTypes<any> => {
  // Build filter statements from TriggerContextData constants to avoid
  // hard-coded placeholder strings.
  // Example value: "{{data.thread_ts}}"
  const threadTs = TriggerContextData.Event.MessagePosted.thread_ts;
  const userId = TriggerContextData.Event.MessagePosted.user_id;
  return {
    type: "event",
    name: "thread follow-up trigger",
    workflow: `#/workflows/${REPLY_WORKFLOW_CALLBACK_ID}`,
    inputs: {
      channelId: {
        value: TriggerContextData.Event.MessagePosted.channel_id,
      },
      message: {
        value: TriggerContextData.Event.MessagePosted.text,
      },
      userId: {
        value: TriggerContextData.Event.MessagePosted.user_id,
      },
      // Use parent ts so replies stay in the same thread.
      messageTs: {
        value: TriggerContextData.Event.MessagePosted.thread_ts,
      },
      eventType: {
        value: TriggerContextData.Event.MessagePosted.event_type,
      },
    },
    event: {
      event_type: TriggerEventTypes.MessagePosted,
      channel_ids: [channelId],
      filter: {
        version: 1,
        root: {
          operator: "AND",
          inputs: [
            {
              operator: "NOT",
              inputs: [
                {
                  statement: `${threadTs} == null`,
                },
              ],
            },
            {
              operator: "NOT",
              inputs: [
                {
                  statement: `${userId} == null`,
                },
              ],
            },
          ],
        },
      },
    },
  };
};
