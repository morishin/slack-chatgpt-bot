import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { streamReplyInternals } from "./stream_reply_function.ts";

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

Deno.test("toThreadTs normalizes messageTs to 6-digit micros", () => {
  const threadTs = streamReplyInternals.toThreadTs(1_772_877_886.3396);
  assertEquals(threadTs, "1772877886.339600");
});

Deno.test("toThreadTs accepts message ts string", () => {
  const threadTs = streamReplyInternals.toThreadTs("1772877958.777800");
  assertEquals(threadTs, "1772877958.777800");
});

Deno.test("shouldFlushChannelPseudoStream returns true on pending size", () => {
  assert(streamReplyInternals.shouldFlushChannelPseudoStream(160, 0));
});

Deno.test("shouldFlushChannelPseudoStream returns true on elapsed time", () => {
  assert(streamReplyInternals.shouldFlushChannelPseudoStream(1, 800));
});
