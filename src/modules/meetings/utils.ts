import { MeetingStatus } from "./types";

export const getMeetingEnd = (scheduledAt: Date, durationMinutes: number) =>
  new Date(scheduledAt.getTime() + durationMinutes * 60 * 1000);

export const parseScheduledAt = (value: string): Date | null => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const zonedDateTimeToUtc = (
  value: string,
  timeZone: string,
): Date | null => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  const [, year, month, day, hour, minute] = match;
  const utcGuess = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(new Date(utcGuess));

    const get = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value ?? 0);

    const hourValue = get("hour") === 24 ? 0 : get("hour");
    const asUtc = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      hourValue,
      get("minute"),
      get("second"),
    );

    const offset = asUtc - utcGuess;
    const result = new Date(utcGuess - offset);
    return Number.isNaN(result.getTime()) ? null : result;
  } catch {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
};

export const toDatetimeLocalValue = (
  value: Date | string | null | undefined,
): string => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const toZonedDatetimeLocalValue = (
  value: Date | string | null | undefined,
  timeZone: string,
): string => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);

    const get = (type: string) =>
      parts.find((part) => part.type === type)?.value ?? "00";
    const hour = get("hour") === "24" ? "00" : get("hour");

    return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
  } catch {
    return toDatetimeLocalValue(date);
  }
};

export const getDisplayStatus = (
  status: MeetingStatus | string,
  // Kept for call-site compatibility; status is driven by webhook events.
  _scheduledAt?: Date | string | null,
  _endsAt?: Date | string | null,
): MeetingStatus => {
  void _scheduledAt;
  void _endsAt;
  if (status === MeetingStatus.SCHEDULED) return MeetingStatus.UPCOMING;
  return status as MeetingStatus;
};

export const formatMeetingWindow = (
  scheduledAt: Date | string | null | undefined,
  durationMinutes: number | null | undefined,
) => {
  if (!scheduledAt) return "Not scheduled";
  const start = new Date(scheduledAt);
  const duration = durationMinutes ?? 30;
  const end = new Date(start.getTime() + duration * 60 * 1000);
  const date = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = start.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const endTime = end.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} · ${time} – ${endTime}`;
};
