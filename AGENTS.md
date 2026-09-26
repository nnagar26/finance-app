<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Collaboration and commits

- Keep the user informed in this task with concise progress updates when work takes more than one step. State what you are checking, what changed, and any blockers; finish with a summary of the result.
- Use a clear Conventional Commit style for commit subjects: `<type>: <imperative summary>` (for example, `fix: handle missing exchange rates`, `feat: add recurring transactions`, or `ui: improve transaction form layout`).
- Choose the type that best describes the main change. Common types are `feat` for functionality, `fix` for bug fixes, `ui` for visual or interaction improvements, `docs` for documentation, `refactor` for behavior-preserving restructuring, `test` for tests, and `chore` for maintenance.
- Keep each commit focused, use an imperative summary, and do not create a commit unless the user asks for one.
- When a release is confirmed stable, mark it with an annotated Git tag using semantic versioning: `vMAJOR.MINOR.PATCH` (for example, `v1.2.0`). Do not tag work as stable before it has been reviewed and verified; summarize the release and tag in the task update.
