# Tasks

- [x] Add repository-level development rules in `slack-chatgpt-bot/AGENTS.md`
- [x] Create spec docs under `docs/specs/slack-native-streaming/`
- [x] Add workflow/trigger inputs (`userId`, `teamId`)
- [x] Replace stream reply implementation with:
  - OpenAI `fetch` streaming
  - Slack native `chat.startStream/appendStream/stopStream`
- [x] Keep non-streaming fallback for missing streaming context
- [x] Validate behavior manually in Slack workspace
- [x] Commit on feature branch after developer confirmation
