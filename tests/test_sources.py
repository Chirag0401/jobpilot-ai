"""Offline integration tests for job source adapters and safety behavior."""
import scout
from sources import careers, remote


def test_career_ats_resolution():
    assert careers.resolve_board("https://careers.smartrecruiters.com/SmartRecruiters") == ("smartrecruiters", "SmartRecruiters")
    assert careers.resolve_board("https://apply.workable.com/acme/jobs/1") == ("workable", "acme")
    assert careers.resolve_board("https://jobs.ashbyhq.com/example") == ("ashby", "example")
    assert careers.resolve_board("https://google.com/jobs") is None


def test_smartrecruiters_public_feed(monkeypatch):
    def fake(url, **kwargs):
        assert url == "https://api.smartrecruiters.com/v1/companies/Acme/postings"
        return {"content": [{"id": "123", "name": "DevOps Engineer",
                 "company": {"name": "Acme Inc"},
                 "location": {"country": "in", "city": "Mumbai", "remote": True},
                 "releasedDate": "2026-11-20T10:00:00Z"}]}
    monkeypatch.setattr(scout, "safe_get", fake)
    x = careers.fetch_smartrecruiters("Acme")[0]
    assert x.company == "Acme Inc" and x.date_kind == "first_published"
    assert x.platform == "SmartRecruiters" and x.location == "Mumbai, India"


def test_workable_public_feed(monkeypatch):
    monkeypatch.setattr(scout, "safe_get", lambda *args, **kwargs: {
        "name": "Acme", "jobs": [{"title": "Platform Engineer",
        "shortcode": "x123", "shortlink": "https://apply.workable.com/j/X123",
        "city": "Pune", "country": "India", "published_on": "2026-11-20",
        "workplace_type": "hybrid"}]})
    x = careers.fetch_workable("acme")[0]
    assert x.company == "Acme" and x.platform == "Workable"
    assert x.posted_at.startswith("2026-11-20")


def test_himalayas_restrictions(monkeypatch):
    monkeypatch.setattr(remote, "get_cached", lambda k, ttl, f: {"jobs": [
        {"guid": "a", "title": "SRE", "companyName": "Acme",
         "applicationLink": "https://himalayas.app/jobs/a", "locationRestrictions": [],
         "pubDate": "2026-11-20T00:00:00Z"},
        {"guid": "b", "title": "DevOps Engineer", "companyName": "Acme",
         "applicationLink": "https://himalayas.app/jobs/b",
         "locationRestrictions": [{"alpha2": "US", "name": "United States"}]},
        {"guid": "c", "title": "Platform Engineer", "companyName": "Acme",
         "applicationLink": "https://himalayas.app/jobs/c",
         "locationRestrictions": [{"alpha2": "IN", "name": "India"}]}]})
    jobs = remote.fetch_himalayas()
    assert len(jobs) == 2
    assert all("India" in j.location for j in jobs)
    assert all(j.platform == "Himalayas" for j in jobs)


def test_remotive_restrictions_and_attribution(monkeypatch):
    monkeypatch.setattr(remote, "get_cached", lambda k, ttl, f: {"jobs": [
        {"id": 11, "title": "DevOps Engineer", "company_name": "Acme",
         "candidate_required_location": "Worldwide", "url": "https://remotive.com/remote-jobs/a",
         "publication_date": "2026-11-20T00:00:00Z"},
        {"id": 12, "title": "SRE", "candidate_required_location": "USA",
         "url": "https://remotive.com/remote-jobs/b"}]})
    jobs = remote.fetch_remotive()
    assert len(jobs) == 1
    assert jobs[0].platform == "Remotive" and "remotive.com" in jobs[0].url


def test_remoteok_only_explicit_eligible(monkeypatch):
    monkeypatch.setattr(remote, "get_cached", lambda k, ttl, f: [
        {"legal": "notice"},
        {"id": "a", "position": "DevOps Engineer", "company": "Acme",
         "url": "https://remoteok.com/remote-jobs/a", "location": "Worldwide",
         "date": "2026-11-22T00:00:00Z"},
        {"id": "b", "position": "Platform Engineer", "location": "US",
         "url": "https://remoteok.com/remote-jobs/b"}])
    jobs = remote.fetch_remoteok()
    assert len(jobs) == 1 and jobs[0].platform == "Remote OK"


