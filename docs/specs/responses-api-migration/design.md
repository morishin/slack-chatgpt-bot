# Design

## Overview
Use OpenAI Responses API with `previous_response_id` chaining and store only conversation linkage metadata in Slack datastore.

The current Slack-native streaming output path remains unchanged.

## High-Level Flow

1. Resolve request context:
   - channel id
   - user/team ids
   - trimmed user message
   - channel system message
2. Load conversation session metadata by session key.
3. Determine whether to continue chain:
   - if metadata exists and not expired: send `previous_response_id`
   - otherwise: start a new chain
4. Call OpenAI Responses API:
   - streaming mode for Slack streaming path
   - non-streaming mode for Slack fallback path
5. Stream chunks to Slack using existing `start/append/stop` flow.
6. Persist updated session metadata:
   - latest response id
   - last interaction timestamp

## Data Model

### New Datastore: ConversationSession (proposed)

- `sessionKey` (primary key)
- `previousResponseId` (string)
- `lastInteractionAt` (number, unix epoch milliseconds)

## Session Key Strategy

Use channel-based keys:

- all mentions: `channel:<channelId>`

This keeps continuity simple and consistent with channel-level replies.

## OpenAI Request Strategy

### Continue Chain

- Include:
  - `input`: current user message only
  - `previous_response_id`: saved id
  - `instructions`: current system message (to keep current channel config behavior)

### Start New Chain

- Include:
  - `input`: current user message only
  - `instructions`: current system message
- Exclude `previous_response_id`

## Timeout Strategy

- Add `RESPONSE_CHAIN_TIMEOUT_MINUTES` as an environment variable.
- Default: `30`.
- Compute timeout against `lastInteractionAt` in session metadata.
- If timed out, ignore stored `previousResponseId` and start a new chain.

## Existing Datastore Migration

Current `MessageHistory` datastore has been simplified to system-message-only storage.

Final state:
- keep `systemMessage` only
- remove `latestMessages` attribute and related code

Compatibility strategy:
- keep datastore name as `MessageHistory` to preserve existing production data
- use `SystemMessageDatastore` as the code-level name
- remove legacy `latestMessages` attribute via one-time schema update (`slack run --force` / deploy with force)

## Error Handling

- OpenAI request failure: return function error with diagnostic log.
- Slack streaming API failure: throw with Slack error payload.
- Session metadata write failure: fail request (to avoid inconsistent chain state).

## Compatibility Notes

- Mention trigger inputs remain `channelId`, `message`, `userId`, and `teamId`.
- Reply workflow callback stays unchanged.
- Output behavior remains streaming in Slack and fallback posting when required context is absent.
