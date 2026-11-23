"""Local, visible, best-effort autofill. NEVER clicks the final submit button.

This is for public Ashby / Lever / Greenhouse hosted forms only. User reviews all
fields and manually handles any extra questions, uploads, consent, and CAPTCHA.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

ALLOWED_HOSTS = {"jobs.ashbyhq.com", "job-boards.greenhouse.io", "boards.greenhouse.io",
                 "jobs.lever.co", "jobs.eu.lever.co"}
ROOT = Path(__file__).resolve().parent


def best_effort_fill(page, keys: list[str], value: str) -> bool:
    if not value:
        return False
    for key in keys:
        selectors = [f'input[name="{key}"]', f'input[id="{key}"]',
                     f'input[autocomplete="{key}"]', f'input[placeholder*="{key}" i]']
        for sel in selectors:
            try:
                field = page.locator(sel).first
                if field.count() and field.is_visible() and field.is_enabled():
                    field.fill(value, timeout=1000)
                    return True
            except Exception:
                pass
        try:
            field = page.get_by_label(key, exact=False).first
            if field.count() and field.is_visible() and field.is_enabled():
                field.fill(value, timeout=1000)
                return True
        except Exception:
            pass
    return False


def main():
    parser = argparse.ArgumentParser(description="Browser application autofill (never submits)")
    parser.add_argument("--url", required=True, help="Official ATS application URL")
    parser.add_argument("--profile", default=str(ROOT / "profile_private.json"))
    args = parser.parse_args()
    parsed = urlparse(args.url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS:
        raise SystemExit("Unsupported host. Only verified HTTPS ATS domains are accepted.")
    profile_path = Path(args.profile)
    if not profile_path.is_file():
        raise SystemExit("Create profile_private.json from profile_private.example.json first.")
    data = json.loads(profile_path.read_text(encoding="utf-8"))
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()
        page.goto(args.url, wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(1500)
        # Open embedded Apply form if supported; never click any submit control.
        if not page.locator('input[type="email"]').count():
            for label in ["Apply for this job", "Apply for this Job", "Apply Now"]:
                try:
                    matches = page.get_by_role("link", name=label, exact=False)
                    if matches.count():
                        matches.first.click(timeout=1500)
                        page.wait_for_timeout(1000)
                        break
                except Exception:
                    pass
        if urlparse(page.url).hostname not in ALLOWED_HOSTS:
            print("Application redirected to a third-party host. Review and fill manually.")
        else:
            name = data.get("name", "").strip()
            parts = name.split(maxsplit=1)
            fields = {
                "full name": (["name", "full_name", "Full Name", "Full name"], name),
                "first name": (["first_name", "firstName", "First Name"], parts[0] if parts else ""),
                "last name": (["last_name", "lastName", "Last Name"], parts[1] if len(parts) > 1 else ""),
                "email": (["email", "Email", "Email Address"], data.get("email", "")),
                "phone": (["phone", "Phone", "Phone Number", "phone_number"], data.get("phone", "")),
                "linkedin": (["linkedin", "LinkedIn", "LinkedIn Profile"], data.get("linkedin", "")),
                "github": (["github", "GitHub"], data.get("github", "")),
                "website": (["website", "Website", "Portfolio"], data.get("website", "")),
            }
            for label, (selectors, value) in fields.items():
                if best_effort_fill(page, selectors, value):
                    print(f"Filled: {label}")
            resume = Path(data.get("resume_path", "")).expanduser()
            if data.get("resume_path") and resume.is_file():
                try:
                    inputs = page.locator('input[type="file"]')
                    if inputs.count():
                        inputs.first.set_input_files(str(resume))
                        print("Attached resume; check the field manually.")
                except Exception as exc:
                    print("Resume upload not supported on this form:", exc)
        print("\nReview EVERY field, custom question and consent on the visible page.")
        print("You must click the employer's final SUBMIT button yourself; this helper never does.")
        input("Press Enter to close the browser when finished...")
        browser.close()

if __name__ == "__main__":
    main()
