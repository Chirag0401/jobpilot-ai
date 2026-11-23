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
A public, read-only dashboard that discovers roles from selected published Ashby, Greenhouse, Lever, Himalayas and Remotive feeds; filters by search, source and location; shows known posting dates; and links to the original application site. This is **not** a crawler or an automatic application sender. Providers can be unavailable and are handled as warnings.

### AI model picker (bring your own key)
Choose OpenAI, Claude, or Gemini, paste an API key **temporarily**, then click **Load available models**. The server asks the selected provider which models your API key can access. Generate two editable application answers for a selected job. Keys live in the client component's memory and are sent directly to the fixed provider's API through a same-origin backend route; we do not persist them, and API billing is separate from consumer chat subscriptions. Do **not** enter a key into a shared or untrusted deployment.

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
