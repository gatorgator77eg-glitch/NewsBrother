# AGENTS.md

## Absolute Rules

- **NEVER start, restart, or kill servers/processes.** No `npm run dev`, `taskkill`, `Start-Process`, or anything that runs a long-lived process. The user handles all server lifecycle.
- **NEVER run commands that block or get stuck** — e.g. servers, watchers, long-running processes, interactive prompts.
- **Only run commands that complete and return**: `npx tsc --noEmit`, `npm install`, file reads, git commands, etc.
- If unsure whether a command will block, don't run it. Ask instead.
