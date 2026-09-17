@AGENTS.md

## Claude Code specific notes

- Use your section in `.agents/modules.md` (`# Module: <your-module>`, e.g.
  `#module-dashboard-ui`) for your branch/worktree — don't load every
  module section, just yours plus the shared `.agents/*.md` files.
- Follow the repo's own skills where they apply (test-driven-development for anything in
  `finance/`, systematic-debugging over guessing on a failing calculation, brainstorming
  before adding scope not already in `.agents/project.md`).
- If a locked decision in `.agents/` needs to change, say why and ask the infra/deploy lead —
  don't silently redesign. This mirrors the hackathon handoff's own top-line rule.
