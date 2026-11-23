"""Public remote-job feeds. No authentication or browser scraping.

Himalayas: public API, cached for 24h.
Remotive: provider delays listings by ~24h, cached for 12h.
Remote OK: optional feed; always link back, never use source logos.
"""
from __future__ import annotations
import scout
from sources.cache import get_cached


def _india_restrictions(restrictions):
    """Empty Himalayas restrictions mean worldwide, per official API docs."""
    if not restrictions:
        return "Remote, India (Worldwide eligible)"
    for country in restrictions:
        if isinstance(country, dict):
            code = str(country.get("alpha2", "")).lower()
            name = str(country.get("name", "")).lower()
        else:
            code, name = str(country).lower(), str(country).lower()
        if code in {"in", "ind"} or name in {"india", "worldwide", "global"}:
            return "Remote, India"
    return None


def fetch_himalayas() -> list[scout.Job]:
    """Search for India-eligible roles, with careful location restrictions."""
    results = {}
    for keyword in ("devops", "platform engineer", "site reliability"):
        params = {"q": keyword, "country": "IN", "sort": "recent", "page": 1}
        data = get_cached("himalayas:" + keyword, 24 * 3600,
                          lambda p=params: scout.safe_get("https://himalayas.app/jobs/api/search", params=p))
        for item in data.get("jobs", []):
            location = _india_restrictions(item.get("locationRestrictions", []))
            link = item.get("applicationLink", "")
            if not location or not scout.canonical_url(link):
                continue
            title = item.get("title", "")
            if not title:
                continue
            company = item.get("companyName", "Unknown company")
            key = str(item.get("guid") or link)
            description = scout.clean_html(item.get("description", "") or item.get("excerpt", ""))
            date = scout.parse_date(item.get("pubDate"))
            results[key] = scout.Job(scout.uid("himalayas", company, key, link), company, title,
                     location, "Himalayas", scout.canonical_url(link), link, description,
                     date, "first_published" if date else "unknown", "Remote")
    return list(results.values())


def fetch_remotive() -> list[scout.Job]:
    """Return India/worldwide-eligible jobs, linking to Remotive for attribution."""
    data = get_cached("remotive:remote-jobs", 12 * 3600,
                      lambda: scout.safe_get("https://remotive.com/api/remote-jobs", params={"limit": 250}))
    jobs = []
    for item in data.get("jobs", []):
        required = (item.get("candidate_required_location") or "").lower()
        if "india" in required or "worldwide" in required or "anywhere" in required:
            location = "Remote, India"
        else:
            continue  # Do not infer India permission for US/Europe or unspecified remote.
        link = item.get("url", "")
        if not scout.canonical_url(link) or not item.get("title"):
            continue
        date = scout.parse_date(item.get("publication_date"))
        company = item.get("company_name", "Unknown company")
        jobs.append(scout.Job(scout.uid("remotive", company, str(item.get("id", "")), link),
            company, item["title"], location, "Remotive", scout.canonical_url(link), link,
            scout.clean_html(item.get("description", "")), date,
            "first_published" if date else "unknown", "Remote"))
    return jobs


def fetch_remoteok() -> list[scout.Job]:
    """Opt-in Remote OK feed; require an explicit India or worldwide location."""
    data = get_cached("remoteok:jobs", 12 * 3600,
                      lambda: scout.safe_get("https://remoteok.com/api"))
    jobs = []
    for item in data if isinstance(data, list) else []:
        if not isinstance(item, dict) or not item.get("position"):
            continue  # First record is usually feed metadata.
        location_raw = str(item.get("location") or "").lower()
        if not any(k in location_raw for k in ("india", "worldwide", "anywhere", "global")):
            continue
        link = item.get("url", "")
        if not scout.canonical_url(link):
            continue
        date = scout.parse_date(item.get("date") or item.get("epoch"))
        company = item.get("company", "Unknown company")
        jobs.append(scout.Job(scout.uid("remoteok", company, str(item.get("id", "")), link),
            company, item["position"], "Remote, India", "Remote OK",
            scout.canonical_url(link), link, scout.clean_html(item.get("description", "")),
            date, "first_published" if date else "unknown", "Remote"))
    return jobs
