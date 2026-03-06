import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { streamReplyInternals } from "./stream_reply_function.ts";

Deno.test("getSessionKey uses channel scope", () => {
  assertEquals(
    streamReplyInternals.getSessionKey("C123"),
    "channel:C123",
  );
});

Deno.test("getPreviousResponseId returns undefined after timeout", () => {
  const now = 10_000;
  const timeout = 1_000;

  const previousResponseId = streamReplyInternals.getPreviousResponseId(
    {
      previousResponseId: "resp_abc",
      lastInteractionAt: 8_500,
    },
    now,
    timeout,
  );

  assertEquals(previousResponseId, undefined);
});

Deno.test("getPreviousResponseId returns value within timeout", () => {
  const now = 10_000;
  const timeout = 2_000;

  const previousResponseId = streamReplyInternals.getPreviousResponseId(
    {
      previousResponseId: "resp_abc",
      lastInteractionAt: 8_500,
    },
    now,
    timeout,
  );

  assert(previousResponseId === "resp_abc");
});

Deno.test("getChainTimeoutMs converts minutes to milliseconds", () => {
  const timeoutMs = streamReplyInternals.getChainTimeoutMs(30);
  assertEquals(timeoutMs, 30 * 60 * 1000);
});
