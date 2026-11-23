"""Ashby, Greenhouse and Lever public ATS feeds.

Maintains backward-compatible wrappers in scout.py.
"""
from __future__ import annotations
import re
import time
from urllib.parse import urlparse
import scout

def fetch_ashby(board: str) -> list[Job]:
    data = scout.safe_get(f"https://api.ashbyhq.com/posting-api/job-board/{board}")
    out = []
    for j in data.get("jobs", []):
        if j.get("isListed") is False:
            continue
        title, link = j.get("title", ""), j.get("jobUrl", "")
        if not title or not scout.canonical_url(link):
            continue
        parts = urlparse(link).path.strip("/").split("/")
        posting_id = parts[1] if len(parts) > 1 else link
        date = scout.parse_date(j.get("publishedAt"))
        secondary = [a.get("location", "") for a in j.get("secondaryLocations", []) if isinstance(a, dict)]
        loc = ", ".join([j.get("location", "")] + secondary).strip(", ")
        workplace = j.get("workplaceType", "")
        if not workplace and j.get("isRemote"):
            workplace = "Remote or hybrid (verify)"
        out.append(scout.Job(scout.uid("ashby", board, posting_id, link), board, title, loc,
                       "Ashby", scout.canonical_url(link), j.get("applyUrl", link),
                       j.get("descriptionPlain") or scout.clean_html(j.get("descriptionHtml", "")),
                       date, "last_published" if date else "unknown", workplace))
    return out


def fetch_greenhouse(board: str) -> list[Job]:
    data = scout.safe_get(f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs", params={"content": "true"})
    out = []
    for j in data.get("jobs", []):
        title, link = j.get("title", ""), j.get("absolute_url", "")
        if not title or not scout.canonical_url(link):
            continue
        date, kind = scout.parse_date(j.get("first_published")), "first_published"
        if not date:
            date, kind = scout.parse_date(j.get("updated_at")), "updated_only"
        loc = (j.get("location") or {}).get("name", "")
        out.append(scout.Job(scout.uid("greenhouse", board, str(j.get("id", "")), link), board, title,
                       loc, "Greenhouse", scout.canonical_url(link), link,
                       scout.clean_html(j.get("content", "")), date, kind if date else "unknown"))
    # Greenhouse individual job endpoint can provide first_published when its board list omits it.
    # Fetch ONLY plausible roles to limit API requests.
    for j in [x for x in out if scout.role_match(x.title)][:35]:
        if j.date_kind == "first_published":
            continue
        match = re.search(r"/jobs/(\d+)", urlparse(j.url).path)
        if not match:
            continue
        try:
            detail = scout.safe_get(f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{match.group(1)}")
            first = scout.parse_date(detail.get("first_published"))
            if first:
                j.posted_at, j.date_kind = first, "first_published"
            if not j.description:
                j.description = scout.clean_html(detail.get("content", ""))
            time.sleep(0.05)
        except (requests.RequestException, ValueError):
            pass
    return out


def fetch_lever(board: str) -> list[Job]:
    data = scout.safe_get(f"https://api.lever.co/v0/postings/{board}", params={"mode": "json"})
    out = []
    for j in data:
        title, link = j.get("text", ""), j.get("hostedUrl", "")
        if not title or not scout.canonical_url(link):
            continue
        cats = j.get("categories", {}) or {}
        description = scout.clean_html(j.get("description", ""))
        for section in j.get("lists", []) or []:
            description += " " + scout.clean_html(section.get("content", ""))
        description += " " + scout.clean_html(j.get("additional", ""))
        date = scout.parse_date(j.get("createdAt"))
        out.append(scout.Job(scout.uid("lever", board, j.get("id", ""), link), board, title,
                       cats.get("location", ""), "Lever", scout.canonical_url(link),
                       j.get("applyUrl", link), description,
                       date, "created" if date else "unknown", j.get("workplaceType", "")))
    return out


