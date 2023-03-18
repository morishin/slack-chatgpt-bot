import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { env } from "../../.env.ts";
import { MessageHistoryDatastore } from "../../datastores/message_history_datastore.ts";
import { Message, MessageType } from "../types/message_type.ts";

export const PutMessageHistoryFunctionDefinition = DefineFunction({
  callback_id: "put_message_history",
  title: "Put a message history record into datastore",
  source_file: "functions/put_message_history/put_message_history_function.ts",
  input_parameters: {
    properties: {
      channelId: {
        type: Schema.types.string,
      },
      message: {
        type: Schema.types.string,
      },
      isUserMessage: {
        type: Schema.types.boolean,
      },
    },
    required: ["channelId", "message", "isUserMessage"],
  },
  output_parameters: {
    properties: {
      latestMessages: {
        type: Schema.types.array,
        items: {
          type: MessageType,
        },
      },
    },
    required: ["latestMessages"],
  },
});

export default SlackFunction(
  PutMessageHistoryFunctionDefinition,
  async ({ inputs, client }) => {
    const getResponse = await client.apps.datastore.get<
      typeof MessageHistoryDatastore.definition
    >({
      datastore: "MessageHistory",
      id: inputs.channelId,
    });
    if (!getResponse.ok) {
      const error = `Failed to get a row from datastore: ${getResponse.error}`;
      return { error };
    }

    // Trim @mention from an input message
    const content = inputs.message.replace(/<@.+>\s?/, "");

    // Append the new message to the latest messages
    let latestMessages = (getResponse.item.latestMessages as Message[] ?? [])
      .concat([{
        role: inputs.isUserMessage ? "user" : "assistant",
        content,
      }]);

    // Limit the number of messages to store
    latestMessages = latestMessages.slice(
      latestMessages.length - env.MESSAGE_HISTORY_SIZE,
    );

    // Save the latest messages to datastore
    const putResponse = await client.apps.datastore.put<
      typeof MessageHistoryDatastore.definition
    >({
      datastore: "MessageHistory",
      item: {
        channelId: inputs.channelId,
        latestMessages,
      },
    });

    if (!putResponse.ok) {
      const error = `Failed to save a row in datastore: ${putResponse.error}`;
      return { error };
    } else {
      console.log(
        `MessageHistory saved: ${JSON.stringify(putResponse.item, null, 2)}`,
      );
      return { outputs: { latestMessages: putResponse.item.latestMessages } };
    }
  },
);
