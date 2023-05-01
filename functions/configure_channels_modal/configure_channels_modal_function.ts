import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { PopulatedArray } from "deno-slack-api/type-helpers.ts";
import { EventTriggerResponseObject } from "deno-slack-api/typed-method-types/workflows/triggers/event.ts";
import { ValidTriggerTypes } from "deno-slack-api/typed-method-types/workflows/triggers/mod.ts";
import { TriggerEventTypes } from "deno-slack-api/typed-method-types/workflows/triggers/trigger-event-types.ts";
import { SlackAPIClient } from "deno-slack-api/types.ts";
import { env } from "../../env.ts";
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
    const { error, trigger } = await findOrCreateMentionTrigger(client);
    if (error) return { error };
    if (!trigger) return { error: "Trigger not found" };

    const response = await client.views.open({
      interactivity_pointer: inputs.interactivityPointer,
      view: buildModalView(trigger.id, trigger.channel_ids),
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
    const trigger = await findMentionTrigger(client);
    if (!trigger) return { error: "Trigger not found" };

    const channelIds = view.state.values.channels_block.channel
      .selected_channels as string[];
    if (channelIds.length === 0) {
      return { error: "Please select at least one channel" };
    }

    // Update the trigger
    const mentionTriggerConfig = Object.assign({
      trigger_id: trigger.id,
      ...mentionTriggerConfigBase,
    }, {
      event: {
        event_type: TriggerEventTypes.AppMentioned,
        channel_ids: channelIds as PopulatedArray<string>,
      },
    });
    const updateResponse = await client.workflows.triggers.update<
      typeof ReplyWorkflow.definition
    >(mentionTriggerConfig);
    if (updateResponse.error) {
      return { error: updateResponse.error };
    }

    if (!updateResponse.ok) {
      const error = `Failed to update a trigger: ${updateResponse.error}`;
      return { error };
    } else {
      console.log(
        `Mention Trigger Updated: ${JSON.stringify(updateResponse, null, 2)}`,
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
    }
  },
).addViewClosedHandler(
  ["configure_channels_modal_view"],
  () => ({ outputs: {}, completed: true }),
);

const buildModalView = (triggerId: string, channelIds: string[]) => ({
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

const findMentionTrigger = async (client: SlackAPIClient): Promise<
  | EventTriggerResponseObject<typeof ReplyWorkflow.definition>
  | undefined
> => {
  // Collect all existing triggers created by the app
  const allTriggers = await client.workflows.triggers.list({ is_owner: true });
  if (!allTriggers.ok) {
    throw new Error("Failed to fetch triggers list");
  }

  // Find app_mention event triggers to update
  const existingTrigger = allTriggers.triggers.filter((trigger) =>
    trigger.workflow.callback_id ===
      ReplyWorkflow.definition.callback_id &&
    trigger.event_type === TriggerEventTypes.AppMentioned
  )[0] as
    | EventTriggerResponseObject<typeof ReplyWorkflow.definition>
    | undefined;

  return existingTrigger;
};

const findOrCreateMentionTrigger = async (
  client: SlackAPIClient,
): Promise<
  {
    error?: string;
    trigger?: EventTriggerResponseObject<typeof ReplyWorkflow.definition>;
  }
> => {
  // Find an existing trigger
  try {
    const existingTrigger = await findMentionTrigger(client);
    if (existingTrigger) {
      return { trigger: existingTrigger };
    }
  } catch (error) {
    return { error: error.message };
  }

  // If not exist, create a new trigger
  const createTriggerResponse = await client.workflows.triggers.create<
    typeof ReplyWorkflow.definition
  >(mentionTriggerConfigBase);
  if (!createTriggerResponse.ok) {
    return { error: createTriggerResponse.error };
  }

  return { trigger: createTriggerResponse.trigger };
};

const mentionTriggerConfigBase: ValidTriggerTypes<
  typeof ReplyWorkflow.definition
> = {
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
    channel_ids: [env.INITIAL_SLACK_CHANNEL_ID],
  },
};
