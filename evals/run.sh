#!/usr/bin/env bash
# Eval runner for the blog-generator skill.
#
# Usage:
#   bash evals/run.sh                  # Run all prompts
#   bash evals/run.sh --subset         # Run 4 critical prompts
#   bash evals/run.sh --id explicit-01 # Run a single prompt
#   bash evals/run.sh --skip-llm       # Skip LLM rubric grading
#   bash evals/run.sh --tmux           # Run each eval in a tmux window
#
# Env: EVAL_MODEL=sonnet  EVAL_MAX_BUDGET=3.00  TARGET_REPO=/path/to/codebase-to-blog-about
#
# Requires: claude CLI, node >= 18, python3 (for the validator).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILL_DIR="$PROJECT_DIR/skills/blog-generator"
PROMPTS_CSV="$SCRIPT_DIR/prompts.csv"
RESULTS_BASE="$SCRIPT_DIR/results"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
RESULTS_DIR="$RESULTS_BASE/$TIMESTAMP"

SUBSET=false
SINGLE_ID=""
SKIP_LLM=false
USE_TMUX=false
MODEL="${EVAL_MODEL:-sonnet}"
MAX_BUDGET="${EVAL_MAX_BUDGET:-3.00}"
# Default target repo: blog-generator itself (small, public, real code).
TARGET_REPO="${TARGET_REPO:-$PROJECT_DIR}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --subset) SUBSET=true; shift ;;
    --id) SINGLE_ID="$2"; shift 2 ;;
    --skip-llm) SKIP_LLM=true; shift ;;
    --tmux) USE_TMUX=true; shift ;;
    --model) MODEL="$2"; shift 2 ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

SUBSET_IDS="explicit-01 implicit-01 negative-01 edge-01"
TMUX_SESSION="blogeval-$TIMESTAMP"

mkdir -p "$RESULTS_DIR"
ln -sfn "$TIMESTAMP" "$RESULTS_BASE/latest"

if [[ "$USE_TMUX" == "true" ]]; then
  if ! command -v tmux &>/dev/null; then
    echo "Error: tmux is not installed. Install it with: brew install tmux"; exit 1
  fi
  tmux new-session -d -s "$TMUX_SESSION" -n "control" \
    "echo '=== Eval Control — $TMUX_SESSION ==='; echo 'Waiting for evals...'; tail -f /dev/null"
  echo "tmux session: $TMUX_SESSION  (attach: tmux attach -t $TMUX_SESSION)"
fi

echo "=== Blog-Generator Skill Eval ==="
echo "Timestamp:   $TIMESTAMP"
echo "Model:       $MODEL"
echo "Target repo: $TARGET_REPO"
echo "Results:     $RESULTS_DIR"
echo ""

PASS_COUNT=0
FAIL_COUNT=0
TOTAL_COUNT=0

while IFS=, read -r id expect_trigger prompt; do
  prompt="${prompt%\"}"
  prompt="${prompt#\"}"

  if [[ -n "$SINGLE_ID" && "$id" != "$SINGLE_ID" ]]; then continue; fi
  if [[ "$SUBSET" == "true" ]]; then
    if ! echo "$SUBSET_IDS" | grep -qw "$id"; then continue; fi
  fi

  echo "--- [$id] ---"
  echo "  Prompt: $prompt"
  echo "  Expect trigger: $expect_trigger"

  PROMPT_DIR="$RESULTS_DIR/$id"
  mkdir -p "$PROMPT_DIR"

  WORK_DIR=$(mktemp -d)
  # Copy the target codebase
  if [[ -d "$TARGET_REPO" ]]; then
    cp -R "$TARGET_REPO"/* "$WORK_DIR/" 2>/dev/null || true
  fi
  # Install the blog-generator skill where Claude Code can discover it
  mkdir -p "$WORK_DIR/.claude/skills"
  cp -R "$SKILL_DIR" "$WORK_DIR/.claude/skills/blog-generator"
  touch "$WORK_DIR/.eval-start-marker"

  echo "  Running claude -p ..."

  if [[ "$USE_TMUX" == "true" ]]; then
    RUNNER="$PROMPT_DIR/_run.sh"
    cat > "$RUNNER" <<RUNNER_EOF
#!/usr/bin/env bash
echo "=== Eval: $id ==="
echo "Prompt: $prompt"
echo "---"
cd "$WORK_DIR" && claude -p "$prompt" \
  --output-format json \
  --dangerously-skip-permissions \
  --max-budget-usd "$MAX_BUDGET" \
  --no-session-persistence \
  --model "$MODEL" \
  < /dev/null \
  > "$PROMPT_DIR/output.json" 2> >(tee "$PROMPT_DIR/stderr.log" >&2)
echo \$? > "$PROMPT_DIR/_exit_code"
echo ""
echo "=== [$id] finished (exit \$(cat "$PROMPT_DIR/_exit_code")) — press q to close ==="
read -n1 -r -s -p ""
RUNNER_EOF
    chmod +x "$RUNNER"
    tmux new-window -t "$TMUX_SESSION" -n "$id" "bash $RUNNER"
    while [[ ! -f "$PROMPT_DIR/_exit_code" ]]; do sleep 2; done
    EXIT_CODE=$(cat "$PROMPT_DIR/_exit_code")
    rm -f "$PROMPT_DIR/_exit_code" "$PROMPT_DIR/_run.sh"
  else
    (cd "$WORK_DIR" && claude -p "$prompt" \
      --output-format json \
      --dangerously-skip-permissions \
      --max-budget-usd "$MAX_BUDGET" \
      --no-session-persistence \
      --model "$MODEL" \
      < /dev/null \
      > "$PROMPT_DIR/output.json" 2>"$PROMPT_DIR/stderr.log") || true
    EXIT_CODE=$?
  fi

  if [[ $EXIT_CODE -ne 0 ]]; then
    echo "  claude -p exited with code $EXIT_CODE"
    tail -5 "$PROMPT_DIR/stderr.log"
  fi

  # Copy any newly created blog-*.html
  find "$WORK_DIR" -maxdepth 2 -name "blog-*.html" -newer "$WORK_DIR/.eval-start-marker" -exec cp {} "$PROMPT_DIR/" \; 2>/dev/null || true

  rm -rf "$WORK_DIR"

  echo "  Running deterministic grader ..."
  node "$SCRIPT_DIR/graders/deterministic.mjs" "$PROMPT_DIR" "$expect_trigger" > /dev/null 2>&1 || true

  HTML_FILE=$(find "$PROMPT_DIR" -name "blog-*.html" -print -quit 2>/dev/null)
  if [[ "$SKIP_LLM" != "true" && -n "$HTML_FILE" ]]; then
    echo "  Running LLM rubric grader ..."
    node "$SCRIPT_DIR/graders/llm-rubric.mjs" "$HTML_FILE" "$PROMPT_DIR/llm-grade.json" > /dev/null 2>&1 || true
  fi

  echo "  Done."
  echo ""
done < <(tail -n +2 "$PROMPTS_CSV")

echo "=== Generating Report ==="
node "$SCRIPT_DIR/report.mjs" "$RESULTS_DIR"

echo ""
echo "Results saved to: $RESULTS_DIR"
echo "Summary: $RESULTS_DIR/summary.json"

if [[ "$USE_TMUX" == "true" ]]; then
  echo ""
  echo "tmux session '$TMUX_SESSION' is still open."
  echo "  Attach: tmux attach -t $TMUX_SESSION"
  echo "  Kill:   tmux kill-session -t $TMUX_SESSION"
fi
