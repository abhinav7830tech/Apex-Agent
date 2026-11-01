const WINDOW_MS = 60_000;

export const getRetryAfterSeconds = (windowStartedAt: Date, now: Date) =>
  Math.max(1, Math.ceil((windowStartedAt.getTime() + WINDOW_MS - now.getTime()) / 1000));

export const isRateLimited = (count: number, limit: number) => count > limit;
