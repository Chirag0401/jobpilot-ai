"""Run: streamlit run dashboard.py"""
from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
from urllib.parse import urlparse

import pandas as pd
import streamlit as st
from dotenv import load_dotenv

from ai_providers import DEFAULT_MODELS, KEY_NAMES
from scout import (ROOT, ai_draft, connect_db, load_config, persist_jobs,
                   save_draft, scan, set_status, stored_jobs)

load_dotenv(ROOT / ".env")
st.set_page_config(page_title="JobPilot AI", page_icon="🚀", layout="wide")
st.markdown("""<style>
.block-container {padding-top: 2rem; max-width: 1250px;}
div[data-testid="stMetric"] {border: 1px solid rgba(130,130,130,.22);padding: 16px;border-radius: 12px;}
</style>""", unsafe_allow_html=True)
st.title("🚀 JobPilot AI")
st.caption("DevOps · SRE · Platform Engineering | Newest-first job hunting with approval-based applications")

config = load_config()
conn = connect_db()

with st.sidebar:
    st.header("Search controls")
    freshness = st.selectbox("Google discovery period", ["day", "week", "month", "all"], index=1)
    st.caption("The Google discovery window is not the same as the real publication date.")
    st.write("**Discovery API:**", "Connected" if os.getenv("SERPER_API_KEY") else "Not configured — seeded boards only")
    edition = os.getenv("JOBPILOT_EDITION", "standard").strip().lower()
    st.write("**Edition:**", "Multi-AI" if edition == "multi-ai" else "Standard")
    selected_provider = "Template"
    selected_model = ""
    session_key = ""
    if edition == "multi-ai":
        st.subheader("AI writing assistant")
        selected_provider = st.selectbox("AI provider", ["Template", "OpenAI", "Claude", "Gemini"])
        if selected_provider != "Template":
            selected_model = st.text_input("Model name", value=os.getenv({"OpenAI": "OPENAI_MODEL", "Claude": "CLAUDE_MODEL", "Gemini": "GEMINI_MODEL"}[selected_provider], DEFAULT_MODELS[selected_provider]), key=f"model_{selected_provider}")
            session_key = st.text_input("API key (optional if saved in .env)", type="password", key=f"key_{selected_provider}")
            key_found = bool(session_key.strip() or os.getenv(KEY_NAMES[selected_provider]))
            st.caption("✅ API key provided" if key_found else f"Add {KEY_NAMES[selected_provider]} in .env or paste a key here.")
            st.caption("Keys pasted here remain in this app session and are never written into project files.")
    else:
        st.write("**AI drafts:**", "Template mode — start-multi-ai.sh enables three AI providers")
    if st.button("🔎 Scan now", type="primary", use_container_width=True):
        with st.spinner("Searching career feeds and matching jobs..."):
            try:
                matched, warnings = scan(config, freshness)
                persist_jobs(conn, matched)
                st.success(f"Found {len(matched)} matching currently listed positions.")
                if warnings:
                    with st.expander(f"{len(warnings)} search warnings"):
                        for warning in warnings:
                            st.write("• " + warning)
            except Exception as exc:
                st.error(f"Scan failed: {exc}")
    st.divider()
    st.write("**Personal profile:**", config["profile"]["current_focus"])
    st.caption("Edit config.yaml for roles, skills and acceptable locations.")
    st.caption("No application is submitted by this dashboard.")

jobs = stored_jobs(conn)
if not jobs:
    st.info("No saved jobs yet. Click **Scan now** to check the configured public career boards. Add SERPER_API_KEY to discover new boards with your exact X-Ray queries.")
    st.stop()

with st.container():
    a, b, c, d = st.columns(4)
    a.metric("Tracked roles", len(jobs))
    b.metric("Ready for review", sum(x["status"] in ("new", "saved") for x in jobs))
    c.metric("Approved", sum(x["status"] == "approved" for x in jobs))
    d.metric("Marked applied", sum(x["status"] == "applied" for x in jobs))

browse, desk, settings = st.tabs(["📋 Newest jobs", "✍️ Application desk", "⚙️ How it works"])

with browse:
    left, mid, right = st.columns([1.5, 1, 1])
    min_score = left.slider("Minimum match score", 0, 100, int(config["preferences"].get("min_score", 40)))
    status_filter = mid.selectbox("Application status", ["all", "new", "saved", "approved", "applied", "rejected"])
    dated_only = right.checkbox("Known dates only", value=False)
    rows = [j for j in jobs if j["score"] >= min_score
            and (status_filter == "all" or j["status"] == status_filter)
            and (not dated_only or bool(j["posted_at"]))]
    st.caption("Ordered by ATS date (newest first); unknown dates at the bottom. A posting 'updated' date is NOT the original publication date.")
    display = []
    for j in rows:
        display.append({
            "Posted / updated": j["posted_at"][:10] or "Unknown",
            "Date type": j["date_kind"].replace("_", " "),
            "Fit /100": j["score"], "Role": j["title"], "Company": j["company"],
            "Location": j["location"], "Eligibility": j["location_status"],
            "Status": j["status"], "Last seen": j["last_seen"][:10], "Job link": j["url"]
        })
    st.dataframe(pd.DataFrame(display), hide_index=True, use_container_width=True,
                 column_config={"Job link": st.column_config.LinkColumn("Job link")})
    export = [{k: v for k, v in job.items() if k not in {"draft"}} for job in rows]
    st.download_button("Download results JSON", data=json.dumps(export, indent=2),
                       file_name="jobpilot_jobs.json", mime="application/json", disabled=not bool(export))

