import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";

export const GenerateReplyFunctionDefinition = DefineFunction({
  callback_id: "generate_reply_function",
  title: "Generate a reply",
  source_file: "functions/generate_reply_function.ts",
  input_parameters: {
    properties: {
      message: {
        type: Schema.types.string,
      },
    },
    required: ["message"],
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

type GPTRole = "assistant" | "user";
interface RequestBody {
  message: string;
  messageHistory?: { role: GPTRole; content: string }[];
}

export default SlackFunction(
  GenerateReplyFunctionDefinition,
  async ({ inputs, env }) => {
    const input: RequestBody = { message: inputs.message };

    const messages = [];
    if (env.INITIAL_SYSTEM_MESSAGE) {
      messages.push({ role: "system", content: env.INITIAL_SYSTEM_MESSAGE });
    }
    messages.push({ role: "user", content: input.message });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo-0301",
        messages,
      }),
    });
    const completion = await response.json();
    console.info(`🌝 ${JSON.stringify(completion, null, 2)}`);
    const reply = completion.choices[0].message?.content ??
      "Error: No response";
    return { outputs: { reply } };
  },
);
