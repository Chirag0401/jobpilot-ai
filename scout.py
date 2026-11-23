"""JobPilot AI: public ATS feeds + optional Google X-Ray discovery.

Read-only discovery. It DOES NOT submit any applications.
"""
from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import html
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import time
from typing import Optional
from urllib.parse import urlparse, urlunparse

import requests
import yaml
from bs4 import BeautifulSoup
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent
DB_DEFAULT = ROOT / "jobpilot.sqlite3"
USER_AGENT = "JobPilotAI/0.1 (personal job search; public job boards)"
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})
DATE_PRIORITY = {"first_published": 4, "last_published": 3, "created": 2, "updated_only": 1, "unknown": 0}


@dataclass
class Job:
    uid: str
    company: str
    title: str
    location: str
    platform: str
    url: str
    apply_url: str
    description: str
    posted_at: str = ""
    date_kind: str = "unknown"
    workplace: str = ""
    location_status: str = "unverified"
    score: int = 0
    match_reasons: str = ""


def clean_html(value: str) -> str:
    return BeautifulSoup(html.unescape(value or ""), "html.parser").get_text(" ", strip=True)


def parse_date(value) -> str:
    if not value:
        return ""
    try:
        if isinstance(value, (float, int)):
            value = float(value)
            if value > 1e11:  # Lever createdAt is milliseconds.
                value /= 1000
            dt = datetime.fromtimestamp(value, tz=timezone.utc)
        else:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat(timespec="seconds")
    except (ValueError, TypeError, OverflowError, OSError):
        return ""


def canonical_url(url: str) -> str:
    p = urlparse(url)
    if p.scheme not in {"http", "https"}:
        return ""
    path = p.path.rstrip("/")
    if path.endswith("/apply"):
        path = path[:-6]
    return urlunparse((p.scheme, p.netloc.lower(), path, "", "", ""))


def uid(platform: str, board: str, job_id: str, url: str) -> str:
    key = f"{platform}:{board.lower()}:{job_id or canonical_url(url)}"
    return hashlib.sha256(key.encode()).hexdigest()[:20]


def safe_get(url: str, **kwargs) -> dict:
    response = SESSION.get(url, timeout=16, **kwargs)
    response.raise_for_status()
    return response.json()


# Public wrappers preserve original imports and test monkeypatching.
def fetch_ashby(board: str) -> list[Job]:
    from sources.ats import fetch_ashby as fetch
    return fetch(board)


def fetch_greenhouse(board: str) -> list[Job]:
    from sources.ats import fetch_greenhouse as fetch
    return fetch(board)


def fetch_lever(board: str) -> list[Job]:
    from sources.ats import fetch_lever as fetch
    return fetch(board)


def role_match(title: str, terms: list[str] | None = None) -> bool:
    t = title.lower()
    configured = terms or ("devops", "dev ops", "site reliability", "sre",
                           "platform engineer", "cloud engineer", "infrastructure engineer",
                           "cloud native engineer", "openshift", "kubernetes engineer")
    return any(term.lower() in t for term in configured)


def ats_board_from_url(url: str) -> tuple[str, str] | None:
    p = urlparse(url)
    parts = [x for x in p.path.split("/") if x]
    host = (p.hostname or "").lower()
    if not parts:
        return None
    if host == "jobs.ashbyhq.com":
        return ("ashby", parts[0])
    if host in {"job-boards.greenhouse.io", "boards.greenhouse.io"}:
        return ("greenhouse", parts[0])
    if host in {"jobs.lever.co", "jobs.eu.lever.co"}:
        return ("lever", parts[0])
    if host in {"careers.smartrecruiters.com", "jobs.smartrecruiters.com"}:
        return ("smartrecruiters", parts[0])
    if host in {"apply.workable.com", "jobs.workable.com"}:
        return ("workable", parts[0])
    return None


