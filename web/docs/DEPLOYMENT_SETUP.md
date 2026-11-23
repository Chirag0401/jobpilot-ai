# JobPilot Web — GitHub + Vercel + Supabase setup

This guide finishes the two optional pieces of the hosted JobPilot beta: (1) automatic deployments from GitHub and (2) email sign-in with private saved-job tracking.

**Existing project:** [JobPilot on Vercel](https://jobpilot-ai-web.vercel.app/). **Source repository:** [Chirag0401/jobpilot-ai](https://github.com/Chirag0401/jobpilot-ai). The Vercel project is named `jobpilot-ai-web` and its app lives in the `web/` folder of the repo. **Use the existing Vercel project; don't create another one.**

## A. Enable GitHub → Vercel auto-deployments

This step **requires the repository owner to approve Vercel GitHub App access**. It cannot be completed by editing source code, and you should not send GitHub tokens to anyone.

1. In GitHub, open **Settings → Applications → Installed GitHub Apps → Vercel → Configure**. If Vercel is not installed, install the Vercel GitHub integration from the Vercel dashboard.
2. Under repository access, choose **Only select repositories** and explicitly select `Chirag0401/jobpilot-ai`. Save.
3. In Vercel, open the existing `jobpilot-ai-web` project → **Settings → Git** → **Connect Git Repository**. Select `Chirag0401/jobpilot-ai`. If the option is missing, reload after completing step 2.
4. Set **Root Directory** to `web`, **Framework** to `Next.js`, and the **Production Branch** to `main`. Leave Deployment Protection configured to protect previews, not the production URL.
5. Confirm Vercel sees the Git connection and that subsequent pushes to `main` trigger new production builds. Pull requests should create preview builds.

Troubleshooting: If Vercel says **repo_not_found** or the Git namespaces call returns **401**, reauthorize the Vercel GitHub integration and check the selected repository access. Do not disconnect the existing Vercel project or create a duplicate project merely to fix access.

Official docs: [Vercel for GitHub](https://vercel.com/docs/git/vercel-for-github) and [Git settings](https://vercel.com/docs/project-configuration/git-settings).

## B. Enable Supabase email sign-in and private saved jobs

A Supabase account and **a project in your own Supabase workspace** are required. Never paste a service-role key, secret key, or database password in chat or a repository.

1. Open [Supabase Dashboard](https://supabase.com/dashboard), create a project (for example, `jobpilot-ai`) and let the project database initialize.
2. Open **SQL Editor → New query**. Copy and run the source in [`web/supabase/schema.sql`](../supabase/schema.sql). This creates the `saved_jobs` table and enables **Row Level Security (RLS)** policies restricting each user's rows to their own user ID.
3. Open **Authentication → Providers → Email** and enable email sign-in. Ensure the email template supports a magic sign-in link, and confirm the project's email delivery limits / SMTP requirements before inviting others.
4. Open **Authentication → URL Configuration**. Set **Site URL** to `https://jobpilot-ai-web.vercel.app` and include `https://jobpilot-ai-web.vercel.app` as an **allowed Redirect URL**. When testing deployment previews, add only the particular preview URLs you trust.
5. In the Supabase project's **Connect** or **Project Settings → API Keys**, copy the **Project URL** and **publishable key** (`sb_publishable_...`). This key is designed to be public in the browser; RLS policies protect the data. **Do not use a service_role or sb_secret key.**
6. In Vercel's existing `jobpilot-ai-web` project, open **Settings → Environment Variables**. Add for **Production**:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLIC_KEY
   ```

   If your older Supabase project only provides a legacy **anon** key, use `NEXT_PUBLIC_SUPABASE_ANON_KEY` instead. Set Preview variables too only if your auth redirect URLs intentionally allow preview deployments.
7. **Redeploy** the project after adding the environment variables: Next.js `NEXT_PUBLIC_` settings are embedded in the browser bundle when it builds.
8. In an incognito browser, open the site, sign in using the email magic link, save a job, sign out and sign back in. Verify the saved job reappears. Use a second test account to confirm it cannot read or modify the first account's jobs.

## Quick checklist

- [ ] GitHub Vercel app authorized for **only** `jobpilot-ai`
- [ ] Existing Vercel `jobpilot-ai-web` project linked to `main` with root `web`
- [ ] Future Git push triggers Vercel deploy
- [ ] Supabase project created and `supabase/schema.sql` executed
- [ ] Email provider and public redirect configured
- [ ] Only public publishable key + project URL added to Vercel environment
- [ ] Redeployed and checked email sign-in, save, logout, and cross-user isolation

**Safety:** Currently, the app does *not* auto-submit applications, collect resumes on the server, or store the user's AI model API key. For a large public audience, add rate limiting, abuse controls and a production email provider before promoting this beta.
