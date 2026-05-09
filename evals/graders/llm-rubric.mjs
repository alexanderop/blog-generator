#!/usr/bin/env node
/**
 * LLM-based rubric grader for blog-generator output.
 *
 * Usage:
 *   node llm-rubric.mjs <html-path> <output-path>
 *
 * Reads the generated HTML, sends it to claude -p with the rubric (rubric.md),
 * and writes structured JSON grading to output-path.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const [, , htmlPath, outputPath] = process.argv;

if (!htmlPath || !outputPath) {
  console.error("Usage: node llm-rubric.mjs <html-path> <output-path>");
  process.exit(1);
}

const html = readFileSync(htmlPath, "utf8");
const rubric = readFileSync(join(__dirname, "rubric.md"), "utf8");

// Extract the readable content (strip CSS/JS, keep markup).
function extractContent(fullHtml) {
  const titleMatch = fullHtml.match(/<title>(.*?)<\/title>/);
  const title = titleMatch ? titleMatch[1] : "(no title)";

  // Slice out <main>...</main>
  const mainMatch = fullHtml.match(/<main[^>]*>([\s\S]*?)<\/main>/);
  const main = mainMatch ? mainMatch[1] : fullHtml.slice(0, 30000);

  // Cap at 30k chars to control cost
  const capped = main.length > 30000 ? main.slice(0, 30000) + "\n\n[…truncated…]" : main;

  return `## TITLE\n${title}\n\n## MAIN\n${capped}`;
}

const content = extractContent(html);

const jsonSchema = JSON.stringify({
  type: "object",
  properties: {
    real_citations: schemaDim(),
    section_depth: schemaDim(),
    rebuild_plan: schemaDim(),
    voice: schemaDim(),
    diagrams: schemaDim(),
    overall: {
      type: "object",
      properties: {
        score: { type: "number", minimum: 1, maximum: 5 },
        pass: { type: "boolean" },
      },
      required: ["score", "pass"],
    },
  },
  required: [
    "real_citations",
    "section_depth",
    "rebuild_plan",
    "voice",
    "diagrams",
    "overall",
  ],
});

function schemaDim() {
  return {
    type: "object",
    properties: {
      score: { type: "number", minimum: 1, maximum: 5 },
      reasoning: { type: "string" },
    },
    required: ["score", "reasoning"],
  };
}

const prompt = `You are evaluating a generated deep-dive blog post (single self-contained HTML file). Grade it against the rubric below.

${rubric}

---

Here is the post content to evaluate:

${content}

---

Grade each dimension (real_citations, section_depth, rebuild_plan, voice, diagrams) on a 1-5 scale.
Set overall.pass to true if overall.score >= 3 AND no individual dimension is below 2.
Respond ONLY with valid JSON matching the required schema.`;

try {
  const tmpPromptPath = join(dirname(outputPath), ".llm-rubric-prompt.tmp");
  const tmpSchemaPath = join(dirname(outputPath), ".llm-rubric-schema.tmp");
  writeFileSync(tmpPromptPath, prompt, "utf8");
  writeFileSync(tmpSchemaPath, jsonSchema, "utf8");

  const result = execSync(
    `cat "${tmpPromptPath}" | claude -p --model sonnet --output-format json --json-schema "$(cat "${tmpSchemaPath}")" --no-session-persistence --max-budget-usd 0.50`,
    {
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    }
  );

  let grade;
  try {
    const parsed = JSON.parse(result);
    grade = typeof parsed.result === "string" ? JSON.parse(parsed.result) : parsed.result;
  } catch {
    grade = JSON.parse(result);
  }

  writeFileSync(outputPath, JSON.stringify(grade, null, 2));
  console.log(JSON.stringify(grade, null, 2));

  try {
    const { unlinkSync } = await import("node:fs");
    unlinkSync(tmpPromptPath);
    unlinkSync(tmpSchemaPath);
  } catch {}
} catch (err) {
  const fallback = {
    error: err.message,
    real_citations: { score: 0, reasoning: "Grader failed" },
    section_depth: { score: 0, reasoning: "Grader failed" },
    rebuild_plan: { score: 0, reasoning: "Grader failed" },
    voice: { score: 0, reasoning: "Grader failed" },
    diagrams: { score: 0, reasoning: "Grader failed" },
    overall: { score: 0, pass: false },
  };
  writeFileSync(outputPath, JSON.stringify(fallback, null, 2));
  console.error("LLM grader failed:", err.message);
  console.log(JSON.stringify(fallback, null, 2));
  process.exit(1);
}
