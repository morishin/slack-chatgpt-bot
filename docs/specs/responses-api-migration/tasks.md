# Tasks

- [x] Create spec docs for requirements/design/tasks
- [x] Add `RESPONSE_CHAIN_TIMEOUT_MINUTES` to `env.ts.example`
- [x] Merge datastores into `ConversationSession` and include `systemMessage`
- [x] Refactor `reply_workflow` to remove `put_message_history` steps
- [x] Refactor `stream_reply_function` to use AI SDK + Responses API chaining
- [x] Remove obsolete message history function from manifest/workflow path
- [x] Update/add tests for session key and timeout logic
- [x] Update README for Responses API-based behavior
- [x] Run `deno check manifest.ts`
- [x] Run related test suites
- [ ] Add `message_posted` event trigger creation in channel configurator
- [ ] Recreate configured channel triggers as mention + thread-followup pair
- [ ] Add optional event type input to reply workflow/function path
- [ ] Gate reply processing by `eventType` and `replyInThread`
- [ ] Add manifest scopes required for `message_posted` trigger
- [ ] Run `deno check manifest.ts` and related tests
