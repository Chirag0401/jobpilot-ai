# 🚀 JobPilot AI

### Find great jobs. See the newest first. Apply with confidence.

![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-2ea44f)
![AI](https://img.shields.io/badge/AI-OpenAI%20%7C%20Claude%20%7C%20Gemini-7c3aed)
![Local first](https://img.shields.io/badge/Privacy-Local--first-1d4ed8)

**JobPilot AI** is a beginner-friendly, open-source job hunter for DevOps, SRE, Cloud and Platform Engineering roles. It discovers roles on company career pages, sorts by the newest available dates, highlights the best matches, and helps you prepare applications. **You always approve and submit each application yourself.**

> No API key? No problem. The Standard edition searches public job boards and creates editable application templates. Multi-AI is optional.

## 🌐 Try the web beta — no installation needed

**[🚀 Open JobPilot AI Web](https://jobpilot-ai-web.vercel.app/)**

The new **Next.js web beta** lets anyone browse public DevOps/SRE/Platform job listings, filter by source and location, sort newest first, and use the optional **OpenAI / Claude / Gemini model picker** with their own API key. AI keys are used only for the selected request and are not saved in the app's database.

**Currently available:** public job discovery, role details, direct links to employer applications, and reviewable AI answer drafts. **Not enabled yet:** personal accounts and saved jobs (require Supabase configuration), automated job submissions, and alerts. Always verify location eligibility and posting status with the employer. The original Python/Streamlit edition below is still available and has more source connector options.

The web application's source code is in [`web/`](web/README.md). To enable GitHub auto-deployments and Supabase sign-in/saved jobs, follow the [hosted setup guide](web/docs/DEPLOYMENT_SETUP.md). These integrations require you to authorize the GitHub App and create/connect your own Supabase project; code changes alone do not enable them.

## 🧩 How it works

```mermaid
flowchart LR
    A[Company job boards] --> B[Discover & deduplicate]
    B --> C[Sort by date & match score]
    C --> D[Review in dashboard]
    D --> E{Writing mode}
    E -->|Template| F[Editable draft]
    E -->|OpenAI / Claude / Gemini| F
    F --> G[You review and submit]
```

## ✨ Features

| Feature | Standard | Multi-AI |
|---|:---:|:---:|
| Search Ashby, Greenhouse, Lever, SmartRecruiters & Workable boards | ✅ | ✅ |
| Public remote feeds (Himalayas, Remotive; Remote OK opt-in) | ✅ | ✅ |
| Company career-page watchlist | ✅ | ✅ |
| Optional Google X-Ray discovery via Serper | ✅ | ✅ |
| Newest-first with clearly labeled dates | ✅ | ✅ |
| Rank jobs by skills, title and location | ✅ | ✅ |
| Save, skip and track applications locally | ✅ | ✅ |
| Editable application answer templates | ✅ | ✅ |
| Generate tailored text using OpenAI | — | ✅ |
| Generate tailored text using Claude | — | ✅ |
| Generate tailored text using Gemini | — | ✅ |
| Choose provider, model and API key in sidebar | — | ✅ |
| Optional visible-browser autofill | ✅ | ✅ |
| Manual review before final application | ✅ | ✅ |

## 📦 Get JobPilot AI

**Option A: Download (easiest)**

1. On GitHub, click the green **Code** button → **Download ZIP**.
2. Extract the ZIP and open the `jobpilot-ai` folder.
3. Open Terminal (Mac/Linux) or Command Prompt (Windows) in that folder.
4. Follow the launch steps below.

**Option B: Clone using Git**

```bash
git clone https://github.com/Chirag0401/jobpilot-ai.git
cd jobpilot-ai
```

## ▶️ Run in two steps

Install **Python 3.10+** first. Then choose **one** edition:

| Edition | macOS / Linux | Windows |
|---|---|---|
| **Standard** (no AI key needed) | `./start.sh` | `start.bat` |
| **Multi-AI** (choose a model provider) | `./start-multi-ai.sh` | `start-multi-ai.bat` |

On Mac/Linux, if you see a permission error, run:

```bash
chmod +x start.sh start-multi-ai.sh
```

The launch script creates a virtual environment, installs required Python packages, creates `.env` if missing, and starts the Streamlit dashboard. Open the address shown in Terminal (usually **http://localhost:8501**).

**Already using the previous version?** Back up your `.env`, `config.yaml`, and `jobpilot.sqlite3` before replacing the folder, then restore your settings. The database schema is unchanged.

## 🌍 Share or contribute

You are viewing the official **[JobPilot AI repository](https://github.com/Chirag0401/jobpilot-ai)**. Share this link, choose **Code → Download ZIP**, or clone using the command above.

To publish your own customized copy, click GitHub's **Fork** button. To suggest improvements, read [CONTRIBUTING.md](CONTRIBUTING.md) and open a pull request.

## 🧠 Using Multi-AI: OpenAI, Claude, or Gemini

1. Start using **`./start-multi-ai.sh`** (or the Windows `.bat` launcher).
2. In the **left sidebar**, choose **Template**, **OpenAI**, **Claude**, or **Gemini**.
3. If using AI, paste an API key into the password field, **or** save it once in `.env`.
4. Choose or edit the model name (defaults provided).
5. Select a job → **Application desk** → **Generate tailored draft**.
6. **Review and edit** the result before sending it anywhere.

You only need an API key from **the provider you choose**. No AI key is needed for job search or tracking.

```dotenv
# Copy .env.example to .env and fill in ONLY what you need:
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=
SERPER_API_KEY=
```

### 🔑 Where do I get the API keys?

**You do not need all four keys.** Choose one AI provider if you want AI-generated drafts; Serper is optional for finding more jobs. Free **Template** mode and the configured company job feeds work without any keys.

| Key | What does it do? | Get it in one step |
|---|---|---|
| `OPENAI_API_KEY` | Generates application answers using OpenAI models. | [OpenAI API keys](https://platform.openai.com/api-keys) → sign in → **Create new secret key** |
| `ANTHROPIC_API_KEY` | Generates application answers using Claude models. | [Claude Platform](https://platform.claude.com/settings/keys) → sign in → **Create key** |
| `GEMINI_API_KEY` | Generates application answers using Google's Gemini models. | [Google AI Studio](https://aistudio.google.com/apikey) → sign in → **Create API key** |
| `SERPER_API_KEY` | Lets JobPilot search Google via Serper to discover **more job boards**. **Not an AI model key.** | [Serper](https://serper.dev/) → **Sign up** → copy your API key from the dashboard |

**How to use a key:** Copy `.env.example` to a new file named `.env`, paste your selected key after `=`, save, and restart the app. For AI keys, you can alternatively paste the key in the password field in the Multi-AI sidebar; Serper uses the `.env` entry. Never share your key or commit `.env` to GitHub.

**What is Serper?** A third-party Google Search API. Here, it runs the Google X-Ray queries from `config.yaml`, discovers company careers pages, and lets JobPilot fetch supported Ashby/Greenhouse/Lever boards. It is **optional**, and Google search freshness is **not** the same as the job's publication date.

**Costs:** Provider API usage/billing is separate from ChatGPT Plus, Claude Pro and Gemini app subscriptions. Serper has its own quota/pricing. Check the provider dashboard before enabling paid usage. Models can change; choose a model ID currently available to your account.

## 🌍 Additional job sources and company career pages

JobPilot now supports **Ashby, Greenhouse, Lever, SmartRecruiters, Workable**, plus public **Himalayas** and **Remotive** remote feeds. **Remote OK** is available as an opt-in source. Every job displays its source and links to the original listing.

**No API key is required** for these public feeds. Serper remains optional for discovering additional employer job boards with Google X-Ray searches.

Edit `config.yaml` to control the new sources:

```yaml
remote_sources:
  himalayas: true
  remotive: true
  remoteok: false

company_career_urls:
  - "https://careers.smartrecruiters.com/SmartRecruiters"
  - "https://apply.workable.com/YOUR-COMPANY"
  - "https://jobs.ashbyhq.com/YOUR-COMPANY"
```

For **other career-page URLs**, JobPilot reads publicly available [JobPosting JSON-LD](https://developers.google.com/search/docs/appearance/structured-data/job-posting) on that **exact page only**. It does not bypass logins, guess private job-board URLs, or crawl an entire site. If a page lacks structured jobs, the dashboard shows a warning.

**Eligibility and dates:** Himalayas country restrictions are checked before treating a remote job as India-eligible. Remotive listings may be delayed by about 24 hours, so they are not instant alerts. Public remote feeds are cached locally to reduce request volume. A generic "remote" label is **not** treated as permission to work from India.

**Attribution and terms:** Preserve the source label and original job link for [Himalayas](https://himalayas.app/docs/remote-jobs-api), [Remotive](https://remotive.com/remote-jobs/api), and (if enabled) [Remote OK](https://remoteok.com/faq). Do not republish Remotive jobs to third-party aggregators. Check provider terms before publishing a hosted job board. The standalone app remains local-first.

**Not included yet:** LinkedIn, Indeed, Instahyre, Cutshort, Wellfound, Naukri and foundit integrations. Those are later phases using permitted discovery methods, not unauthorized scraping.

## 🔎 Search for jobs

1. Open the dashboard.
2. Click **Scan now** in the sidebar.
3. Browse by fit score, posted/updated date and location.
4. Open the official job link to verify it is still open.
5. Save, skip, approve, or mark as applied **only after submitting yourself**.

**Without a Serper key:** searches the public company boards listed in `config.yaml`.

**With a Serper key:** uses configured Google X-Ray searches, including these examples:

```text
site:jobs.ashbyhq.com ("DevOps Engineer" OR "SRE" OR "Platform Engineer") ("India" OR "Remote")
site:job-boards.greenhouse.io ("DevOps" OR "Platform Engineer") "India"
site:jobs.lever.co ("DevOps Engineer" OR "SRE") ("Mumbai" OR "Remote")
("OpenShift" OR "OCP") ("DevOps" OR "Platform Engineer") "India" jobs
```

The match score is **a keyword relevance score**, not the probability of getting hired. Dates mean different things across job sites (original publish, last publish, or update); the dashboard labels them. Date-unknown jobs appear last.

## ⚙️ Make the results yours

Open **`config.yaml`** and edit these fields:

- `profile.verified_experience`: **your actual skills** (examples are placeholders; replace them).
- `preferences.preferred_cities`: e.g., Mumbai, Pune, Bengaluru.
- `preferences.technology_terms`: e.g., AWS, Kubernetes, OpenShift, Terraform.
- `preferences.max_age_days`: e.g., `7` for recent dated jobs.
- `boards`: add company boards you like.

Never put your email, resume, or API keys in `config.yaml` if you plan to share it publicly.

## 📖 Read the codebase

New to the project? Follow the [beginner-friendly codebase walkthrough](docs/CODEBASE_WALKTHROUGH.md): it explains the file structure, request flow, job matching, API calls, SQLite, the browser helper, and how to run tests.

## 📁 Project structure

```text
jobpilot-ai/
├── dashboard.py                 # Easy-to-use web dashboard
├── scout.py                     # Discover, score and track jobs
├── sources/                     # ATS, remote feeds and career-page adapters
├── ai_providers.py              # OpenAI / Claude / Gemini API calls
├── autofill.py                  # OPTIONAL browser helper (no submission)
├── config.yaml                  # Customizable search and skill preferences
├── .env.example                 # API key placeholders (no actual secrets)
├── start.sh / start.bat          # Standard edition launchers
├── start-multi-ai.sh / .bat      # Multi-AI edition launchers
├── publish-to-github.sh         # Optional standalone publishing helper
├── requirements.txt             # Common dependencies
├── requirements-browser.txt     # Optional Playwright dependency
├── requirements-dev.txt         # Test dependencies
├── tests/                       # Offline automated tests
└── .github/workflows/           # Tests and optional daily scans
```

## 🕗 Daily scans (optional)

The GitHub Actions workflow (`.github/workflows/daily-scan.yml`) runs approximately **8:00 AM India time**, or on demand. It uploads JSON scan results as an Actions artifact. It does not send notifications, save to your laptop database, or submit applications. You can configure `SERPER_API_KEY` as a **repository secret**.

## 🖱️ Optional assisted browser filling

```bash
pip install -r requirements-browser.txt
playwright install chromium
cp profile_private.example.json profile_private.json
# Edit the PRIVATE profile file with real values and an absolute resume path.
python autofill.py --url 'https://jobs.lever.co/company/job-id/apply'
```

This assists with common fields on supported job boards, but it does **not** bypass CAPTCHA or click Submit. Different employers use different forms; verify everything before applying.

## 🧪 Tests

```bash
pip install -r requirements-dev.txt
pytest -q
```

Tests use mocked API responses and do not need provider keys or live vacancies.

## 🔐 Privacy, limitations and ethics

JobPilot is **local-first**. The job tracker uses a local SQLite file. The scanner only reads public job information. AI draft generation sends job content and your optional resume text **to the provider you select**, so do not include confidential employer/client information. Keys entered in the Streamlit sidebar are session-only; `.env` is Git-ignored.

This is **not an unattended application bot**. Form submission, CAPTCHA handling, complex custom questions and tracking job board changes all require careful per-site handling. Do not infer that opening a link means you've applied.

**Do not publish this app to the open web without adding authentication, secret management, and hosted persistent storage.** A public Streamlit dashboard with application data is not a safe multi-user deployment.

## 🧭 Roadmap

- [x] Public ATS search, Google X-Ray, newest-first matching
- [x] Application tracker and review-first drafts
- [x] OpenAI, Claude and Gemini support
- [ ] Persistent user accounts and cloud database
- [ ] Alerts for newly discovered jobs
- [ ] PDF/DOCX resume parsing with consent
- [ ] Employer-specific, user-approved submission adapters
- [ ] Hosted multi-user web app and exportable application history

## 🤝 Contribute

Ideas and PRs are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). This project is licensed under the [MIT License](LICENSE).

---

*Built for job seekers. Keep the human in control.*
