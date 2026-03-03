# Requirements

## Summary
Migrate reply generation from Chat Completions-style context passing to OpenAI Responses API conversation state, so the app no longer stores full chat history in Slack datastore for prompt construction.

## Functional Requirements

### FR-1: Responses API State Chaining
The bot must call OpenAI Responses API and continue conversation using `previous_response_id` when a valid prior response exists for the current session.

### FR-2: Session Metadata Persistence
The app must persist minimal session metadata required for chaining:
- session key
- previous response id
- last interaction timestamp

### FR-3: Session Timeout Reset
If elapsed time from the last interaction exceeds a configurable threshold (`RESPONSE_CHAIN_TIMEOUT_MINUTES`), the bot must start a new chain without `previous_response_id`.

`RESPONSE_CHAIN_TIMEOUT_MINUTES` must be supplied as a Slack app environment variable, and local development should support it via `.env`.

### FR-4: Preserve Slack Streaming UX
The bot must continue using Slack native streaming (`chat.startStream`, `chat.appendStream`, `chat.stopStream`) for streaming-capable requests.

### FR-5: Preserve Missing-Context Fallback
If Slack streaming context (`userId`, `teamId`) is unavailable, the bot must still produce a reply and post via `chat.postMessage`.

### FR-6: Preserve System Message Configuration
Per-channel system message configuration must continue to work and be applied to replies after migration.

### FR-7: Remove Prompt History Dependency
`latestMessages` history from Slack datastore must no longer be required for OpenAI request construction.

### FR-8: Session Scope Policy
Session scope must be:
- thread replies: keyed by thread (`thread:<channelId>:<threadTs>`)
- non-thread mentions: keyed by channel (`channel:<channelId>`)

## Non-Functional Requirements

### NFR-1: Cost Awareness
The implementation must include guardrails for chain growth (timeout reset at minimum), since chained responses still bill prior tokens.

### NFR-2: Backward Compatibility
Existing trigger/workflow behavior for mentions and thread replies must remain unchanged from user perspective.

### NFR-3: Type Safety
`deno check manifest.ts` must pass.

## Finalized Decisions

1. Session scope key:
   - thread replies: `thread:<channelId>:<threadTs>`
   - non-thread mentions: `channel:<channelId>`
2. Timeout:
   - default `RESPONSE_CHAIN_TIMEOUT_MINUTES = 30`
   - configured via Slack app environment variable
3. Migration strategy for message history:
   - remove `latestMessages` storage and related code
   - keep datastore name `MessageHistory` for production data compatibility
