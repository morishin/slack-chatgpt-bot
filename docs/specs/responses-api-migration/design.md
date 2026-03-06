# Design

## Overview

Replace Chat Completions + Slack-stored message history with AI SDK
`generateText` using OpenAI Responses API conversation chaining.

## High-Level Flow

1. Receive mention event inputs (`channelId`, `message`).
2. Trim mention and ignore empty content.
3. Read per-channel `systemMessage` from `MessageHistory` datastore.
4. Read conversation session metadata from `ConversationSession` datastore.
5. Resolve whether to include `previous_response_id` based on timeout.
6. Call `generateText` with:
   - model: `openAI(env.GPT_MODEL)`
   - prompt: current user message
   - provider options:
     - `instructions`: system message
     - optional `previousResponseId`
7. Post reply to Slack using `chat.postMessage`.
8. Save latest `responseId` and timestamp to `ConversationSession` datastore.

## Data Model

### Datastore: MessageHistory (existing)

- Keep datastore name as `MessageHistory` for production compatibility.
- Keep only:
  - `channelId` (primary key)
  - `systemMessage`

### Datastore: ConversationSession (new)

- `sessionKey` (primary key)
- `previousResponseId`
- `lastInteractionAt` (unix epoch milliseconds)

## Workflow Changes

### Reply workflow

- Remove `put_message_history` steps.
- Pass original mention inputs directly to `stream_reply_function`.

### Stream reply function

- Replace direct `fetch` streaming logic with AI SDK `generateText`.
- Keep function callback id (`stream_reply_function`) for compatibility.
- Use non-streaming Slack posting.

## Error Handling

- Datastore read/write failure: return function error.
- OpenAI request failure: post fallback error text to Slack and return fallback
  output.
- Missing response id: log warning and continue without session update.

## Compatibility Notes

- Keep existing datastore name `MessageHistory` even after removing
  `latestMessages`.
- Mention trigger payload can still include extra fields; reply path depends on
  `channelId` and `message`.
