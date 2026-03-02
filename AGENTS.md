# Development Rules

## Language and Communication
- Always reply in the same language used by the developer in the current conversation.
- If the developer writes in Japanese, reply in Japanese. If the developer writes in English, reply in English.
- Write all repository documents in English, including `AGENTS.md` and all files under `docs/`.

## Spec-Driven Workflow (Kiro-style)
- Follow a requirements-first workflow based on Kiro.
- When a new feature is requested, create:
  - `docs/specs/<feature_name>/requirements.md`
  - `docs/specs/<feature_name>/design.md`
  - `docs/specs/<feature_name>/tasks.md`
- Collaborate with the developer while refining requirements, design, and tasks.
- Reference workflow details:
  - https://kiro.dev/docs/specs/feature-specs/requirements-first/

## Documentation Policy
- Store persistent development documents under `docs/`.
- Keep specs and implementation notes so work can resume smoothly after context resets.
- When new persistent documentation seems useful, ask the developer whether to keep it in the repository.

## Repository Scope
- Perform implementation and commits in this repository (`slack-chatgpt-bot`).
- Do not create commits in parent/meta repositories for feature implementation work.

## Git Workflow
- Use Git for all development work.
- Work on a feature branch. Do not commit directly to `main`.
- After an implementation reaches a good state and the developer confirms OK, create a commit before starting the next implementation request.
- Commit at an appropriate granularity to make reviews easier for developers. Specifically, commit once the spec content is finalized, and then commit each time a single task is completed.
- If the developer reports issues, fix first and do not commit until the state is good.
- Write commit messages in English.

## Repository Access
- Use GitHub MCP server when repository access through MCP is needed.
