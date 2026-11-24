# JobPilot Web — Public Preview

Next.js 16 app on Vercel. The original Python/Streamlit app remains in the repository root.

## Development

```bash
cd web
npm install
npm run dev
# open http://localhost:3000
```

### What's available without credentials?
The **search-first** dashboard starts empty. The visitor enters any job title or role, chooses a location and sources, and clicks Search. There is **no automatic DevOps scan** or hard-coded default job list. Results replace the previous search; filters refine only those results. Serper is optional for indexed portal discovery, while supported public company career URLs can be searched directly without an API key. This is **not** a crawler or an automatic application sender. Providers can be unavailable and are handled as warnings.

### AI model picker (bring your own key)
Choose OpenAI, Claude, or Gemini, paste an API key **temporarily**, then click **Load available models**. The server asks the selected provider which models your API key can access. Generate two editable application answers for a selected job. Keys live in the client component's memory and are sent directly to the fixed provider's API through a same-origin backend route; we do not persist them, and API billing is separate from consumer chat subscriptions. Do **not** enter a key into a shared or untrusted deployment.

### Universal job discovery: Serper and company career pages

The web dashboard has a **Search for your next role** panel before any job results. Enter any role, choose a location and then use either Serper or direct careers lookup. It supports two separate discovery paths:

1. **Portal discovery via Serper:** Paste your own `SERPER_API_KEY` into the masked key field, choose any of 14 indexed sources, optionally edit the job title and region, then choose **Search-index recency** and **Standard** (up to 10 per source) or **Deeper** (up to 20 per source, subject to enough first-page hits), and click **Search selected portals**. Sources: LinkedIn, Indeed, Naukri, Wellfound, Cutshort, Instahyre, foundit, Monster, Workday career pages, Greenhouse, Lever, Ashby, SmartRecruiters and Workable. These are *Google-indexed search results*, **not** licensed or authenticated APIs from those portals. We do **not** sign into, scrape or automate those portals. Each indexed result links to its original source and deliberately has an *unverified* posting date and work location. Results depend on Google's indexing and cannot guarantee coverage or freshness.
2. **Direct public company boards (no key needed):** Paste up to six separate URLs from **Ashby, Greenhouse, Lever, SmartRecruiters, Workable or Workday** into the company career URLs field, then click **Scan supported boards (free)**. The Workday adapter reads only an employer's publicly accessible career-site JSON feed, which is unofficial and can change or restrict access. Unsupported company websites can instead be searched by Serper: paste their `https://careers.company.com` link into the same URL field, and run Serper discovery.

