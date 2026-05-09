#!/usr/bin/env bash
# Publish a generated blog-<slug>.html to a GitHub-Pages-backed repo.
#
# Usage:
#   bash publish-blog.sh blog-<slug>.html
#
# Env:
#   AIBLOG_DIR  Path to the local clone of the blog repo. Defaults to ~/Projects/aiBlog.
#
# Behaviour:
#   - Extracts <slug> from the filename (must match `blog-<slug>.html`).
#   - Copies the file to <AIBLOG_DIR>/<slug>/index.html (overwriting if it exists).
#   - Stages, commits, and pushes. If nothing changed, prints "already up to date".
#   - Derives the live URL from the `origin` remote (no hardcoded owner).
#   - Prints the live URL on the final line.

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: publish-blog.sh blog-<slug>.html" >&2
  exit 2
fi

src="$1"

if [ ! -f "$src" ]; then
  echo "error: file not found: $src" >&2
  exit 1
fi

base="$(basename -- "$src")"

# Filename gate: must be blog-<slug>.html.
if [[ ! "$base" =~ ^blog-([A-Za-z0-9._-]+)\.html$ ]]; then
  echo "error: filename must match 'blog-<slug>.html' (got: $base)" >&2
  exit 1
fi
slug="${BASH_REMATCH[1]}"

aiblog_dir="${AIBLOG_DIR:-$HOME/Projects/aiBlog}"

if [ ! -d "$aiblog_dir/.git" ]; then
  cat >&2 <<EOF
error: blog repo not found at: $aiblog_dir

This script publishes to a GitHub-Pages-backed repo. If you already have one
elsewhere, point the script at it:

  AIBLOG_DIR=/path/to/your/blog/clone bash publish-blog.sh "$base"

If you don't have one yet, create a public repo and enable Pages once:

  gh repo create <owner>/<repo> --public --clone --add-readme
  cd <repo>
  git push -u origin main
  gh api -X POST repos/<owner>/<repo>/pages -f 'source[branch]=main' -f 'source[path]=/'

Then re-run this script (with AIBLOG_DIR set if it's not at ~/Projects/aiBlog).
EOF
  exit 1
fi

# Derive owner/repo from origin so the live URL works for anyone.
remote_url="$(git -C "$aiblog_dir" remote get-url origin)"
if [[ "$remote_url" =~ github\.com[:/]+([^/]+)/([^/.]+)(\.git)?/?$ ]]; then
  owner="${BASH_REMATCH[1]}"
  repo="${BASH_REMATCH[2]}"
else
  echo "error: could not parse github.com owner/repo from origin: $remote_url" >&2
  exit 1
fi

dest_dir="$aiblog_dir/$slug"
dest_file="$dest_dir/index.html"

mkdir -p "$dest_dir"
cp -- "$src" "$dest_file"

git -C "$aiblog_dir" add -- "$slug/index.html"

live_url="https://${owner}.github.io/${repo}/${slug}/"

if git -C "$aiblog_dir" diff --cached --quiet; then
  echo "already up to date: $slug"
  echo "$live_url"
  echo "(GitHub Pages typically rebuilds in 10-30s)"
  exit 0
fi

git -C "$aiblog_dir" commit -m "publish: $slug" >/dev/null
git -C "$aiblog_dir" push origin HEAD >/dev/null

echo "published: $slug"
echo "$live_url"
echo "(GitHub Pages typically rebuilds in 10-30s)"
