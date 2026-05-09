#!/usr/bin/env node
/**
 * Deterministic grader for blog-generator output.
 *
 * Usage:
 *   node deterministic.mjs <result-dir> <expect_trigger>
 *
 * - result-dir: directory containing blog-*.html (or empty if negative case)
 * - expect_trigger: "true" or "false"
 *
 * Wraps scripts/validate-blog.sh from the skill itself + adds eval-specific checks.
 * Writes deterministic.json into result-dir.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// SCRIPT lives at <project>/evals/graders/deterministic.mjs → ../../skills/blog-generator/scripts/
const VALIDATOR = resolve(
  __dirname,
  "../../skills/blog-generator/scripts/validate-blog.sh"
);

const [, , resultDir, expectTriggerStr] = process.argv;

if (!resultDir || !expectTriggerStr) {
  console.error("Usage: node deterministic.mjs <result-dir> <expect_trigger>");
  process.exit(1);
}

const expectTrigger = expectTriggerStr === "true";
const promptId = resultDir.split("/").pop();

const files = readdirSync(resultDir);
const htmlFile = files.find(
  (f) => f.startsWith("blog-") && f.endsWith(".html")
);
const htmlPath = htmlFile ? join(resultDir, htmlFile) : null;

const checks = {};
function check(id, pass, detail) {
  checks[id] = { pass, ...(detail !== undefined ? { detail } : {}) };
}

// --- Negative case: skill should NOT have triggered ---
if (!expectTrigger) {
  check(
    "no_trigger",
    !htmlFile,
    htmlFile ? `Unexpected file produced: ${htmlFile}` : undefined
  );

  const result = {
    prompt_id: promptId,
    html_file: htmlFile || null,
    expect_trigger: false,
    checks,
    passed: Object.values(checks).filter((c) => c.pass).length,
    failed: Object.values(checks).filter((c) => !c.pass).length,
    total: Object.keys(checks).length,
    score: Object.values(checks).every((c) => c.pass) ? 1 : 0,
  };

  writeFileSync(
    join(resultDir, "deterministic.json"),
    JSON.stringify(result, null, 2)
  );
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

// --- Positive case: skill SHOULD have triggered ---

check("file_exists", !!htmlFile, htmlFile || "no blog-*.html produced");
check(
  "file_naming",
  htmlFile ? /^blog-[a-z0-9-]+\.html$/.test(htmlFile) : false,
  htmlFile
);

if (htmlFile && existsSync(VALIDATOR)) {
  // Run the skill's own validator and parse PASS/FAIL
  let validatorOutput = "";
  let validatorExit = 0;
  try {
    validatorOutput = execSync(`bash "${VALIDATOR}" "${htmlPath}"`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    validatorOutput = (err.stdout || "") + (err.stderr || "");
    validatorExit = err.status ?? 1;
  }
  // Parse the "Result: PASS (n/m)" or "Result: FAIL (n/m, k failed)" line
  const m = validatorOutput.match(
    /Result:\s+(PASS|FAIL)\s+\((\d+)\/(\d+)/
  );
  if (m) {
    const passed = parseInt(m[2], 10);
    const total = parseInt(m[3], 10);
    check(
      "validator_pass",
      m[1] === "PASS",
      `${m[1]}: ${passed}/${total}`
    );
    check(
      "validator_score",
      passed / total >= 0.8,
      `${passed}/${total} = ${((passed / total) * 100).toFixed(0)}%`
    );
  } else {
    check(
      "validator_pass",
      false,
      `Could not parse validator output (exit ${validatorExit})`
    );
  }
} else if (htmlFile) {
  check("validator_pass", false, `Validator script not found at ${VALIDATOR}`);
}

// Quick sanity checks (independent of the validator)
if (htmlPath) {
  const html = readFileSync(htmlPath, "utf8");
  check(
    "self_contained_doctype",
    html.trimStart().toLowerCase().startsWith("<!doctype html>")
  );
  check("dark_default", html.includes('<html lang="en" class="dark">'));
  check("mermaid_cdn", html.includes("mermaid@11"));
  check("shiki_cdn", html.includes("shiki@1"));
}

// --- Compute result ---
const passed = Object.values(checks).filter((c) => c.pass).length;
const failed = Object.values(checks).filter((c) => !c.pass).length;
const total = Object.keys(checks).length;

const result = {
  prompt_id: promptId,
  html_file: htmlFile || null,
  expect_trigger: true,
  checks,
  passed,
  failed,
  total,
  score: total > 0 ? +(passed / total).toFixed(3) : 0,
};

writeFileSync(
  join(resultDir, "deterministic.json"),
  JSON.stringify(result, null, 2)
);
console.log(JSON.stringify(result, null, 2));