with desk:
    selectable = [j for j in jobs if j["status"] != "rejected"]
    if not selectable:
        st.info("No jobs awaiting review.")
    else:
        lookup = {j["uid"]: j for j in selectable}
        selected = st.selectbox("Select a job", [j["uid"] for j in selectable],
                                format_func=lambda u: f"{lookup[u]['title']} · {lookup[u]['company']} ({lookup[u]['score']}/100)")
        job = lookup[selected]
        st.subheader(job["title"] + " — " + job["company"])
        st.write("**Location:**", job["location"], " · **Eligibility:**", job["location_status"])
        st.write("**Why this matches:**", job["match_reasons"])
        st.write("**Date:**", job["posted_at"][:10] or "Unknown", "—", job["date_kind"].replace("_", " "))
        st.link_button("View official job / apply", job["apply_url"] or job["url"])
        with st.expander("Job description"):
            st.write(job["description"][:14000] or "No description provided by this feed.")
        st.divider()
        st.markdown("#### Personalize an application")
        st.caption("Template mode needs no API key. Multi-AI sends job description and any uploaded resume to the chosen provider.")
        resume = st.file_uploader("Optional resume text (.txt/.md) for a more accurate AI draft", type=["txt", "md"])
        if st.button("Generate tailored draft", key="generate_draft"):
            with st.spinner("Drafting from verified experience..."):
                try:
                    text = resume.getvalue().decode("utf-8") if resume else ""
                    drafted = ai_draft(job, config, text, provider=selected_provider, model=selected_model, api_key=session_key)
                    save_draft(conn, selected, drafted)
                    st.session_state[f"draft_{selected}"] = drafted
                    st.success("Draft created. Read and edit it before applying.")
                except Exception as exc:
                    st.error(f"Draft failed: {exc}")
        text = st.text_area("Application answer draft (editable)",
                            value=st.session_state.get(f"draft_{selected}", job.get("draft", "")),
                            key=f"draft_text_{selected}", height=240,
                            placeholder="Generate an answer, then edit it for the specific job application questions.")
        if st.button("Save answer", key="save_draft"):
            save_draft(conn, selected, text)
            st.success("Saved locally.")
        st.divider()
        left, right = st.columns(2)
        with left:
            if st.button("⭐ Save for later", use_container_width=True):
                set_status(conn, selected, "saved")
                st.rerun()
            if st.button("🚫 Skip this role", use_container_width=True):
                set_status(conn, selected, "rejected")
                st.rerun()
        with right:
            approved = st.checkbox("I reviewed the job, my resume, and the application answers.",
                                   key=f"approval_{selected}")
            if st.button("✅ Approve for assisted application", use_container_width=True,
                         disabled=not approved):
                save_draft(conn, selected, text)
                set_status(conn, selected, "approved")
                st.success("Approved. Use the official application link or the optional Playwright autofill helper.")
        if job["status"] in {"approved", "applied"}:
            st.caption("After checking the form and actually submitting it on the employer's site, record that below.")
            if job["status"] == "approved" and st.button("Mark as applied (only after submission)"):
                set_status(conn, selected, "applied")
                st.rerun()
        with st.expander("Optional local browser autofill (you click Submit)"):
            host = urlparse(job["apply_url"] or job["url"]).hostname or ""
            allowed = host in {"jobs.ashbyhq.com", "job-boards.greenhouse.io", "boards.greenhouse.io", "jobs.lever.co", "jobs.eu.lever.co"}
            if allowed:
                st.code(f'python autofill.py --url "{job["apply_url"] or job["url"]}"', language="bash")
                st.caption("Requires playwright install chromium and a private profile file. Never submits for you.")
            else:
                st.info("This host is not supported by the autofill assistant. Please open the official page yourself.")

with settings:
    st.markdown("""### Data sources & limitations
- **Ashby:** Published job feed; date is *last published*.
- **Greenhouse:** Public job board; first-published date used if available, otherwise the update date is flagged.
- **Lever:** Published job feed; created timestamp is not necessarily the exact go-live date.
- **X-Ray:** Optional Serper API discovers additional boards through your four configured queries.
- **Unverified remote:** Excluded by default until you opt in; 'remote' does not prove India eligibility.
- **Application:** This version provides drafts, tracking, and optional local autofill, **not hands-free submission**.
- **Security:** No CAPTCHA bypass. No guessed answers to eligibility, notice period, salary, or work-authorization questions. Never store passwords in `config.yaml`.

For daily runs, check the included GitHub Actions workflow or schedule the CLI locally.
""")
    st.code("python scout.py scan --freshness day --output results/today.json", language="bash")