def discover_serper(config: dict, freshness: str) -> tuple[set[tuple[str, str]], list[Job], list[str]]:
    key = os.getenv("SERPER_API_KEY", "").strip()
    if not key:
        return set(), [], ["SERPER_API_KEY missing: scanning configured boards only. Google X-Ray discovery disabled."]
    tbs = {"day": "qdr:d", "week": "qdr:w", "month": "qdr:m", "all": ""}.get(freshness, "qdr:w")
    boards, external, warnings = set(), [], []
    for q in config["search"]["queries"]:
        payload = {"q": q, "num": min(20, int(config["search"].get("results_per_query", 10))),
                   "gl": "in", "hl": "en"}
        if tbs:
            payload["tbs"] = tbs
        try:
            response = SESSION.post("https://google.serper.dev/search",
                                    headers={"X-API-KEY": key, "Content-Type": "application/json"},
                                    json=payload, timeout=20)
            response.raise_for_status()
            for item in response.json().get("organic", []):
                url = item.get("link", "")
                board = ats_board_from_url(url)
                if board:
                    boards.add(board)
                    continue
                # General OpenShift/OCP query: retain relevant non-ATS links, date UNKNOWN.
                if "site:" not in q.lower() and canonical_url(url):
                    title = item.get("title", "")
                    snippet = item.get("snippet", "")
                    if role_match(title) and not any(x in (urlparse(url).hostname or "").lower() for x in ("linkedin.com", "indeed.com", "naukri.com")):
                        link = canonical_url(url)
                        external.append(Job(uid("web", "external", "", link),
                                            (urlparse(url).hostname or "External site"), title,
                                            "Location not verified", "Web search", link, link, snippet))
        except (requests.RequestException, ValueError, AttributeError) as exc:
            warnings.append(f"Search for {q[:42]}... failed: {exc}")
    return boards, external, warnings


def location_check(job: Job, prefs: dict) -> tuple[str, int]:
    """Never mistake a generic worldwide 'remote' listing for permission to work from India."""
    loc = (job.location or "").lower()
    workplace = (job.workplace or "").lower()
    desc = (job.description or "").lower()
    preferred = prefs.get("preferred_cities", ["mumbai"])
    other = prefs.get("acceptable_india_cities", [])
    if any(city in loc for city in preferred):
        return "Mumbai area", 22
    if "india" in loc or "भारत" in loc:
        if "remote" in loc or "remote" in workplace:
            return "Remote India", 22
        return "India", 12
    if any(city in loc for city in other):
        return ("India city", 9) if prefs.get("include_other_india_cities", True) else ("excluded", 0)
    if "remote" in loc or "remote" in workplace:
        # Only explicitly India-eligible remote is accepted without review.
        if re.search(r"remote.{0,40}india|india.{0,40}remote|work from india", desc[:4000]):
            return "Remote India", 22
        return "Remote eligibility unverified", 3
    if loc in {"", "location not verified", "worldwide", "global", "anywhere"}:
        return "Location unverified", 0
    return "excluded", 0


def score_job(job: Job, prefs: dict) -> Job | None:
    if not role_match(job.title, prefs.get("role_terms")):
        return None
    title_lower = job.title.lower()
    if any(w in title_lower for w in prefs.get("exclude_seniority_terms", [])):
        return None
    loc_status, loc_score = location_check(job, prefs)
    if loc_status == "excluded":
        return None
    if loc_status == "Remote India" and not prefs.get("allow_remote_india", True):
        return None
    if loc_status in {"Remote eligibility unverified", "Location unverified"} and not prefs.get("include_unverified_remote", False):
        return None
    # Scoring is a transparent heuristic, not AI-certified suitability.
    t = (job.title + " " + job.description).lower()
    matches = [x for x in prefs.get("technology_terms", []) if x.lower() in t]
    role_score = 42 if any(x in title_lower for x in ["devops", "site reliability", "sre", "platform"]) else 34
    tech_score = min(36, len(matches) * 5)
    seniority_penalty = 7 if "senior" in title_lower or "lead" in title_lower else 0
    job.score = max(0, min(100, role_score + loc_score + tech_score - seniority_penalty))
    job.location_status = loc_status
    job.match_reasons = ", ".join(matches[:10]) or "Role keyword match; review technical fit"
    return job if job.score >= int(prefs.get("min_score", 40)) else None


