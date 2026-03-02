# Tasks

- [x] Finalize open decisions in requirements/design with developer
- [x] Add `RESPONSE_CHAIN_TIMEOUT_MINUTES` to environment configuration
- [x] Add datastore for conversation session metadata
- [x] Refactor workflow/function contract to remove `latestMessages` dependency
- [x] Implement Responses API request path with `previous_response_id` chaining
- [x] Keep Slack native streaming integration (`chat.startStream/appendStream/stopStream`)
- [x] Keep missing-context fallback with non-streaming reply posting
- [x] Update or replace tests for new conversation-state behavior
- [x] Remove `latestMessages` storage and keep datastore name compatibility (`MessageHistory`)
- [x] Run `deno check manifest.ts`
- [x] Run test suite
