# Harness-independent contributor workflows

Breeze should share one set of contributor instructions and skills while supporting Claude Code and Codex independently.

## 🎯 Goal

A contributor using either supported harness can take an issue through implementation, verification, and pull request creation without installing or invoking the other harness. A harness is the application that runs a coding agent and provides its tools.

Preserve Claude Code support. Keep project rules, security requirements, and verification steps consistent across harnesses.

## 📁 First step: contributor instructions

- Make `AGENTS.md` the canonical project instruction file.
- Keep `CLAUDE.md` as a minimal compatibility file containing `@AGENTS.md`.
- Make contributor-facing rules in `AGENTS.md` authoritative and turn `CLAUDE.md` into an import plus any Claude-only guidance.
- Fix the merge instruction drift. `AGENTS.md` currently tells contributors to use `--admin`, while the merge queue policy on `main` requires the queue except during a declared emergency.
- Keep maintainer-operation skills under `.claude/skills/` for this step. Move only contributor workflows such as `issue-to-pr`, `breeze-testing`, `worktree-stack`, `e2e-coverage`, and possibly `feature-testing` after the scope split is reviewed.
- Keep Claude-specific settings, commands, and custom agents where required. They should adapt shared workflows rather than duplicate their instructions.
- Keep personal preferences and credentials outside tracked project configuration.

Both root instruction files currently exist. Reconcile their content before replacing either file. Resolve conflicts explicitly, including contradictory merge instructions, against the repository's current policy. A rename or concatenation is insufficient.

## ⚖️ Approaches

1. Rename `CLAUDE.md` and move the entire `.claude/` directory. Rejected because `AGENTS.md` already exists and Claude-specific discovery and configuration still matter.
2. Keep `.claude/` canonical and point `.agents/` at it. This shares files but retains a harness-specific home for shared content and mixes portable workflows with settings.
3. Make contributor rules canonical first, then move only contributor skills after checking platform support. Selected because it resolves the immediate safety conflict and avoids disturbing maintainer operations prematurely.

Keep shared instruction files and contributor documentation free of operating-system-specific paths and commands where practical. Prefer repository-relative paths and cross-platform commands. Keep any required harness adapter small and test it on Linux, macOS, and Windows.

Do not make symlinks the required compatibility mechanism. Windows Git checkouts may materialize symlinks as text files when symlink support is disabled, and requiring elevated setup would make the workflow brittle. For any future shared-skill migration, test discovery on Linux, macOS, and Windows first. Use a small copy or sync step with a CI check that the copies match if a cross-platform symlink cannot be relied on. Preserve ignore rules for private state and verify `git status` stays clean when those files exist.

## 🔧 Workflow changes

- Keep this first change limited to contributor-facing root instructions and the merge-policy correction. Scope skill portability, model routing, handoff paths, attribution, and command adapters as follow-up work after the initial diff is reviewed.
- Update contributor setup docs to explain that each Git worktree has its own dependency links and must run `pnpm install --frozen-lockfile` before tests. Document the API test command and required Node.js and pnpm versions from Development Setup.

## 🛡️ Boundaries

- Do not change Breeze's application-level AI integrations or model configuration.
- Do not edit shipped database migrations or historical documents solely to replace harness names.
- Do not require a new dependency, orchestration framework, or personal plugin installation for the shared workflow.
- Do not promise identical tool behavior or universal harness support. Claude Code and Codex are the initial verification targets.

## ✅ Acceptance checks

- [ ] A fresh checkout contains one authoritative instruction source; the Claude compatibility file imports it without duplicating rules.
- [ ] `AGENTS.md` is the source of contributor rules and the Claude file imports it without copying the rules.
- [ ] The merge guidance follows the current queue policy, with `--admin` allowed only for a declared emergency.
- [ ] Contributor docs explain per-worktree dependency installation and provide the API Vitest command.
- [ ] The change leaves maintainer skills and their ignored private state paths untouched.
- [ ] Shared instructions and docs use OS-neutral paths and commands wherever practical.
- [ ] A later skills-migration change records Claude Code and Codex discovery on Linux, macOS, and Windows, including nested directories and worktrees.
- [ ] No developer must enable symlink support or use elevated permissions to load the shared workflow.
- [ ] A later workflow-portability change demonstrates issue-to-PR completion independently in both harnesses without personal plugins.

## 📚 Compatibility evidence

Claude Code supports automatic `AGENTS.md` loading from v2.1.277, with availability fixes in v2.1.281. Its default selection can favor existing Claude instruction files. Keeping the explicit import preserves a familiar entry point and avoids relying on that selection behavior. See the [official instruction-file documentation](https://code.claude.com/docs/en/memory#agentsmd).

The current [Claude skills documentation](https://code.claude.com/docs/en/skills#choose-where-skills-load) names `.claude/skills/` for project discovery. Do not assume that support for `AGENTS.md` also means native discovery of `.agents/skills/`. Verify any cross-platform adapter on Linux, macOS, and Windows before making it part of the contributor workflow.

## 🚧 Implementation status

This draft narrows the first implementation to root contributor instructions, merge policy, and dependency setup documentation. It defers skill migration until the contributor versus maintainer skill split and cross-platform discovery behavior are verified.
