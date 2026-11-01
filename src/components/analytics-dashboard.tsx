"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTRPC } from "@/trpc/client";

const COLORS = ["#10b981", "#06b6d4", "#6366f1", "#f59e0b", "#ef4444", "#8b5cf6"];

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return "< 1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
};

export function AnalyticsDashboard() {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(trpc.meetings.getAnalytics.queryOptions());

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const talkTimeData = Object.entries(data.talkTimePerUser)
    .map(([name, seconds]) => ({
      name,
      minutes: Math.round((Number(seconds) / 60) * 10) / 10,
      percent: data.talkTimePercent[name] ?? 0,
    }))
    .sort((a, b) => b.minutes - a.minutes);

  const statusData = [
    { name: "Completed", value: data.completedMeetings },
    { name: "Upcoming", value: data.upcomingMeetings },
    { name: "Active", value: data.activeMeetings },
    { name: "Processing", value: data.processingMeetings },
    { name: "Failed", value: data.failedMeetings },
    { name: "Cancelled", value: data.cancelledMeetings },
  ].filter((item) => item.value > 0);

  const stats = [
    { label: "Total Meetings", value: data.totalMeetings },
    { label: "Completed", value: data.completedMeetings },
    { label: "Upcoming", value: data.upcomingMeetings },
    { label: "Avg Duration", value: formatDuration(data.averageDuration) },
    { label: "Total Talk Time", value: formatDuration(data.totalDuration) },
    { label: "AI Summaries", value: data.aiUsageCount },
    { label: "Participants", value: data.totalParticipants },
    { label: "Failed", value: data.failedMeetings },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Talk Time Per Participant (Minutes)</CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            {talkTimeData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={talkTimeData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    stroke="#888888"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#888888"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${value}m`}
                  />
                  <Tooltip formatter={(value) => [`${value}m`, "Talk time"]} />
                  <Bar
                    dataKey="minutes"
                    fill="currentColor"
                    radius={[4, 4, 0, 0]}
                    className="fill-primary"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                No talk time data recorded yet.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Meeting Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="h-[320px]">
            {statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                  >
                    {statusData.map((entry, index) => (
                      <Cell
                        key={entry.name}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                No meetings recorded yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Meeting Activity (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent className="h-[280px]">
          {data.activity.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.activity}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#888888"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#888888"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip />
                <Bar
                  dataKey="count"
                  name="Meetings"
                  fill="currentColor"
                  radius={[4, 4, 0, 0]}
                  className="fill-primary"
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              No activity recorded yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
