"use client";

import { useQuery } from "@tanstack/react-query";
import { LoaderIcon, Users, Calendar, Activity, Clock } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/trpc/client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export function HomeView() {
  const { data: session, isPending } = authClient.useSession();
  const trpc = useTRPC();

  const { data: agentsCount } = useQuery({
    ...trpc.agents.getCount.queryOptions(),
    enabled: !!session?.user,
  });

  const { data: meetingStats } = useQuery({
    ...trpc.meetings.getStats.queryOptions(),
    enabled: !!session?.user,
  });

  const { data: analyticsData } = useQuery({
    ...trpc.meetings.getAnalytics.queryOptions(),
    enabled: !!session?.user,
  });

  if (isPending || !analyticsData || !meetingStats) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#eefbf3] via-[#e8f5ef] to-[#dff7ea]">
        <div className="flex flex-col items-center gap-4">
          <LoaderIcon className="size-8 animate-spin text-green-500" />
          <p className="text-[#5a7a6a] text-sm font-medium animate-pulse">Loading your workspace...</p>
        </div>
      </div>
    );
  }

   const userName = session?.user?.name || "Prasoon";
  const displayedAgentsCount = agentsCount || 0;

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    if (minutes < 1) return "< 1m";
    return `${minutes}m`;
  };

  const chartData = Object.entries(analyticsData.talkTimePerUser).map(([name, time]) => ({
    name,
    talkTime: Math.floor((time as number) / 60)
  }));

  return (
    <div className="min-h-[calc(100vh-4rem)] w-full bg-transparent text-[#1a3d2e] p-6 md:p-8 font-sans">
      {/* Background Effects */}
      <div className="fixed top-0 left-0 w-[600px] h-[600px] rounded-full bg-green-200/50 blur-[200px] pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-[500px] h-[500px] rounded-full bg-blue-200/50 blur-[180px] pointer-events-none" />

      <div className="max-w-7xl mx-auto w-full relative z-10 flex flex-col gap-8">
        
        {/* Header */}
        <header className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-6 duration-700 ease-out py-2">
           <div className="flex items-center gap-2">
             <div className="inline-flex items-center rounded-full border border-green-200 bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
               AI-Powered Workspace
             </div>
           </div>
           <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-[#1a3d2e]">
              Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-600 via-emerald-500 to-blue-500">{userName}</span>
           </h1>
           <p className="text-[#5a7a6a] text-lg max-w-2xl">
             Your intelligent command center. Monitor your meetings and AI agent performance in real-time.
           </p>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <div className="group relative overflow-hidden rounded-2xl border border-green-200 bg-white p-5 shadow-sm transition-all hover:border-green-300 hover:shadow-md hover:shadow-green-100/50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-[#5a7a6a]">Total Agents</h3>
              <div className="rounded-xl bg-green-100 p-2.5 text-green-600 group-hover:scale-110 transition-transform">
                 <Users className="size-4" />
              </div>
            </div>
            <p className="text-3xl font-bold text-[#1a3d2e] mb-1">{displayedAgentsCount}</p>
            <p className="text-xs text-[#7a9a8a]">Active AI Assistants</p>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-blue-200 bg-white p-5 shadow-sm transition-all hover:border-blue-300 hover:shadow-md hover:shadow-blue-100/50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-[#5a7a6a]">Total Meetings</h3>
              <div className="rounded-xl bg-blue-100 p-2.5 text-blue-600 group-hover:scale-110 transition-transform">
                 <Activity className="size-4" />
              </div>
            </div>
            <p className="text-3xl font-bold text-[#1a3d2e] mb-1">{meetingStats.totalConfigured}</p>
            <p className="text-xs text-[#7a9a8a]">All time sessions</p>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-cyan-200 bg-white p-5 shadow-sm transition-all hover:border-cyan-300 hover:shadow-md hover:shadow-cyan-100/50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-[#5a7a6a]">Avg Duration</h3>
              <div className="rounded-xl bg-cyan-100 p-2.5 text-cyan-600 group-hover:scale-110 transition-transform">
                 <Clock className="size-4" />
              </div>
            </div>
            <p className="text-3xl font-bold text-[#1a3d2e] mb-1">{formatDuration(analyticsData.averageDuration)}</p>
            <p className="text-xs text-[#7a9a8a]">Per summarized meeting</p>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm transition-all hover:border-emerald-300 hover:shadow-md hover:shadow-emerald-100/50">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-[#5a7a6a]">Upcoming</h3>
              <div className="rounded-xl bg-emerald-100 p-2.5 text-emerald-600 group-hover:scale-110 transition-transform">
                 <Calendar className="size-4" />
              </div>
            </div>
            <p className="text-3xl font-bold text-[#1a3d2e] mb-1">{meetingStats.upcomingCount}</p>
            <p className="text-xs text-[#7a9a8a]">Scheduled sessions</p>
          </div>

        </div>

        {/* Analytics Chart */}
        <div className="rounded-2xl border border-green-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-[400px]">
          <div className="flex items-center justify-between border-b border-green-100 px-6 py-5 bg-green-50/50">
            <h2 className="text-lg font-semibold text-[#1a3d2e] flex items-center gap-3">
              AI Insights & Talk Time <span className="text-sm font-normal text-[#5a7a6a] ml-2">(Minutes)</span>
            </h2>
          </div>
          <div className="flex-1 p-6 flex flex-col justify-center">
            {chartData.length > 0 ? (
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" stroke="#7a9a8a" fontSize={12} tickLine={false} axisLine={false} dy={10} />
                    <YAxis stroke="#7a9a8a" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `${val}m`} dx={-10} />
                    <Tooltip 
                      cursor={{fill: 'rgba(16, 185, 129, 0.05)'}}
                      contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #cce8d9', borderRadius: '12px', color: '#1a3d2e' }}
                      itemStyle={{ color: '#10b981', fontWeight: 'bold' }}
                    />
                    <Bar dataKey="talkTime" fill="url(#colorTalkTimeFresh)" radius={[6, 6, 0, 0]} barSize={40} animationDuration={1500} />
                    <defs>
                      <linearGradient id="colorTalkTimeFresh" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={1}/>
                        <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.8}/>
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col h-[200px] items-center justify-center text-[#5a7a6a] gap-4">
                 <div className="rounded-full bg-green-100 p-4">
                    <Activity className="size-8 text-green-300" />
                 </div>
                 <p className="text-sm font-medium">No meeting data recorded yet.</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
