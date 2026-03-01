# Design

## Overview
Keep Slack-native streaming APIs as-is and replace only the OpenAI response handling layer with AI SDK.

This refactor targets `functions/stream_reply/stream_reply_function.ts`.

## Data Flow

1. Build `messages` exactly as current behavior (system + latest history).
2. If streaming context is missing:
   - call AI SDK non-streaming generation
   - post result via `chat.postMessage`
3. If streaming context is available:
   - call `streamText` with OpenAI provider
   - consume streamed text chunks from AI SDK
   - buffer chunks and flush to Slack:
     - first flush: `chat.startStream`
     - subsequent flushes: `chat.appendStream`
   - finish with `chat.stopStream`
4. Return full concatenated reply text.

## Implementation Notes

- Introduce AI SDK imports:
  - `streamText` (and non-streaming helper if used) from `ai`
  - `createOpenAI` from `@ai-sdk/openai`
- Keep a small local Slack-stream helper (`flushPending`) because AI SDK does not abstract Slack Web API streaming methods.
- Continue using existing `pending` buffer threshold to avoid excessive Slack API calls.

## Error Handling

- AI SDK call failures should surface as thrown errors.
- Slack API failures (`start/append/stop`) should continue to throw with Slack error details.

## Compatibility

- No changes to workflow definitions or trigger input mapping.
- No changes to function callback ID or output contract.
