# Tasks

- [x] Finalize open decisions in requirements/design with developer
- [ ] Add `RESPONSE_CHAIN_TIMEOUT_MINUTES` to environment configuration
- [ ] Add datastore for conversation session metadata
- [ ] Refactor workflow/function contract to remove `latestMessages` dependency
- [ ] Implement Responses API request path with `previous_response_id` chaining
- [ ] Keep Slack native streaming integration (`chat.startStream/appendStream/stopStream`)
- [ ] Keep missing-context fallback with non-streaming reply posting
- [ ] Update or replace tests for new conversation-state behavior
- [ ] Run `deno check manifest.ts`
- [ ] Run test suite
