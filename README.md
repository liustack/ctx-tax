# ctx-tax

**Every skill you install charges rent in every session. This shows your bill.**

Agent skills, CLAUDE.md files, rules, and session hooks all load into your agent's context before you type your first word. That is paid attention: it shapes behavior, crowds out your actual work, and nobody itemizes it. `ctx-tax` does.

```bash
npx @liustack/ctx-tax
# or straight from the repo, no npm needed:
npx github:liustack/ctx-tax
```

```
Every session, before your first word:

  skill descriptions (20 skills)                  2k
  ~/.claude/CLAUDE.md                           1.9k
  ~/.codex/AGENTS.md                            2.6k
  ~/.claude/rules (2 files)                       1k
  ──────────────────────────────────────────────────
  always-on total                               7.6k  = 0.8% of Claude Code 1M · 2.9% of Codex ~258k effective

When a skill fires (top by max):

  skill                               on trigger   max w/ references
  ppt-master                                 19k                301k
  vercel-react-best-practices               1.8k                 56k
  claude-api                                4.5k                 44k
  ...
```

Two tiers, because that is how the cost actually lands:

- **Always-on**: skill descriptions, memory files, and rules that every single session carries, whether they get used or not.
- **When a skill fires**: what one invocation loads (the skill body), and the worst case with every reference file pulled in. A skill whose max rivals the window is a skill that crowds out the actual work.

Run it from a project directory to include that project's `.claude/skills`, `CLAUDE.md`, and `AGENTS.md`.

## What it scans

`./.claude/skills`, `~/.claude/skills`, `~/.agents/skills`, `~/.codex/skills` (one copy per skill name, priority in that order), `CLAUDE.md` and `AGENTS.md` (global and project, Claude Code and Codex), `.claude/rules`, and it flags `SessionStart` hooks in settings, which inject extra unmeasured context each session.

Percentages are shown against the windows the two harnesses actually run: Claude Code's 1M, and Codex's ~258k effective (the app caps GPT-5.5 and 5.6 at a 272k catalog entry with a 95% compaction threshold, whatever the model page advertises).

## The ruler

Tokens are estimated as ascii characters / 4 plus one per CJK character. Rough (about ±15%), but identical for everything measured, so the comparisons hold even where the absolute numbers wobble. Locale twins (`*.zh-CN.md` and friends) are excluded from a skill's max, since a session never loads both languages.

`--json` gives you the raw numbers.

## Why we built it

We ship [liustack](https://github.com/liustack/liustack), a four-skill working loop that bets on staying light. This tool is how we measure that bet, published so you can audit anyone's claim, including ours.

MIT.
