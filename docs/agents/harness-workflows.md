# Optional harness workflows

These workflows preserve existing Claude-to-Codex delegation guidance for contributors who choose to use those tools.

Shared contributor requirements live in [AGENTS.md](../../AGENTS.md). Neither Claude Code nor Codex is required to invoke the other harness for ordinary contributor work. The recipes below require their named tools or plugins and apply only when you choose that workflow.

## Existing model routing

The [model-routing guide](model-routing.md) retains its historical model choices, benchmark claims, and task boundaries. Its obsolete reference to a missing skill now points to this optional workflow guide.

The legacy guidance below is preserved from the root `AGENTS.md`. It differs from the model-routing guide on reasoning levels and which tasks to delegate. Both remain available pending a separate review; this PR does not select new models or change task ownership.

## Claude advisor workflow

The following instruction previously appeared in `CLAUDE.md` and belongs to the optional Claude-to-Codex workflow.

- For consequential, hard-to-reverse choices (new tables/tenancy shapes, cross-module contracts, public API surface), convene an advisor quorum: form your own position, get an independent `codex exec` opinion at `xhigh` (read-only). Agree → proceed. Disagree → resolve on the merits or surface it to the user with a recommendation.

## Feature Lifecycle Tracking (multi-wave features)
Multi-wave features are tracked on GitHub (parent issue labeled `feature`, `wave` sub-issues) via the `feature-lifecycle` MCP server and skill; GitHub state is the source of truth, not the plan doc. After `writing-plans` finishes a multi-wave plan: `register_feature` and add `tracking_issue:` to its frontmatter. Starting a wave: `get_feature_status`, branch `feature/<parent#>-<slug>/wave-<subissue#>`, `start_wave`. PR bodies carry `Closes #<sub-issue>`.

## Codex Delegation

This project uses OpenAI Codex CLI for task delegation. Claude orchestrates complex work while Codex handles isolated tasks.

### Quick Commands

```bash
# Standard task
codex exec "<task>" --full-auto -C "$(git rev-parse --show-toplevel)"

# With reasoning level (low/medium/high/xhigh)
codex exec "<task>" --full-auto -c 'model_reasoning_effort="xhigh"'

# Resume previous session
codex exec resume --last "<follow-up>"
```

### Delegation Guidelines

#### Delegate to Codex
| Task | Reasoning | Example |
|------|-----------|---------|
| File operations | low | "Find all files importing X" |
| Utility functions | medium | "Create a slugify utility" |
| CRUD endpoints | medium | "Add DELETE /api/devices/:id" |
| Test generation | medium | "Write tests for formatBytes" |
| Lint/type fixes | medium | "Fix TypeScript errors in auth.ts" |
| Code analysis | high | "Review this for security issues" |
| Architecture | xhigh | "Design the caching strategy" |

#### Keep with Claude
- Multi-tenant data isolation
- Authentication/authorization logic
- Cross-module refactoring
- Business logic implementation
- Coordinating multiple Codex tasks
- Final code review and integration

### Reasoning Effort Findings

| Level | Behavior | Use When |
|-------|----------|----------|
| `low` | Verbose, more tokens | Simple mechanical tasks |
| `medium` | Balanced (default) | Standard code generation |
| `high` | Thoughtful analysis | Code review, debugging |
| `xhigh` | Strategic, concise, fewer tokens | Architecture decisions |

### Token Costs (Tested)

| Task Type | Approximate Tokens |
|-----------|-------------------|
| File search | ~1.3k |
| Code comprehension | ~2.9k |
| Utility generation | ~3.5k |
| Security analysis | ~2.4-4.7k |
| Architecture design | ~1.6-4.7k |

### Codex Strengths (Observed)

- Uses `rg` efficiently for searches
- Proactively creates directories and updates exports
- Follows existing project conventions
- Good at isolated, well-scoped tasks
- Excellent security analysis capabilities

---
