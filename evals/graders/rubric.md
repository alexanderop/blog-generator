# Blog-Generator Quality Rubric

Grade each dimension on a 1–5 scale. Pass = overall ≥ 3 and no individual dimension below 2.

## Real citations

| Score | Criteria |
|-------|----------|
| 5 | Every code snippet and file reference points to a real file in the source codebase. Line ranges (`build.ts:62-218`) cited at least 5 times. No fabricated APIs. |
| 3 | Most citations look real but a few feel paraphrased or generic. |
| 1 | Fabricated function names, made-up file paths, or "in the agent module" hand-waving. |

## Section depth

| Score | Criteria |
|-------|----------|
| 5 | 12+ sections, each with framing prose plus a concrete artifact (snippet, diagram, table, callout). The "clever subsystem" section earns the deep-dive label. |
| 3 | 10+ sections, mostly substantive. A couple feel thin. |
| 1 | <10 sections OR sections that are headings + a bullet list, no real prose. |

## Rebuild plan

| Score | Criteria |
|-------|----------|
| 5 | 8–12 numbered steps starting at 1 and contiguous. Each step is independently runnable — finishing step N produces something that works. The last step tests the abstractions (e.g. "add the second backend"). |
| 3 | Right shape, but some steps are too vague to act on, or independence is unclear. |
| 1 | Generic ("set up project", "write tests") or fewer than 8 steps. |

## Voice

| Score | Criteria |
|-------|----------|
| 5 | First-person plural / impersonal. No marketing language ("powerful", "blazing-fast", "best-in-class"). Surprising design choices are *named* in callouts. Em-dashes for asides. |
| 3 | Mostly clean, occasional marketing slip or hedge. |
| 1 | Reads like a feature page or a tutorial-for-users. |

## Diagrams

| Score | Criteria |
|-------|----------|
| 5 | At least 3 Mermaid diagrams: one layered architecture (flowchart), one sequence (main loop), one for the clever subsystem. Each diagram earns its place — replacing it with prose would lose information. |
| 3 | 3 diagrams present but one is decorative or redundant with the prose. |
| 1 | <3 diagrams, or diagrams are ASCII boxes / generic flowcharts. |

## Pass Criteria

- Overall score >= 3
- No individual dimension below 2