def newest_first(jobs: list[Job]) -> list[Job]:
    # ISO UTC timestamps sort lexically; unknown dates always last.
    return sorted(jobs, key=lambda x: (bool(x.posted_at), x.posted_at, x.score), reverse=True)


def scan(config: dict, freshness_override: Optional[str] = None) -> tuple[list[Job], list[str]]:
    warnings = []
    seed = config.get("boards", {})
    boards = {(platform, str(board)) for platform, entries in seed.items() for board in entries}
    freshness = freshness_override or config["preferences"].get("freshness", "week")
    discovered, external, warnings = discover_serper(config, freshness)
    boards.update(discovered)
    max_boards = int(config["search"].get("max_discovered_boards", 30))
    if len(boards) > max_boards:
        warnings.append(f"Limited to {max_boards} boards this run (configured + discovered).")
    from sources.careers import fetch_smartrecruiters, fetch_workable, fetch_structured_page, resolve_board
    from sources.remote import fetch_himalayas, fetch_remotive, fetch_remoteok
    fetchers = {"ashby": fetch_ashby, "greenhouse": fetch_greenhouse, "lever": fetch_lever,
                "smartrecruiters": fetch_smartrecruiters, "workable": fetch_workable}
    for career_url in config.get("company_career_urls", []):
        match = resolve_board(career_url)
        if match:
            boards.add(match)
    all_jobs = list(external)
    for career_url in config.get("company_career_urls", []):
        if resolve_board(career_url):
            continue
        try:
            parsed = fetch_structured_page(career_url)
            all_jobs.extend(parsed)
            if not parsed:
                warnings.append(f"No JobPosting structured data found at {career_url}. Add a direct posting URL or a supported ATS page.")
        except (requests.RequestException, ValueError) as exc:
            warnings.append(f"Could not read career page {career_url}: {exc}")
    remote_sources = config.get("remote_sources", {})
    remote_fetchers = {"himalayas": fetch_himalayas, "remotive": fetch_remotive, "remoteok": fetch_remoteok}
    for source, fetch in remote_fetchers.items():
        if remote_sources.get(source, False):
            try:
                all_jobs.extend(fetch())
            except (requests.RequestException, ValueError, TypeError, KeyError) as exc:
                warnings.append(f"Could not fetch {source}: {exc}")
    for provider, board in sorted(boards)[:max_boards]:
        try:
            all_jobs.extend(fetchers[provider](board))
        except (requests.RequestException, ValueError, TypeError, KeyError) as exc:
            warnings.append(f"Could not fetch {provider}/{board}: {exc}")
    prefs = config["preferences"]
    seen = {}
    seen_urls = {}
    now = datetime.now(timezone.utc)
    max_days = int(prefs.get("max_age_days", 30))
    for job in all_jobs:
        scored = score_job(job, prefs)
        if scored is None:
            continue
        if job.posted_at:
            posted = datetime.fromisoformat(job.posted_at)
            if posted < now - timedelta(days=max_days):
                continue
        canonical = canonical_url(job.url)
        if canonical in seen_urls:
            previous_uid = seen_urls[canonical]
            previous = seen[previous_uid]
            if DATE_PRIORITY[job.date_kind] > DATE_PRIORITY[previous.date_kind]:
                del seen[previous_uid]
                seen[job.uid] = job
                seen_urls[canonical] = job.uid
            continue
        if job.uid not in seen or DATE_PRIORITY[job.date_kind] > DATE_PRIORITY[seen[job.uid].date_kind]:
            seen[job.uid] = job
            seen_urls[canonical] = job.uid
    return newest_first(list(seen.values())), warnings


def connect_db(path: Path = DB_DEFAULT) -> sqlite3.Connection:
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("""CREATE TABLE IF NOT EXISTS jobs (
        uid TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new',
        draft TEXT NOT NULL DEFAULT '',
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL
    )""")
    conn.commit()
    return conn


