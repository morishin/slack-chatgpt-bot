# Design

## Overview

Replace Chat Completions + Slack-stored message history with direct OpenAI
Responses API calls (`fetch`) using conversation chaining.

## High-Level Flow

1. Receive event inputs (`channelId`, `message`, optional `eventType`).
2. Trim mention and ignore empty content.
3. Read conversation session record from datastore (`MessageHistory` on Slack).
4. Resolve `systemMessage` from datastore (fallback to
   `env.INITIAL_SYSTEM_MESSAGE`).
5. Gate processing by event type and channel config:
   - always process `app_mentioned`
   - process `message_posted` only when `replyInThread=true`
6. Resolve whether to include `previous_response_id` based on timeout.
7. Call OpenAI `POST /v1/responses` with:
   - `model`: `env.GPT_MODEL`
   - `input`: current user message
   - `instructions`: system message
   - optional `previous_response_id`
   - `stream: true` when streaming/pseudo-streaming path is used
8. Post reply to Slack:
   - thread mode: Slack stream APIs
   - channel mode: pseudo-stream (`chat.postMessage` + `chat.update`)
9. Save latest `responseId` and timestamp to datastore (`MessageHistory` on
   Slack).

## Data Model

### Datastore: ConversationSession (single datastore in code)

- `channelId` (primary key)
- `systemMessage`
- `previousResponseId`
- `lastInteractionAt` (unix epoch milliseconds)
- `replyInThread`

Slack datastore name must stay `MessageHistory` for backward compatibility.

## Workflow Changes

### Reply workflow

- Pass trigger inputs directly to `stream_reply_function`.
- Include optional `eventType` to distinguish `app_mentioned` and
  `message_posted` invocations.

### Trigger configuration

`configure_channels_modal_function` recreates event triggers per selected
channel:

- `app_mentioned` trigger for explicit mentions
- `message_posted` trigger for follow-up thread replies without mention
  - filter requires thread replies (non-null `thread_ts`)

### Stream reply function

- Keep callback id (`stream_reply_function`) for compatibility.
- Use direct OpenAI Responses API calls (no AI SDK dependency).
- Enforce event-type gate:
  - ignore `message_posted` when channel is not in thread-reply mode
- Thread mode uses Slack stream APIs.
- Channel mode uses pseudo-streaming.

## Error Handling

- Datastore read/write failure: return function error.
- OpenAI request failure: post fallback error text to Slack and return fallback
  output.
- Missing response id: log warning and continue without session update.

## Compatibility Notes

- Keep Slack datastore name as `MessageHistory` to preserve existing production
  `systemMessage` values.
- Maintain existing mention interaction while adding thread follow-up handling
  through `message_posted`.
