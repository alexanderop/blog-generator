#!/usr/bin/env node
/**
 * Report aggregator for blog-generator eval results.
 *
 * Usage:
 *   node report.mjs <results-timestamp-dir> [--json]
 */

import { readdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , resultsDir, ...flags] = process.argv;
const jsonOnly = flags.includes("--json");

if (!resultsDir) {
  console.error("Usage: node report.mjs <results-timestamp-dir> [--json]");
  process.exit(1);
}

const promptDirs = readdirSync(resultsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

const rows = [];

for (const promptId of promptDirs) {
  const dir = join(resultsDir, promptId);
  const row = {
    prompt_id: promptId,
    triggered: null,
    det_score: null,
    det_total: null,
    validator: null,
    llm_score: null,
    pass: null,
  };

  const detPath = join(dir, "deterministic.json");
  if (existsSync(detPath)) {
    const det = JSON.parse(readFileSync(detPath, "utf8"));
    if (det.expect_trigger) {
      row.triggered = det.checks.file_exists?.pass ? "yes" : "NO";
    } else {
      row.triggered = det.checks.no_trigger?.pass ? "no (OK)" : "TRIGGERED";
    }
    row.det_score = det.passed;
    row.det_total = det.total;
    row.validator = det.checks.validator_pass?.detail || "—";

    if (!det.expect_trigger) {
      row.pass = det.checks.no_trigger?.pass ? "PASS" : "FAIL";
    } else {
      row.pass = det.score >= 0.8 ? "PASS" : "FAIL";
    }
  }

  const llmPath = join(dir, "llm-grade.json");
  if (existsSync(llmPath)) {
    const llm = JSON.parse(readFileSync(llmPath, "utf8"));
    row.llm_score = llm.overall?.score ?? null;
    if (llm.overall?.pass === false && row.pass !== "FAIL") {
      row.pass = "FAIL";
    }
  }

  rows.push(row);
}

const total = rows.length;
const passed = rows.filter((r) => r.pass === "PASS").length;
const failed = rows.filter((r) => r.pass === "FAIL").length;
const passRate = total > 0 ? +(passed / total).toFixed(3) : 0;

const summary = { total, passed, failed, pass_rate: passRate, rows };

if (jsonOnly) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log("");
  console.log("| Prompt ID      | Triggered  | Det. Score | Validator       | LLM | Pass |");
  console.log("|----------------|------------|------------|-----------------|-----|------|");
  for (const r of rows) {
    const det = r.det_score !== null ? `${r.det_score}/${r.det_total}` : "N/A";
    const validator = (r.validator || "—").toString().slice(0, 15);
    const llm = r.llm_score !== null ? r.llm_score.toFixed(1) : "N/A";
    console.log(
      `| ${r.prompt_id.padEnd(14)} | ${(r.triggered || "?").toString().padEnd(10)} | ${det.padEnd(10)} | ${validator.padEnd(15)} | ${llm.padEnd(3)} | ${r.pass || "?"} |`
    );
  }
  console.log("");
  console.log(`Pass rate: ${passed}/${total} (${(passRate * 100).toFixed(1)}%)`);
  console.log("");
}

writeFileSync(join(resultsDir, "summary.json"), JSON.stringify(summary, null, 2));
