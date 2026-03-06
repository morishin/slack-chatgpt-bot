# Requirements

## Summary

Migrate reply generation to OpenAI Responses API and replace Slack
datastore-based message history with OpenAI-side conversation chaining using
`previous_response_id`.

## Functional Requirements

### FR-1: Responses API State Chaining

The bot must generate replies with OpenAI Responses API and continue context
using `previous_response_id` when a valid previous response exists.

### FR-2: Session Metadata Persistence

The app must persist session metadata required for chaining:

- channel id
- system message
- previous response id
- last interaction timestamp

### FR-3: Chain Timeout Reset

If elapsed time from the last interaction exceeds a configurable threshold
(`RESPONSE_CHAIN_TIMEOUT_MINUTES`), the bot must start a new chain without
`previous_response_id`.

### FR-4: Non-Streaming Slack Reply

The bot must post replies via `chat.postMessage` (non-streaming).

### FR-5: System Message Preservation

Per-channel system message configuration must continue to work after migration.
The configured value must be stored in the same datastore as conversation
session metadata.

### FR-6: Remove Prompt History Dependency

The app must not require `latestMessages` in Slack datastore for prompt
construction.

### FR-7: Session Scope

Session scope must be channel-based and keyed by `channelId`.

## Non-Functional Requirements

### NFR-1: Backward Compatibility

Existing mention trigger/workflow behavior should remain compatible from user
perspective. Slack datastore name must remain `MessageHistory` so existing
production `systemMessage` data is preserved.

### NFR-2: Type Safety

`deno check manifest.ts` must pass.

### NFR-3: Test Coverage

Relevant tests must pass after migration.