**Getting keys:** [Serper](https://serper.dev/) → create an account → copy your API key from the dashboard. Serper is a Google Search API, not a generative-AI model. It is optional and used only when you click Search. One query is issued for a selected portal; with Deeper, a second is only attempted if the previous page contained 10 hits (maximum 16 domains, plus at most a couple of compatibility retries), subject to your Serper credits and pricing. Direct public company-board search works without Serper. Indexed results may be scarce despite many queries because Google returns fewer organic matches for narrow site/role/location filters. The UI reports inspected and matched counts instead of implying completeness.

**AI model keys are separate:** Open the **AI application studio** tab, choose OpenAI, Claude or Gemini, paste that provider's key, then click **Load available models**. Use the returned dropdown or supply a model ID manually; a premium ChatGPT/Claude/Gemini consumer subscription does not automatically include provider API credits. [OpenAI](https://platform.openai.com/api-keys) · [Claude](https://platform.claude.com/settings/keys) · [Gemini](https://aistudio.google.com/apikey).

**Privacy and limits:** The user's Serper and AI keys live in the current page's memory, are sent in request bodies to JobPilot's same-origin server, and forwarded to the relevant provider. They are not saved to Supabase, browser storage or GitHub. They may appear at the providers and at runtime network infrastructure; don't enter keys into untrusted deployments. This beta needs server-side abuse protection and rate limiting for large public usage. Career URL entries are not a persistent saved watchlist yet. Search results must be checked on the employer's site before applying.

### Hosted setup: GitHub auto-deployments + Supabase accounts
Follow the [complete hosted setup guide](docs/DEPLOYMENT_SETUP.md) to authorize Vercel's GitHub app for this repository, connect the existing Vercel project, create the private Supabase saved-jobs database, and configure email authentication. The newer `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is supported, as well as the legacy anon key.


### Troubleshooting magic-link sign-in

If an email link opens `localhost:3000` after deploying, **do not edit or reuse the tokenized email link**. Open your project's [Supabase Auth URL Configuration](https://supabase.com/dashboard/project/bwfknsxztyywqsnyvjxf/auth/url-configuration):

- **Site URL:** `https://jobpilot-ai-web.vercel.app`
- **Allowed Redirect URLs:** `https://jobpilot-ai-web.vercel.app` (the exact URL, not localhost)
- Keep `http://localhost:3000/**` only as an additional redirect for local development if needed.

The production Vercel project must have `NEXT_PUBLIC_JOBPILOT_SITE_URL=https://jobpilot-ai-web.vercel.app` set before building. The app passes it through `emailRedirectTo`; Supabase only honors URLs permitted in Auth settings. After editing the dashboard, request a **new** magic link from the hosted site (not a local development tab). Expired or previously used links cannot be fixed by refreshing.

If links keep reporting `otp_expired` immediately even with correct redirects, an email security scanner or preview may have visited the one-time link. Consider email **OTP code** authentication instead (requires a different Supabase email template), and check Supabase Auth logs before changing providers.

### Email sending limits (public launch requirement)

When Supabase Auth reports `email rate limit exceeded`, its built-in SMTP sending quota has been exhausted **for the entire project**. JobPilot now shows a clear explanation and temporarily disables duplicate sign-in requests in the browser. This **does not raise or reset the Supabase quota**. Follow [Supabase custom SMTP instructions](https://supabase.com/docs/guides/auth/auth-smtp) to connect a dedicated transactional email provider (such as Resend, AWS SES, Brevo, or Postmark) under **Authentication → SMTP Settings**. Configure a verified sender/domain and check [Auth Rate Limits](https://supabase.com/docs/guides/auth/rate-limits), email delivery and abuse protections before inviting public users. Supabase's default email service is restricted to authorized organization emails and is intended for testing, not a public launch. Do not disable email confirmation to work around a sending limit.

### Optional account sign-in and saved jobs
Create a Supabase project, run `supabase/schema.sql` in its SQL editor, enable Email OTP/magic link, and add your deployment hostname to Auth allowed redirect URLs. Configure the environment variables from `.env.example` in Vercel and redeploy. Users will then be able to sign in and save jobs privately with row-level security policies.

**Without Supabase:** browsing and AI drafts work, while login and saved jobs are clearly marked unavailable. Do not store service-role credentials in `NEXT_PUBLIC_...` variables.

### Vercel deployment
Import `Chirag0401/jobpilot-ai` into Vercel, select the **web** root directory, framework Next.js, then deploy. Preview builds are recommended first. This app is a beta and has no job submission, recurring alerts, persistent shared cache, or unrestricted LinkedIn/Indeed scraping. Before opening it to heavy public traffic, add endpoint rate-limiting, abuse monitoring, and persistent shared caching.

### Search precision and limitations

Search is **opt-in** and **role-agnostic**. For indexed portals, JobPilot uses site-specific Google queries targeting job-detail paths, requests a conservative maximum of 10 results per page and optionally a second page, checks for role phrase relevance, rejects unrelated pages and deduplicates links. It sorts by role relevance (not job-seeker suitability); postings from Google have **unknown employer location and posting dates** unless verified on the original listing. Google recency limits search-index results, **not the date the employer opened the role**. A search with 14 portals can still return a small list; increasing the depth spends more Serper credits and might or might not increase unique relevant results.

Direct ATS reads no longer apply a DevOps-only filter; results are ranked against the role and location supplied by the visitor. Some feeds do not expose enough location details, so remote-work eligibility remains unverified and the user must open the employer's listing.

### Serper troubleshooting: HTTP 400 is **not** zero job matches

Older versions could send `num: 20`, an explicit `page: 1`, and a time filter to Serper, then return a misleading success message showing zero jobs when every source returned HTTP 400. JobPilot now starts with a conservative `num: 10` request and **omits `page` for the first page**. It validates the first query before sending more requests. On HTTP 400, it may retry without the optional time filter and then fall back to a domain-only site query; these compatibility retries can use provider credits, so they are limited. If the basic query still fails, the API returns an error instead of `200 OK` with an empty job list.

If you still see an error: check your key and available search credits at [Serper](https://serper.dev/), use **Any time** and **Standard** with one portal, and retry once. Don't repeatedly launch 14-source deeper searches while the provider is rejecting the first request. A normal, successful search with zero matches is displayed separately from a failed provider request. Live calls with a real user's key are not part of CI; the automated tests use mocked Serper responses.
