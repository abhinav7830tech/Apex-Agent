import "server-only";
import { parseProductionOrigin } from "@/lib/application-origin";

const LOCAL_DEVELOPMENT_URL = "http://localhost:3000";

const isLocalHostname = (hostname: string) =>
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "[::1]" ||
  hostname === "::1";

const toOrigin = (value?: string | null): string | null => {
  if (!value) return null;

  const candidate =
    value.startsWith("http://") || value.startsWith("https://")
      ? value
      : `https://${value}`;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
};

/**
 * Origins explicitly configured by the operator. These are the only origins
 * trusted for shareable invitation links in production.
 */
const configuredOrigins = () =>
  [process.env.NEXT_PUBLIC_APP_URL, process.env.BETTER_AUTH_URL]
    .map(toOrigin)
    .filter((origin): origin is string => Boolean(origin));

/**
 * Deployment-provided hostnames. Vercel sets these per deployment, so they
 * can point at a preview URL. They are useful in development but are never
 * used for production invitations.
 */
const deploymentOrigins = () =>
  [process.env.VERCEL_URL, process.env.NEXT_PUBLIC_VERCEL_URL]
    .map(toOrigin)
    .filter((origin): origin is string => Boolean(origin));

/**
 * Returns the public base URL used to build shareable links.
 *
 * In production only an explicit HTTPS origin is accepted. Falling back to
 * localhost (or a deployment-specific preview host) in production would
 * generate links that either only work on the developer's machine or break
 * as soon as the deployment is replaced, so we return null instead and let
 * callers surface a configuration error.
 */
export const getAppBaseUrl = (): string | null => {
  const isProduction = process.env.NODE_ENV === "production";
  const origins = configuredOrigins();

  if (!isProduction) {
    return (
      origins.find((origin) => isLocalHostname(new URL(origin).hostname)) ??
      origins[0] ??
      deploymentOrigins()[0] ??
      LOCAL_DEVELOPMENT_URL
    );
  }

  return [process.env.NEXT_PUBLIC_APP_URL, process.env.BETTER_AUTH_URL]
    .map(parseProductionOrigin)
    .find((origin): origin is string => Boolean(origin)) ?? null;
};

export class AppUrlConfigurationError extends Error {
  constructor() {
    super(
      "The application URL is not configured. Set NEXT_PUBLIC_APP_URL to the public HTTPS deployment URL before sharing invitations.",
    );
    this.name = "AppUrlConfigurationError";
  }
}

export const getRequiredAppBaseUrl = (): string => {
  const baseUrl = getAppBaseUrl();
  if (!baseUrl) throw new AppUrlConfigurationError();
  return baseUrl;
};

export const isLocalhostUrl = (value: string): boolean => {
  try {
    return isLocalHostname(new URL(value).hostname);
  } catch {
    return false;
  }
};

export const buildMeetingInviteUrl = ({
  meetingId,
  token,
  baseUrl,
}: {
  meetingId: string;
  token: string;
  baseUrl?: string;
}) => {
  const base = baseUrl ?? getRequiredAppBaseUrl();
  return `${base}/join/${encodeURIComponent(meetingId)}?token=${encodeURIComponent(token)}`;
};
