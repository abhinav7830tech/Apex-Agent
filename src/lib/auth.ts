import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import * as schema from "@/db/schema"
export const auth = betterAuth({
    socialProviders: {
        github: {
            clientId: process.env.GITHUB_CLIENT_ID as string,
            clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
        },
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID as string,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        },
    },
    emailAndPassword: {
        enabled: true
    },
    database: drizzleAdapter(db, {
        provider: "pg",
        schema: {
            ...schema,
        },
    }),
    rateLimit: {
        window: 60,
        max: 100,
    },
    trustedOrigins: [
        process.env.NEXT_PUBLIC_APP_URL ? process.env.NEXT_PUBLIC_APP_URL : "",
        process.env.BETTER_AUTH_URL ? process.env.BETTER_AUTH_URL : "",
        process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
        process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : "",
        "https://ai-agent-meet-lgl8-ganeoou2y-prasoonsingh79s-projects.vercel.app",
        "https://ai-agent-meet-dlto.vercel.app",
        "https://ai-agent-meet-dlto-git-main-prasoonsingh79s-projects.vercel.app",
        "https://ai-saas-agent-chi.vercel.app",
    ].filter(Boolean) as string[],
});