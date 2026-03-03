# Requirements

## Summary
Replace the current reply streaming implementation with a simple Slack-native streaming flow:

- OpenAI API is called directly via `fetch`
- Slack streaming is handled by:
  - `chat.startStream`
  - `chat.appendStream`
  - `chat.stopStream`
- Do not use Chat SDK or AI SDK for this feature

## Functional Requirements

### FR-1: Streaming Reply via Native Slack APIs
The bot must stream reply text to Slack using `chat.startStream`, `chat.appendStream`, and `chat.stopStream`.

### FR-2: Keep Existing Conversation Prompt Behavior
The request sent to OpenAI must keep the existing behavior:
- system message from channel config (or default)
- latest message history from datastore

### FR-3: Fallback Path
When streaming context is insufficient, the function must fall back to a non-streaming completion and post a normal message.

### FR-4: Channel Reply Policy
Replies should always be posted as channel replies (no thread routing).

### FR-5: Trigger Input Coverage
Mention event trigger input mapping must include:
- `userId`
- `teamId`

### FR-6: No New Platform Abstraction Layer
Implementation must avoid Chat SDK based runtime/adapters for this feature.

## Non-Functional Requirements

### NFR-1: Maintainability
Code should stay simple and easy to debug in a Slack-only environment.

### NFR-2: Type Safety
`deno check manifest.ts` must pass.

### NFR-3: Minimal Surface Change
Keep behavior and integration points consistent with existing workflows and datastore flow.
