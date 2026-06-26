'use client';

import { useTRPC } from '@/trpc/client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Loader2 } from 'lucide-react';

export function AnalyticsDashboard() {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(trpc.meetings.getAnalytics.queryOptions());

  if (isLoading) {
    return <div className="flex h-48 items-center justify-center"><Loader2 className="animate-spin text-muted-foreground w-8 h-8"/></div>;
  }

  if (!data) return null;

  const chartData = Object.entries(data.talkTimePerUser).map(([name, time]) => ({
    name,
    talkTime: Math.floor(time / 60) // in minutes
  }));

  const formatDuration=(seconds:number)=> {
     const minutes = Math.floor(seconds / 60);
     if (minutes < 1) return "< 1m";
     return `${minutes}m`;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Meetings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalMeetings}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDuration(data.averageDuration)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">AI Usage Count</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.aiUsageCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="col-span-4">
        <CardHeader>
          <CardTitle>Talk Time Per User (Minutes)</CardTitle>
        </CardHeader>
        <CardContent className="h-[300px]">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}m`} />
                <Tooltip />
                <Bar dataKey="talkTime" fill="currentColor" radius={[4, 4, 0, 0]} className="fill-primary" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              No talk time data recorded yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
