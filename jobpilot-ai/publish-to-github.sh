#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v git >/dev/null; then
  echo "Git is missing. Install it from https://git-scm.com/ and retry."
  exit 1
fi
if ! command -v gh >/dev/null; then
  echo "GitHub CLI is missing. On a Mac run: brew install gh"
  echo "For other systems: https://cli.github.com/"
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "First sign in to GitHub: gh auth login"
  exit 1
fi
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git init -b main
fi
if ! git config user.name >/dev/null || ! git config user.email >/dev/null; then
  echo "Git needs your name and email. Configure them first:"
  echo '  git config --global user.name "Your Name"'
  echo '  git config --global user.email "you@example.com"'
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  git add .
  echo "Files staged for publishing:"
  git diff --cached --name-only
  echo
  read -r -p "Publish these files in a PUBLIC GitHub repository? Type yes to continue: " answer
  if [[ "$answer" != "yes" ]]; then
    echo "Stopped without publishing."
    exit 0
  fi
  git commit -m "Initial release of JobPilot AI"
fi
gh repo create jobpilot-ai --public --source=. --remote=origin --push
echo "Published to GitHub."
