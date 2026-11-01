"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeftIcon, ChevronRightIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTRPC } from "@/trpc/client";
import { cn } from "@/lib/utils";

const statusColor: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700",
  upcoming: "bg-blue-100 text-blue-700",
  active: "bg-green-100 text-green-700",
  completed: "bg-slate-100 text-slate-700",
  processing: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
};

export const CalendarView = () => {
  const trpc = useTRPC();
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));

  const rangeStart = startOfWeek(currentMonth, { weekStartsOn: 0 });
  const rangeEnd = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });

  const { data, isLoading, isError, error } = useQuery(
    trpc.meetings.getCalendar.queryOptions({
      from: rangeStart.toISOString(),
      to: rangeEnd.toISOString(),
    }),
  );

  const days = useMemo(
    () => eachDayOfInterval({ start: rangeStart, end: rangeEnd }),
    [rangeStart, rangeEnd],
  );

  const meetingsByDay = useMemo(() => {
    const map = new Map<string, NonNullable<typeof data>>();
    for (const meeting of data ?? []) {
      if (!meeting.scheduledAt) continue;
      const key = format(new Date(meeting.scheduledAt), "yyyy-MM-dd");
      const existing = map.get(key) ?? [];
      existing.push(meeting);
      map.set(key, existing);
    }
    return map;
  }, [data]);

  return (
    <div className="mx-auto w-full max-w-6xl p-6 md:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1a3d2e]">Calendar</h1>
          <p className="text-sm text-muted-foreground">
            Scheduled meetings for {format(currentMonth, "MMMM yyyy")}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous month"
            onClick={() => setCurrentMonth((month) => subMonths(month, 1))}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <Button
            variant="outline"
            onClick={() => setCurrentMonth(startOfMonth(new Date()))}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next month"
            onClick={() => setCurrentMonth((month) => addMonths(month, 1))}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{format(currentMonth, "MMMM yyyy")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
            </div>
          ) : isError ? (
            <p className="py-10 text-center text-sm text-destructive">
              {error.message}
            </p>
          ) : (
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border text-sm">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div
                  key={day}
                  className="bg-muted px-2 py-2 text-center text-xs font-semibold text-muted-foreground"
                >
                  {day}
                </div>
              ))}
              {days.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const meetings = meetingsByDay.get(key) ?? [];
                return (
                  <div
                    key={key}
                    className={cn(
                      "min-h-28 bg-background p-2",
                      !isSameMonth(day, currentMonth) && "bg-muted/40 text-muted-foreground",
                      isSameDay(day, new Date()) && "ring-2 ring-inset ring-primary",
                    )}
                  >
                    <div className="mb-1 text-xs font-medium">
                      {format(day, "d")}
                    </div>
                    <div className="space-y-1">
                      {meetings.slice(0, 3).map((meeting) => (
                        <Link
                          key={meeting.id}
                          href={`/meetings/${meeting.id}`}
                          className="block truncate rounded px-1.5 py-1 text-xs hover:bg-muted"
                          title={meeting.name}
                        >
                          <span className="mr-1 font-medium">
                            {format(new Date(meeting.scheduledAt!), "HH:mm")}
                          </span>
                          {meeting.name}
                        </Link>
                      ))}
                      {meetings.length > 3 && (
                        <p className="px-1.5 text-xs text-muted-foreground">
                          +{meetings.length - 3} more
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {data && data.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-lg font-semibold">Scheduled this month</h2>
          <div className="space-y-2">
            {data.map((meeting) => (
              <Link
                key={meeting.id}
                href={`/meetings/${meeting.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3 hover:bg-muted/50"
              >
                <div>
                  <p className="font-medium">{meeting.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(meeting.scheduledAt!), "PPpp")} ·{" "}
                    {meeting.durationMinutes ?? 30} min · {meeting.agent.name}
                  </p>
                </div>
                <Badge className={statusColor[meeting.status] ?? ""}>
                  {meeting.status}
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
