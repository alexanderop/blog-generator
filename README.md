# Blog Generator Skill

A Claude Code skill that generates a self-contained, deeply technical HTML blog post explaining how a codebase, library, or architecture works — in enough detail that a reader could rebuild it.

## What it does

Ask your agent to write a deep-dive blog post about a library, codebase, or architectural pattern, and it produces a single self-contained HTML file with:

- **AstroPaper-style aesthetic** — mono font, skin-token CSS variables, accent-colored headings (`# section`, `## subsection`).
- **Working light/dark toggle** — sun/moon icon in the header, `localStorage`-persisted, `prefers-color-scheme` fallback.
- **Mermaid diagrams** (CDN ESM, Mermaid 11) — flowcharts and sequence diagrams that re-render on theme toggle.
- **Shiki syntax highlighting** (CDN ESM) — `github-dark-dimmed` / `github-light`, re-highlights on theme toggle.
- **TOC, callouts, tables, code blocks** — all themed off the same skin tokens.
- **A "rebuild plan"** — 8-12 numbered milestones at the end of every post, each one independently runnable.

The goal: a publishable artifact a reader can reverse-engineer the system from.

## Usage

Trigger the skill with prompts like:

```
$blog
write a blog post explaining how this SDK works so I can rebuild it
deep dive on how this build pipeline works
in-depth post about the schema-injection trick
```

The agent will:

1. Explore the codebase using parallel `Task` subagents
2. Synthesize findings into a 12-15 section deep-dive structure
3. Copy `assets/blog-template.html` to `blog-{slug}.html` in the project root and fill it in
4. Run `scripts/validate-blog.sh` to gate the result on structure
5. Open it in your browser

## Installation

### Quick install

```bash
npx skills add https://github.com/alexanderop/blog-generator --skill blog-generator
```

### Manual install

Copy the `skills/blog-generator/` directory into your project's `.claude/skills/` folder:

```
your-project/
  .claude/
    skills/
      blog-generator/
        SKILL.md
        assets/
          blog-template.html
        scripts/
          validate-blog.sh
        references/
          html-template.md
          content-structure.md
          subagent-report-format.md
```

## Structure

```
skills/blog-generator/
  SKILL.md                              # Main skill definition — workflow + checklist
  assets/
    blog-template.html                  # The HTML skeleton the agent copies
  scripts/
    validate-blog.sh                    # Deterministic post-generation gate
  references/
    html-template.md                    # Snippet patterns (sections, code, callouts, Mermaid, tables) + anti-patterns
    content-structure.md                # Section-by-section guide, voice rules, length targets, generation conventions
    subagent-report-format.md           # Format Explore subagents must return during Step 2
```

- **SKILL.md** — the prompt the agent follows. Defines the workflow: scope clarification, parallel codebase exploration, outlining, HTML generation, and validation.
- **assets/blog-template.html** — the full skeleton with `{{PLACEHOLDER}}` markers. Copy, don't reconstruct.
- **scripts/validate-blog.sh** — checks doctype, theme tokens, ≥3 Mermaid diagrams, language classes on every code block, TOC anchor resolution, ≥2 callouts, contiguous numbered rebuild steps, no unfilled placeholders.
- **references/html-template.md** — snippet patterns (callouts, Mermaid blocks, code blocks, tables) + the anti-patterns list.
- **references/content-structure.md** — the 12-15 section recipe, length targets, voice rules, generation conventions.
- **references/subagent-report-format.md** — exact format Explore subagents must return during Step 2.

## Validation

After the agent generates a post, the workflow runs:

```bash
bash .claude/skills/blog-generator/scripts/validate-blog.sh blog-{slug}.html
```

Exits 0 on PASS, non-zero on the first failure. You can also run it manually against any blog file you've generated.

## Evals

A small eval harness lives in `evals/` (mirrors the pattern used by `learning/walkthrough`).

```bash
bash evals/run.sh --subset --skip-llm     # 4 critical prompts, deterministic only — fast feedback
bash evals/run.sh                         # all 12 prompts + LLM rubric
bash evals/run.sh --id explicit-01        # single prompt
TARGET_REPO=/path/to/test-codebase bash evals/run.sh
```

Results land in `evals/results/<timestamp>/` with a `latest` symlink. Default budget is `EVAL_MAX_BUDGET=3.00` USD. The deterministic grader wraps `scripts/validate-blog.sh`; the LLM grader uses `evals/graders/rubric.md` for real-citations / section-depth / rebuild-plan / voice / diagrams.

## Tech stack (generated files)

The output HTML files are fully self-contained with CDN dependencies:

- **Vanilla HTML + CSS** — no Tailwind, no React, no build step.
- **Mermaid 11** (ESM, jsdelivr) — flowcharts and sequence diagrams; theme-aware via CSS variables.
- **Shiki 1.x** (ESM, esm.sh) — code highlighting; swaps theme on toggle.

No build step. Just `open blog-{slug}.html`.

## Aesthetic reference

The styling is a vanilla port of the [AstroPaper](https://astro-paper.pages.dev/) theme's skin-token system: `--color-fill`, `--color-text-base`, `--color-accent`, `--color-card`, `--color-card-muted`, `--color-border`, `--color-inverted`. Defaults to dark (navy + orange); light mode is cream + teal-blue.

## When to use this vs. the walkthrough skill

| Want | Use |
|------|-----|
| A 2-minute interactive diagram for onboarding | [`walkthrough`](https://github.com/alexanderop/walkthrough) |
| A long-form, publishable, reverse-engineering post | `blog-generator` |

Walkthroughs are mental maps. Blog posts are rebuild instructions.
