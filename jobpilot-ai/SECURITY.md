# Security and privacy

- Never commit `.env`, actual resumes, `profile_private.json`, or SQLite databases. They are ignored by Git.
- Run the app locally unless you have added authentication and secure persistent storage.
- Keys pasted into the sidebar are held in memory for the Streamlit session, not saved into a file or database.
- Multi-AI sends the selected job description, configuration skills, and optional pasted/uploaded resume text to **one chosen provider**. Read the provider's data handling terms before using confidential material.
- Google X-Ray queries are sent to Serper.dev only if `SERPER_API_KEY` is configured.
- Every job posting is untrusted input. Review AI-generated claims and external links.
- The browser helper never submits and never bypasses CAPTCHA.
- Email and GitHub credentials should not be placed in code or config files.

To report a security problem, open a private security advisory on the GitHub repository after it is published. Do not publish secrets in public issues.
