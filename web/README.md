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

### Optional account sign-in and saved jobs
Create a Supabase project, run `supabase/schema.sql` in its SQL editor, enable Email OTP/magic link, and add your deployment hostname to Auth allowed redirect URLs. Configure the environment variables from `.env.example` in Vercel and redeploy. Users will then be able to sign in and save jobs privately with row-level security policies.

**Without Supabase:** browsing and AI drafts work, while login and saved jobs are clearly marked unavailable. Do not store service-role credentials in `NEXT_PUBLIC_...` variables.

### Vercel deployment
Import `Chirag0401/jobpilot-ai` into Vercel, select the **web** root directory, framework Next.js, then deploy. Preview builds are recommended first. This app is a beta and has no job submission, recurring alerts, persistent shared cache, or unrestricted LinkedIn/Indeed scraping. Before opening it to heavy public traffic, add endpoint rate-limiting, abuse monitoring, and persistent shared caching.
