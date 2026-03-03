# Requirements

## Summary
Refactor reply generation to use Vercel AI SDK for OpenAI response handling so that manual SSE parsing and low-level stream-reader logic are removed from the Slack function implementation.

## Functional Requirements

### FR-1: Use AI SDK for OpenAI Streaming
The streaming path must use AI SDK primitives (`streamText` with OpenAI provider) instead of manual `fetch` + SSE parsing.

### FR-2: Preserve Slack Native Streaming Flow
Slack output must continue to use `chat.startStream`, `chat.appendStream`, and `chat.stopStream`.

### FR-3: Preserve Prompt Construction Behavior
OpenAI request messages must keep existing behavior:
- system message from channel config (or default)
- latest message history from datastore

### FR-4: Preserve Fallback Behavior
If streaming context (`userId`, `teamId`) is unavailable, the function must still generate a non-streaming reply and post with `chat.postMessage`.

### FR-5: Preserve Channel Reply Behavior
Replies must continue to be posted as channel replies.

### FR-6: Maintain Existing Workflow Contract
Function input/output schema and `ReplyWorkflow` integration must remain compatible with current behavior.

## Non-Functional Requirements

### NFR-1: Simplicity
The stream-handling implementation should become shorter and easier to read by removing manual SSE parser code.

### NFR-2: Type Safety
`deno check manifest.ts` must pass.

### NFR-3: No User-Visible Regression
Observed behavior in Slack (streaming updates and fallback reply posting) must remain consistent.
