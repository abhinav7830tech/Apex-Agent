import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import * as schema from "@/db/schema";

const LOCAL_DEVELOPMENT_URL = "http://localhost:3000";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Normalizes an environment value into an origin. Values without a protocol
 * are treated as Vercel-style hostnames.
 */
const toOrigin = (value?: string | null): string | null => {
    if (!value) return null;

    const candidate =
        value.startsWith("http://") || value.startsWith("https://")
            ? value
            : `https://${value}`;

    try {
        const url = new URL(candidate);
        return url.protocol === "http:" || url.protocol === "https:"
            ? url.origin
            : null;
    } catch {
        return null;
    }
};

const isLocalOrigin = (origin: string) => {
    try {
        return LOCAL_HOSTNAMES.has(new URL(origin).hostname);
    } catch {
        return false;
    }
};

const isProduction = process.env.NODE_ENV === "production";

const configuredAppOrigins = [
    toOrigin(process.env.BETTER_AUTH_URL),
    toOrigin(process.env.NEXT_PUBLIC_APP_URL),
    toOrigin(process.env.VERCEL_URL),
    toOrigin(process.env.NEXT_PUBLIC_VERCEL_URL),
    "https://ai-agent-meet-lgl8-ganeoou2y-prasoonsingh79s-projects.vercel.app",
    "https://ai-agent-meet-dlto.vercel.app",
    "https://ai-agent-meet-dlto-git-main-prasoonsingh79s-projects.vercel.app",
    "https://ai-saas-agent-chi.vercel.app",
].filter((origin): origin is string => Boolean(origin));

// Local origins are only trusted outside production. Both hostnames are
// included because browsers treat localhost and 127.0.0.1 as different origins.
const developmentOrigins = [
    LOCAL_DEVELOPMENT_URL,
    "http://127.0.0.1:3000",
    "http://[::1]:3000",
];

const trustedOrigins = Array.from(
    new Set([
        ...configuredAppOrigins,
        ...(isProduction ? [] : developmentOrigins),
    ]),
);

const configuredBaseURL =
    toOrigin(process.env.BETTER_AUTH_URL) ??
    toOrigin(process.env.NEXT_PUBLIC_APP_URL);

// In development the local .env may still point at production. Using that URL
// as Better Auth's baseURL makes it issue Secure cookies and production
// callbacks while serving http://localhost, which breaks signup/login/session.
// Prefer a local URL in development, while keeping the configured production
// URL untouched for production builds.
const baseURL = isProduction
    ? configuredBaseURL ?? undefined
    : configuredBaseURL && isLocalOrigin(configuredBaseURL)
      ? configuredBaseURL
      : LOCAL_DEVELOPMENT_URL;

export const auth = betterAuth({
    baseURL,
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
    trustedOrigins,
});