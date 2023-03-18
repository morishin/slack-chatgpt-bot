import { SlackFunctionTester } from "deno-slack-sdk/mod.ts";
import { assert } from "https://deno.land/std@0.153.0/testing/asserts.ts";
import { equal } from "https://deno.land/x/equal/mod.ts";
import * as mf from "https://deno.land/x/mock_fetch@0.3.0/mod.ts";
import PutMessageHistoryFunction from "./put_message_history_function.ts";

const { createContext } = SlackFunctionTester("put_message_history_function");

// Replaces globalThis.fetch with the mocked copy
mf.install();

const datastoreResponse = {
  ok: true,
  item: {
    channelId: "DUMMY",
    latestMessages: [
      { role: "user", content: "Say Hello." },
      { role: "assistant", content: "Hello, world!" },
      { role: "user", content: "Yeah." },
    ],
  },
};
mf.mock("POST@/api/apps.datastore.put", () =>
  new Response(
    JSON.stringify(datastoreResponse),
    {
      status: 200,
    },
  ));
mf.mock("POST@/api/apps.datastore.get", () =>
  new Response(
    JSON.stringify(datastoreResponse),
    {
      status: 200,
    },
  ));

Deno.test("PutMessageHistoryFunction test", async () => {
  const inputs = {
    channelId: "DUMMY",
    message: "Yeah.",
    isUserMessage: true,
  };
  const { outputs } = await PutMessageHistoryFunction(
    createContext({ inputs }),
  );
  assert(
    equal(outputs?.latestMessages, datastoreResponse.item.latestMessages),
  );
});
