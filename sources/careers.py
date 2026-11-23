"""Public employer career-page connectors and JobPosting JSON-LD reader.

Reads only explicitly configured public HTTPS pages; no broad crawling, logins,
CAPTCHA bypass, or submission. Not suitable for an untrusted hosted URL service
without network-layer SSRF restrictions.
"""
from __future__ import annotations
import ipaddress
import json
import re
from urllib.parse import urlparse
from bs4 import BeautifulSoup
import requests
import scout


def resolve_board(url: str):
    """Identify a supported ATS board slug from its public careers URL."""
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        return None
    parts = [p for p in parsed.path.split("/") if p]
    host = parsed.hostname.lower()
    if not parts:
        return None
    original = scout.ats_board_from_url(url)
    if original:
        return original
    if host in {"careers.smartrecruiters.com", "jobs.smartrecruiters.com"}:
        return "smartrecruiters", parts[0]
    if host in {"apply.workable.com", "jobs.workable.com"}:
        return "workable", parts[0]
    return None


def fetch_smartrecruiters(board: str) -> list[scout.Job]:
    """Documented public company posting feed; paginate up to 300 jobs."""
    jobs = []
    for offset in range(0, 300, 100):
        data = scout.safe_get(
            f"https://api.smartrecruiters.com/v1/companies/{board}/postings",
            params={"limit": 100, "offset": offset})
        content = data.get("content", [])
        for item in content:
            title = item.get("name", "")
            ident = item.get("id") or item.get("uuid")
            company = (item.get("company") or {}).get("name") or board
            link = f"https://jobs.smartrecruiters.com/{board}/{ident}"
            if not title or not ident:
                continue
            address = item.get("location") or {}
            country = address.get("country") or ""
            if country.lower() == "in":
                country = "India"
            loc = ", ".join(str(x) for x in (address.get("city"), country) if x)
            date = scout.parse_date(item.get("releasedDate"))
            jobs.append(scout.Job(scout.uid("smartrecruiters", board, str(ident), link),
                company, title, loc, "SmartRecruiters", link, link, "",
                date, "first_published" if date else "unknown",
                "Remote" if address.get("remote") else ""))
        if len(content) < 100:
            break
    return jobs


def fetch_workable(board: str) -> list[scout.Job]:
    """Documented public Workable account jobs endpoint."""
    data = scout.safe_get(f"https://www.workable.com/api/accounts/{board}",
                          params={"details": "true"})
    jobs = []
    for item in data.get("jobs", []):
        title = item.get("title", "")
        link = item.get("shortlink") or item.get("url") or item.get("application_url") or ""
        if not title or not scout.canonical_url(link):
            continue
        country = item.get("country", "")
        if str(country).lower() == "in":
            country = "India"
        location = ", ".join(str(x) for x in (item.get("city"), country) if x)
        date = scout.parse_date(item.get("published_on"))
        if not date:
            date = scout.parse_date(item.get("created_at"))
        kind = "first_published" if item.get("published_on") else "created"
        jobs.append(scout.Job(scout.uid("workable", board, str(item.get("shortcode", "")), link),
            data.get("name", board), title, location, "Workable", scout.canonical_url(link),
            item.get("url") or link, scout.clean_html(item.get("description", "")),
            date, kind if date else "unknown", item.get("workplace_type", "")))
    return jobs


def _public_https(url: str) -> bool:
    """Basic URL check for user-curated LOCAL config; not a complete SSRF defense."""
    p = urlparse(url)
    if p.scheme != "https" or p.username or p.password:
        return False
    try:
        if p.port not in (None, 443):
            return False
    except ValueError:
        return False
    host = p.hostname or ""
    if host in {"localhost", "localhost.localdomain"} or not host or "." not in host:
        return False
    if host.endswith((".local", ".internal", ".localhost", ".test", ".invalid")):
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        return bool(re.fullmatch(r"[a-zA-Z0-9.-]{3,253}", host))


def _structured_jobs(html: str, page_url: str) -> list[scout.Job]:
    soup = BeautifulSoup(html, "html.parser")
    postings = []
    def traverse(obj):
        if isinstance(obj, list):
            for entry in obj:
                yield from traverse(entry)
        elif isinstance(obj, dict):
            type_ = obj.get("@type", "")
            if type_ == "JobPosting" or (isinstance(type_, list) and "JobPosting" in type_):
                yield obj
            for key in ("@graph", "mainEntity", "itemListElement"):
                if key in obj:
                    yield from traverse(obj[key])
    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(tag.string or tag.get_text())
        except (ValueError, TypeError):
            continue
        for item in traverse(data):
            title = item.get("title", "")
            link = item.get("url") or page_url
            if not title or not scout.canonical_url(link):
                continue
            employer = item.get("hiringOrganization") or {}
            company = employer.get("name", "Unknown employer") if isinstance(employer, dict) else str(employer)
            is_remote = str(item.get("jobLocationType", "")).upper() == "TELECOMMUTE"
            requirements = item.get("applicantLocationRequirements") or []
            requirements = requirements if isinstance(requirements, list) else [requirements]
            countries = []
            for entry in requirements:
                if isinstance(entry, dict):
                    address = entry.get("address", {})
                    countries.append(str(entry.get("name") or
                        (address.get("addressCountry") if isinstance(address, dict) else "") or ""))
                else:
                    countries.append(str(entry))
            places = item.get("jobLocation") or []
            places = places if isinstance(places, list) else [places]
            city_country = []
            for place in places:
                if not isinstance(place, dict):
                    continue
                a = place.get("address") or {}
                if isinstance(a, dict):
                    country = a.get("addressCountry", "")
                    if isinstance(country, dict):
                        country = country.get("name", "")
                    city_country += [str(x) for x in (a.get("addressLocality"),
                                     "India" if str(country).upper() == "IN" else country) if x]
            if is_remote:
                india = any(c.lower() in {"india", "in"} for c in countries)
                location = "Remote, India" if india else "Remote (eligibility unverified)"
            else:
                location = ", ".join(city_country) or "Location not verified"
            date = scout.parse_date(item.get("datePosted"))
            postings.append(scout.Job(scout.uid("company_page", company, str(item.get("identifier", "")), link),
                company, title, location, "Company page", scout.canonical_url(link), link,
                scout.clean_html(item.get("description", "")), date,
                "first_published" if date else "unknown", "Remote" if is_remote else ""))
    return postings


def fetch_structured_page(url: str) -> list[scout.Job]:
    if not _public_https(url):
        raise ValueError("Career-page URL must be a public HTTPS hostname (no IP/private/local host)")
    response = scout.SESSION.get(url, timeout=15, allow_redirects=False,
                                 headers={"Accept": "text/html"})
    response.raise_for_status()
    if 300 <= response.status_code < 400:
        raise ValueError("Career-page redirects are not followed; add the final public URL")
    if "html" not in response.headers.get("Content-Type", "").lower():
        raise ValueError("Career page did not return HTML")
    if len(response.content) > 2_000_000:
        raise ValueError("Career page exceeds 2 MB")
    return _structured_jobs(response.text, url)
