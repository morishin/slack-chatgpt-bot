import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";
import { MessageType } from "../types/message_type.ts";
import { env } from "../../.env.ts";

export const GenerateReplyFunctionDefinition = DefineFunction({
  callback_id: "generate_reply_function",
  title: "Generate a reply",
  source_file: "functions/generate_reply/generate_reply_function.ts",
  input_parameters: {
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
  output_parameters: {
    properties: {
      reply: {
        type: Schema.types.string,
      },
    },
    required: ["reply"],
  },
});

export default SlackFunction(
  GenerateReplyFunctionDefinition,
  async ({ inputs, env: slackEnv }) => {
    const messages: { role: string; content: string }[] = [
      { role: "system", content: env.INITIAL_SYSTEM_MESSAGE },
      ...inputs.latestMessages,
    ];
    console.log(`🔥 ${JSON.stringify(messages, null, 2)}`);
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${slackEnv.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo-0301",
        messages,
      }),
    });
    const completion = await response.json();
    console.info(
      `ChatGPT API Response: ${JSON.stringify(completion, null, 2)}`,
    );
    const reply = completion.choices[0].message?.content ??
      "Error: No response";
    return { outputs: { reply } };
  },
);