def persist_jobs(conn: sqlite3.Connection, jobs: list[Job]) -> None:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for job in jobs:
        # Preserve application history/drafts across repeated scans.
        conn.execute("""INSERT INTO jobs(uid,payload,first_seen,last_seen) VALUES (?,?,?,?)
        ON CONFLICT(uid) DO UPDATE SET payload=excluded.payload,last_seen=excluded.last_seen""",
                     (job.uid, json.dumps(asdict(job)), now, now))
    conn.commit()


def stored_jobs(conn: sqlite3.Connection, status: str = "") -> list[dict]:
    rows = conn.execute("SELECT * FROM jobs" + (" WHERE status=?" if status else ""),
                        (status,) if status else ()).fetchall()
    result = [{**json.loads(row["payload"]), "status": row["status"],
               "draft": row["draft"], "first_seen": row["first_seen"],
               "last_seen": row["last_seen"]} for row in rows]
    return sorted(result, key=lambda j: (bool(j["posted_at"]), j["posted_at"], j["score"]), reverse=True)


def set_status(conn: sqlite3.Connection, job_uid: str, status: str) -> None:
    valid = {"new", "saved", "approved", "applied", "rejected"}
    if status not in valid:
        raise ValueError("Unknown status")
    conn.execute("UPDATE jobs SET status=? WHERE uid=?", (status, job_uid))
    conn.commit()


def save_draft(conn: sqlite3.Connection, job_uid: str, draft: str) -> None:
    conn.execute("UPDATE jobs SET draft=? WHERE uid=?", (draft, job_uid))
    conn.commit()


def draft_template(job: dict, config: dict) -> str:
    """No-key alternative: editable prompts grounded in the user's own verified skills."""
    verified = config.get("profile", {}).get("verified_experience", [])
    skills = ", ".join(verified[:3]) if verified else "[add your verified technical skills]"
    return (
        f"Why I want to join {job.get('company','this company')} as a {job.get('title','team member')}:\n"
        f"I'm interested in the role because [insert what genuinely caught your attention]. "
        f"My relevant experience includes {skills}. "
        "[Add one concrete example of a problem you solved.]\n\n"
        "What I'm proud of:\n"
        "[Describe a project you actually built or improved, what you did personally, and the result.]\n\n"
        "Please personalize these placeholders before using this draft."
    )


def ai_draft(job: dict, config: dict, resume_text: str = "", *,
             provider: str = "Template", model: str = "", api_key: str = "") -> str:
    """Draft application answers with the selected provider; never submit them."""
    if provider == "Template":
        return draft_template(job, config)
    from ai_providers import generate_application_draft
    return generate_application_draft(provider, job, config, resume_text,
                                      model=model, api_key=api_key)


def load_config(path: Path = ROOT / "config.yaml") -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def main() -> None:
    load_dotenv(ROOT / ".env")
    parser = argparse.ArgumentParser(description="JobPilot: discover & rank public job postings")
    parser.add_argument("command", choices=["scan", "export", "list"])
    parser.add_argument("--freshness", choices=["day", "week", "month", "all"])
    parser.add_argument("--output", default="", help="JSON output path for scan/export")
    parser.add_argument("--config", default=str(ROOT / "config.yaml"))
    parser.add_argument("--db", default=str(DB_DEFAULT))
    args = parser.parse_args()
    cfg, conn = load_config(Path(args.config)), connect_db(Path(args.db))
    if args.command == "scan":
        jobs, warnings = scan(cfg, args.freshness)
        persist_jobs(conn, jobs)
        print(f"Found {len(jobs)} matching jobs, sorted newest first. Warnings: {len(warnings)}")
        for w in warnings:
            print("WARNING:", w, file=sys.stderr)
    jobs = stored_jobs(conn)
    if args.output:
        path = Path(args.output)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(jobs, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Wrote {path}")
    else:
        for job in jobs[:30]:
            when = job["posted_at"][:10] or "date unknown"
            print(f"{when:12} | {job['score']:3} | {job['title'][:36]:36} | {job['company'][:20]:20} | {job['location'][:24]:24} | {job['url']}")
    conn.close()


if __name__ == "__main__":
    main()
