import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";

export const GenerateReplyFunctionDefinition = DefineFunction({
  callback_id: "generate_reply_function",
  title: "Generate a reply",
  source_file: "functions/generate_reply_function.ts",
  input_parameters: {
    properties: {
      // Message[]
      latestMessages: {
        type: Schema.types.array,
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
  async ({ inputs, env }) => {
    const messages = [
      { role: "system", content: env.INITIAL_SYSTEM_MESSAGE },
      ...(inputs.latestMessages.map((message) => ({
        role: "user",
        content: message,
      }))),
    ];
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
    console.info(
      `ChatGPT API Response: ${JSON.stringify(completion, null, 2)}`,
    );
    const reply = completion.choices[0].message?.content ??
      "Error: No response";
    return { outputs: { reply } };
  },
);
