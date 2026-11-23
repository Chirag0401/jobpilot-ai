import json
from datetime import datetime, timezone

from scout import (Job, ats_board_from_url, canonical_url, connect_db, fetch_ashby,
                   fetch_greenhouse, fetch_lever, newest_first, parse_date,
                   persist_jobs, score_job, set_status, stored_jobs)

PREFS = {
    "preferred_cities": ["mumbai"],
    "acceptable_india_cities": ["pune", "hyderabad"],
    "include_other_india_cities": True,
    "include_unverified_remote": False,
    "technology_terms": ["aws", "terraform", "kubernetes"],
    "exclude_seniority_terms": ["principal", "staff"],
    "min_score": 40
}


def example(uid="1", location="Remote, India", date="2026-11-22T01:00:00+00:00"):
    return Job(uid, "Company", "DevOps Engineer", location, "Lever", "https://jobs.lever.co/a/1",
               "https://jobs.lever.co/a/1/apply", "AWS Kubernetes Terraform", date, "created")


def test_created_at_milliseconds():
    assert parse_date(1763802000000) == datetime.fromtimestamp(1763802000, timezone.utc).isoformat(timespec="seconds")


def test_provider_url_resolution():
    assert ats_board_from_url("https://jobs.ashbyhq.com/Linkup/123") == ("ashby", "Linkup")
    assert ats_board_from_url("https://job-boards.greenhouse.io/sonicwall/jobs/23") == ("greenhouse", "sonicwall")
    assert ats_board_from_url("https://jobs.lever.co/mactores/uuid/apply") == ("lever", "mactores")
    assert ats_board_from_url("https://www.google.com/search?q=foo") is None
    assert canonical_url("https://jobs.lever.co/mactores/123/apply?src=x") == "https://jobs.lever.co/mactores/123"


def test_location_is_not_guessed():
    assert score_job(example(location="Remote - United States"), PREFS) is None
    assert score_job(example(location="Remote, India"), PREFS).location_status == "Remote India"
    assert score_job(example(location="Mumbai"), PREFS).location_status == "Mumbai area"
    assert score_job(example(location="Remote"), PREFS) is None


def test_sorted_by_date_unknown_last():
    jobs = [example(uid="1", date=""), example(uid="2", date="2026-11-20T00:00:00+00:00"),
            example(uid="3", date="2026-11-23T00:00:00+00:00")]
    assert [j.uid for j in newest_first(jobs)] == ["3", "2", "1"]


def test_persists_status_between_scans(tmp_path):
    conn = connect_db(tmp_path / "test.sqlite3")
    persist_jobs(conn, [example()])
    set_status(conn, "1", "applied")
    persist_jobs(conn, [example()])
    assert stored_jobs(conn)[0]["status"] == "applied"
    conn.close()


def test_ashby_feed(monkeypatch):
    monkeypatch.setattr("scout.safe_get", lambda *a, **k: {"jobs": [{
        "title": "DevOps Engineer", "jobUrl": "https://jobs.ashbyhq.com/Linkup/abc",
        "applyUrl": "https://jobs.ashbyhq.com/Linkup/abc/application",
        "location": "India", "publishedAt": "2026-11-22T12:00:00Z", "descriptionPlain": "AWS"
    }]})
    assert fetch_ashby("Linkup")[0].date_kind == "last_published"


def test_greenhouse_board(monkeypatch):
    def fake(url, **kwargs):
        if url.endswith("/jobs"):
            return {"jobs": [{"id": 12, "title": "Platform Engineer", "absolute_url": "https://job-boards.greenhouse.io/acme/jobs/12", "location": {"name": "India"}, "updated_at": "2026-11-22T00:00:00Z"}]}
        return {"first_published": "2026-11-20T00:00:00Z"}
    monkeypatch.setattr("scout.safe_get", fake)
    monkeypatch.setattr("scout.time.sleep", lambda _: None)
    assert fetch_greenhouse("acme")[0].date_kind == "first_published"


def test_lever_feed(monkeypatch):
    monkeypatch.setattr("scout.safe_get", lambda *a, **k: [{
        "id": "x", "text": "SRE", "hostedUrl": "https://jobs.lever.co/company/x",
        "categories": {"location": "Mumbai, India"}, "createdAt": 1763802000000
    }])
    j = fetch_lever("company")[0]
    assert j.date_kind == "created" and j.location == "Mumbai, India"