def test_career_page_jobposting_metadata_and_url_safety():
    assert careers._public_https("https://careers.acme.com/jobs/123")
    for url in ("http://example.com/jobs", "https://localhost/", "https://127.0.0.1/",
                "https://intranet.local/jobs", "https://user:password@example.com/jobs",
                "https://careers.example.com:invalid/jobs"):
        assert not careers._public_https(url)
    html = """<script type="application/ld+json">{
      "@context":"https://schema.org", "@type":"JobPosting",
      "title":"DevOps Engineer", "url":"https://careers.acme.com/jobs/123",
      "datePosted":"2026-11-22", "description":"AWS &amp; Terraform",
      "hiringOrganization":{"name":"Acme"}, "jobLocationType":"TELECOMMUTE",
      "applicantLocationRequirements":{"@type":"Country","name":"India"}}
    </script>"""
    job = careers._structured_jobs(html, "https://careers.acme.com/")[0]
    assert job.location == "Remote, India" and job.date_kind == "first_published"
    assert job.company == "Acme" and "AWS" in job.description


def test_unverified_remote_career_page_is_excluded():
    html = """<script type="application/ld+json">
    {"@type":"JobPosting", "title":"SRE", "jobLocationType":"TELECOMMUTE",
    "hiringOrganization":{"name":"Acme"}}</script>"""
    job = careers._structured_jobs(html, "https://acme.example/careers")[0]
    assert scout.score_job(job, {"min_score":0, "technology_terms":[],
               "preferred_cities":[], "include_unverified_remote":False}) is None


def test_preference_role_terms_and_remote_toggle():
    job = scout.Job("a", "Acme", "Developer Experience Engineer", "Remote, India",
                    "x", "https://example.com/1", "https://example.com/1", "",
                    "2026-11-22T00:00:00+00:00")
    prefs = {"min_score":0, "technology_terms":[], "preferred_cities":[],
             "role_terms":["developer experience"], "allow_remote_india":False}
    assert scout.score_job(job, prefs) is None
    prefs["allow_remote_india"] = True
    assert scout.score_job(job, prefs) is not None


def test_scan_includes_company_board_and_remote_sources(monkeypatch):
    cfg = {"boards": {}, "company_career_urls":["https://careers.smartrecruiters.com/Acme"],
           "remote_sources":{"himalayas":True}, "search":{"queries":[], "max_discovered_boards":4},
           "preferences":{"max_age_days":30, "min_score":0,
                          "technology_terms":[], "preferred_cities":["mumbai"]}}
    monkeypatch.setattr(scout, "discover_serper", lambda c, f: (set(), [], []))
    monkeypatch.setattr(careers, "fetch_smartrecruiters", lambda _: [
        scout.Job("1", "Acme", "DevOps Engineer", "Mumbai", "SmartRecruiters",
                  "https://jobs.smartrecruiters.com/acme/1",
                  "https://jobs.smartrecruiters.com/acme/1", "")])
    monkeypatch.setattr(remote, "fetch_himalayas", lambda: [])
    jobs, warnings = scout.scan(cfg)
    assert len(jobs) == 1 and jobs[0].platform == "SmartRecruiters"


def test_existing_application_status_survives_rescan(tmp_path):
    job = scout.Job("existing", "Acme", "SRE", "Remote, India", "Himalayas",
                    "https://himalayas.app/jobs/a", "https://himalayas.app/jobs/a", "")
    db = scout.connect_db(tmp_path / "test.sqlite3")
    scout.persist_jobs(db, [job])
    scout.set_status(db, "existing", "applied")
    scout.persist_jobs(db, [job])
    assert scout.stored_jobs(db)[0]["status"] == "applied"
