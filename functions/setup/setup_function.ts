import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { MessageHistoryDatastore } from "../../datastores/message_history_datastore.ts";

export const SetupFunctionDefinition = DefineFunction({
  callback_id: "setup_function",
  title: "Setup ChatGPT bot",
  source_file: "functions/setup/setup_function.ts",
  input_parameters: {
    properties: {
      channelId: {
        type: Schema.types.string,
      },
      systemMessage: {
        type: Schema.types.string,
      },
    },
    required: ["channelId", "systemMessage"],
  },
});

export default SlackFunction(
  SetupFunctionDefinition,
  async ({ inputs, client }) => {
    const updateResponse = await client.apps.datastore.update<
      typeof MessageHistoryDatastore.definition
    >({
      datastore: "MessageHistory",
      item: {
        channelId: inputs.channelId,
        systemMessage: inputs.systemMessage,
      },
    });

    if (!updateResponse.ok) {
      const error =
        `Failed to save a row in datastore: ${updateResponse.error}`;
      return { error };
    } else {
      console.log(
        `MessageHistory saved: ${JSON.stringify(updateResponse.item, null, 2)}`,
      );
      return {
        outputs: {},
      };
    }
  },
);
