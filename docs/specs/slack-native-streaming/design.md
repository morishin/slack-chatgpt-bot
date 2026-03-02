# Design

## Overview
The stream reply function keeps direct OpenAI streaming (`fetch` with `stream: true`) and forwards token chunks to Slack native streaming APIs.

No Chat SDK runtime is introduced.

## Data Flow

1. `ReplyWorkflow` receives mention trigger inputs (`channelId`, `message`, `userId`, `teamId`, `messageTs`, `threadTs`).
2. `PutMessageHistoryFunction` stores user message and returns prompt context.
3. `StreamReplyFunction`:
   - builds OpenAI messages
   - opens OpenAI streaming response
   - parses SSE lines
   - starts Slack stream with first buffered chunk
   - appends buffered chunks
   - stops stream at completion
4. Final text is returned and persisted by the second `PutMessageHistoryFunction`.

## Slack Streaming Strategy

- Slack streaming methods are invoked via `client.apiCall(...)`:
  - `client.apiCall("chat.startStream", ...)`
  - `client.apiCall("chat.appendStream", ...)`
  - `client.apiCall("chat.stopStream", ...)`
- `chat.startStream` is called once with:
  - `channel`
  - `recipient_user_id`
  - `recipient_team_id`
  - optional `thread_ts`
  - first `markdown_text` chunk
- `chat.appendStream` is called for later chunks.
- `chat.stopStream` is called once after OpenAI stream completes.

Chunk flushing uses a small text buffer to avoid excessive API calls.

## Fallback Strategy

If required streaming context (`userId` and `teamId`) is missing:

- call OpenAI with `stream: false`
- post a normal Slack message with `chat.postMessage`

## Trigger and Workflow Input Changes

`configure_channels_modal_function.ts` mention trigger mapping includes:

- `{{data.user_id}}`
- `{{team_id}}`
- `{{data.message_ts}}`
- `{{data.thread_ts}}`

`reply_workflow.ts` forwards these fields to `stream_reply_function.ts`.

## Error Handling

- OpenAI non-OK responses throw with status details.
- Slack stream method failures throw using returned Slack error payload.
- malformed SSE JSON chunks are skipped with warning logs.

## Validation Status

- `deno check manifest.ts` passes.
- Manual verification on Slack workspace passed (streaming reply behavior confirmed).
