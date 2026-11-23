#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ ! -d .venv ]]; then python3 -m venv .venv; fi
# shellcheck disable=SC1091
source .venv/bin/activate
python -m pip install -r requirements.txt
if [[ ! -f .env ]]; then cp .env.example .env; fi
export JOBPILOT_EDITION=multi-ai
exec streamlit run dashboard.py
