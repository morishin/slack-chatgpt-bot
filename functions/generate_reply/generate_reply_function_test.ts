import { SlackFunctionTester } from "deno-slack-sdk/mod.ts";
import { assert } from "https://deno.land/std@0.153.0/testing/asserts.ts";
import { stub } from "https://deno.land/std@0.152.0/testing/mock.ts";
import GenerateReplyFunction from "./generate_reply_function.ts";

const { createContext } = SlackFunctionTester("generate_reply_function");

Deno.test("GenerateReplyFunction test", async () => {
  stub(
    globalThis,
    "fetch",
    () =>
      Promise.resolve(
        new Response(JSON.stringify({
          "id": "chatcmpl-6p9XYPYSTTRi0xEviKjjilqrWU2Ve",
          "object": "chat.completion",
          "created": 1677649420,
          "model": "gpt-3.5-turbo",
          "usage": {
            "prompt_tokens": 56,
            "completion_tokens": 31,
            "total_tokens": 87,
          },
          "choices": [
            {
              "message": {
                "role": "assistant",
                "content": "Hello, world!",
              },
              "finish_reason": "stop",
              "index": 0,
            },
          ],
        })),
      ),
  );
  const inputs = {
    latestMessages: [
      { role: "user", content: "Say Hello." },
    ],
  };
  const { outputs } = await GenerateReplyFunction(
    createContext({ inputs }),
  );
  assert(outputs?.reply === "Hello, world!");
});
