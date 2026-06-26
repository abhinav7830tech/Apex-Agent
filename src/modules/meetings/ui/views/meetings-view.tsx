"use client"

import { ErrorState } from "@/components/error-state"
import { LoadingState } from "@/components/loading-state"
import { useTRPC } from "@/trpc/client"
import { useSuspenseQuery } from "@tanstack/react-query"
import { ChevronRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { GeneratedAvatar } from "@/components/generated-avatar"
import { useMeetingsFilter } from "@/modules/meetings/hooks/use-meetings-filter"

interface MeetingCardProps {
  id: string;
  name: string;
  status: 'upcoming' | 'active' | 'completed' | 'processing' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  userId: string;
  agentId: string;
  agent: {
    id: string;
    name: string;
  };
}

const MeetingCard = ({ meeting }: { meeting: MeetingCardProps }) => {
  const router = useRouter()

  const statusColors: Record<string, string> = {
    upcoming: 'bg-amber-400',
    active: 'bg-green-500',
    completed: 'bg-green-500',
    processing: 'bg-blue-400',
    cancelled: 'bg-red-400',
  }

  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/meetings/${meeting.id}`);
  }

  const statusText: Record<string, string> = {
    upcoming: 'Upcoming',
    active: 'Active',
    completed: 'Completed',
    processing: 'Processing',
    cancelled: 'Cancelled',
  }

  const statusColor = statusColors[meeting.status] || 'bg-gray-400'
  const statusDisplay = statusText[meeting.status] || meeting.status

  return (
    <div
      className="border border-green-100 bg-white rounded-xl p-4 hover:shadow-lg hover:shadow-green-100/50 transition-all cursor-pointer hover:border-green-200"
      onClick={handleCardClick}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${statusColor}`}></div>
          <span className="text-sm text-green-600 font-medium">{statusDisplay}</span>
        </div>
        <div className="text-sm text-green-400/70">
          {meeting.createdAt ? new Date(meeting.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'No time'}
        </div>
      </div>

      <h3 className="font-semibold text-slate-700 mb-2 text-lg">{meeting.name}</h3>

      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <GeneratedAvatar
              seed={meeting.agent?.name || 'Agent'}
              variant="botttsNeutral"
              className="h-10 w-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-500 text-sm">With</span>
            <div className="flex items-center gap-1 px-3 py-1.5 bg-green-50 rounded-lg border border-green-100">
              <p className="text-sm font-medium text-green-700">{meeting.agent?.name || `Agent`}</p>
              <ChevronRight className="h-3 w-3 text-green-400" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export const MeetingView = () => {
  const trpc = useTRPC()
  const [filters] = useMeetingsFilter();
  const { data } = useSuspenseQuery(trpc.meetings.getMany.queryOptions({
    ...filters
  }))

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-700">My Meetings</h1>
        <div className="mt-2 h-1 w-20 bg-gradient-to-r from-green-400 to-emerald-400 rounded-full"></div>
      </div>

      {data?.items?.length === 0 ? (
        <div className="text-center py-16 bg-green-50/50 rounded-2xl border border-green-100">
          <p className="text-green-500 text-lg">No meetings found</p>
          <p className="text-green-400 text-sm mt-1">Create a new meeting to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {data?.items?.map((meeting) => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export const MeetingsViewLoading = () => {
  return (
    <LoadingState
      title="Loading Meetings"
      description="This may take some time"
    />
  );
};

export const MeetingsViewError = () => {
  return (
    <ErrorState
      title="Error Loading Meetings"
      description="Something went wrong"
    />
  );
};
