import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";

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
  async ({ inputs, env: slackEnv }) => {
  },
);
