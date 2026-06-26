
# Deployment Instructions for Vercel

To ensure your authentication works correctly in production, please verify the following Environment Variables in your Vercel Project Settings.

## Required Environment Variables

1.  **BETTER_AUTH_URL**: 
    -   Must be set to your deployed application URL (e.g., `https://your-project.vercel.app`).
    -   *Do not* use `http://localhost:3000` in production.
    -   If you have a custom domain, use that.

2.  **BETTER_AUTH_SECRET**:
    -   Ensure this is set to a secure random string (you can generate one with `openssl rand -base64 32` or just copy the one from your `.env` if it's secure enough for now).

3.  **Social Provider Credentials**:
    -   `GITHUB_CLIENT_ID`
    -   `GITHUB_CLIENT_SECRET`
    -   `GOOGLE_CLIENT_ID`
    -   `GOOGLE_CLIENT_SECRET`
    -   *Important*: Make sure you strictly add your deployed URL's callback path to the authorized redirect URIs in your Google/GitHub OAuth apps. 
        -   For Better Auth, the callback URL is usually: `https://your-project.vercel.app/api/auth/callback/google` (or `github`).

4.  **Database**:
    -   `DATABASE_URL` (PostgreSQL connection string).

5.  **Inngest (Crucial for deployed Agents)**:
    -   *Do not* run `npx inngest-cli dev` for the deployed app. That is only for local testing.
    -   Instead, go to [Inngest Cloud](https://app.inngest.com).
    -   Connect your Vercel project or manually add `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` to your Vercel Environment Variables.
    -   Once set, Inngest will automatically sync your deployed functions at `https://your-project.vercel.app/api/inngest`.

## Rate Limiting

I have relaxed the rate limiting configuration in `src/lib/auth.ts` to allow 100 requests per 60 seconds. This should prevent the `429 Too Many Requests` error you were seeing during testing.

## Next Step

1.  **Push** the changes to your repository.
2.  **Verify** your Vercel Environment Variables.
3.  **Redeploy** (or wait for automatic deployment).
4.  **Test** the sign-up/login again.
