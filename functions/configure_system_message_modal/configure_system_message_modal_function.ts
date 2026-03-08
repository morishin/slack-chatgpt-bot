import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { env } from "../../env.ts";
import { ConversationSessionDatastore } from "../../datastores/conversation_session_datastore.ts";

export const ConfigureSystemMessageModalFunctionDefinition = DefineFunction({
  callback_id: "configure_system_message_modal_function",
  title: "Configure ChatGPT bot for a channel",
  source_file:
    "functions/configure_system_message_modal/configure_system_message_modal_function.ts",
  input_parameters: {
    properties: {
      channelId: {
        type: Schema.types.string,
      },
      interactivityPointer: { type: Schema.types.string },
    },
    required: ["interactivityPointer", "channelId"],
  },
  output_parameters: {
    properties: {
      systemMessage: {
        type: Schema.types.string,
      },
    },
    required: [],
  },
});

export default SlackFunction(
  ConfigureSystemMessageModalFunctionDefinition,
  async ({ inputs, client }) => {
    const getResponse = await client.apps.datastore.get<
      typeof ConversationSessionDatastore.definition
    >({
      datastore: "MessageHistory",
      id: inputs.channelId,
    });

    if (!getResponse.ok) {
      const error = `Failed to get a row in datastore: ${getResponse.error}`;
      return { error };
    }

    const systemMessage: string | undefined = getResponse.item.systemMessage;
    const replyInThread = (getResponse.item.replyInThread as
      | boolean
      | undefined) ?? false;

    const response = await client.views.open({
      interactivity_pointer: inputs.interactivityPointer,
      view: buildModalView(
        inputs.channelId,
        systemMessage ?? env.INITIAL_SYSTEM_MESSAGE,
        replyInThread,
      ),
    });
    if (!response.ok) {
      return { error: `Failed to open configurator modal: ${response.error}` };
    }

    // Set this to continue the interaction with this user
    return { completed: false };
  },
).addViewSubmissionHandler(
  ["configure_system_message_modal_view"],
  async ({ view, client }) => {
    const channelId = view.state.values.channel_block.channel
      .selected_channel as string;
    const systemMessage = view.state.values.system_message_block
      .system_message.value as string;
    const replyMode = view.state.values.reply_mode_block.reply_mode
      .selected_option?.value as string | undefined;
    const replyInThread = replyMode === "thread";

    const updateResponse = await client.apps.datastore.update<
      typeof ConversationSessionDatastore.definition
    >({
      datastore: "MessageHistory",
      item: {
        channelId,
        systemMessage,
        replyInThread,
      },
    });

    if (!updateResponse.ok) {
      const error =
        `Failed to save a row in datastore: ${updateResponse.error}`;
      return { error };
    } else {
      console.log(
        `ConversationSession saved: ${
          JSON.stringify(updateResponse.item, null, 2)
        }`,
      );
      return {
        response_action: "update",
        view: {
          type: "modal",
          callback_id: "configure_system_message_modal_view",
          notify_on_close: true,
          title: {
            type: "plain_text",
            text: "Configure system message",
          },
          blocks: [
            {
              type: "section",
              text: {
                type: "plain_text",
                text: "✅ Updated!",
              },
            },
          ],
        },
      };
    }
  },
).addViewClosedHandler(
  ["configure_system_message_modal_view"],
  () => ({ outputs: {}, completed: true }),
);

const buildModalView = (
  channelId: string,
  systemMessage: string,
  replyInThread: boolean,
) => ({
  type: "modal",
  callback_id: "configure_system_message_modal_view",
  title: {
    type: "plain_text",
    text: "System message",
  },
  submit: {
    type: "plain_text",
    text: "Save",
  },
  blocks: [
    {
      type: "input",
      block_id: "channel_block",
      element: {
        type: "channels_select",
        placeholder: {
          type: "plain_text",
          text: "Select a channel",
        },
        initial_channel: channelId,
        action_id: "channel",
      },
      label: {
        type: "plain_text",
        text: "A channel where GPT bot uses this configuration",
      },
    },
    {
      type: "input",
      block_id: "system_message_block",
      element: {
        type: "plain_text_input",
        placeholder: {
          type: "plain_text",
          text: "You are a helpful assistant.",
        },
        initial_value: systemMessage,
        multiline: true,
        action_id: "system_message",
      },
      label: {
        type: "plain_text",
        text: "A system message to be sent to ChatGPT API",
      },
    },
    {
      type: "input",
      block_id: "reply_mode_block",
      element: {
        type: "static_select",
        action_id: "reply_mode",
        placeholder: {
          type: "plain_text",
          text: "Select reply mode",
        },
        options: [
          {
            text: {
              type: "plain_text",
              text: "Thread reply",
            },
            value: "thread",
          },
          {
            text: {
              type: "plain_text",
              text: "Channel reply",
            },
            value: "channel",
          },
        ],
        initial_option: {
          text: {
            type: "plain_text",
            text: replyInThread ? "Thread reply" : "Channel reply",
          },
          value: replyInThread ? "thread" : "channel",
        },
      },
      label: {
        type: "plain_text",
        text: "Reply mode",
      },
    },
  ],
});
