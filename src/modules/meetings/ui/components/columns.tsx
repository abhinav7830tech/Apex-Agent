"use client";

import { ColumnDef } from "@tanstack/react-table";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleXIcon,
  ClockFadingIcon,
  ClockIcon,
  LoaderIcon,
  VideoIcon,
} from "lucide-react";

import { cn, formatDuration } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { GeneratedAvatar } from "@/components/generated-avatar";
import { MeetingGetMany, MeetingStatus } from "../../types";
import { formatMeetingWindow, getDisplayStatus } from "../../utils";

const statusColorMap: Record<string, string> = {
  [MeetingStatus.SCHEDULED]: "bg-sky-500/20 text-sky-800 border-sky-800/50",
  [MeetingStatus.UPCOMING]: "bg-amber-500/20 text-amber-800 border-amber-800/50",
  [MeetingStatus.ACTIVE]: "bg-blue-500/20 text-blue-800 border-blue-800/50",
  [MeetingStatus.COMPLETED]:
    "bg-emerald-500/20 text-emerald-800 border-emerald-800/50",
  [MeetingStatus.CANCELLED]: "bg-rose-500/20 text-rose-800 border-rose-800/50",
  [MeetingStatus.PROCESSING]:
    "bg-gray-300/20 text-gray-800 border-gray-800/50",
  [MeetingStatus.FAILED]: "bg-red-500/20 text-red-800 border-red-800/50",
};

const statusIconMap: Record<string, typeof ClockFadingIcon> = {
  [MeetingStatus.SCHEDULED]: ClockIcon,
  [MeetingStatus.UPCOMING]: ClockIcon,
  [MeetingStatus.ACTIVE]: VideoIcon,
  [MeetingStatus.COMPLETED]: CircleCheckIcon,
  [MeetingStatus.CANCELLED]: CircleXIcon,
  [MeetingStatus.PROCESSING]: LoaderIcon,
  [MeetingStatus.FAILED]: CircleAlertIcon,
};

export const columns: ColumnDef<MeetingGetMany[number]>[] = [
  {
    accessorKey: "name",
    header: "Meeting Name",
    cell: ({ row }) => (
      <div className="flex flex-col gap-y-1">
        <span className="font-semibold capitalize">{row.original.name}</span>

        <div className="flex items-center gap-x-2">
          <GeneratedAvatar
            seed={row.original.agent?.name ?? row.original.name}
            className="size-4"
          />
          <span className="text-sm text-muted-foreground max-w-[200px] truncate capitalize">
            {row.original.agent?.name ?? "Agent"}
          </span>
        </div>

        <span className="text-xs text-muted-foreground">
          {row.original.scheduledAt
            ? formatMeetingWindow(
                row.original.scheduledAt,
                row.original.durationMinutes,
              )
            : row.original.startedAt
              ? new Date(row.original.startedAt).toLocaleString()
              : "Not scheduled"}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = getDisplayStatus(
        row.original.status,
        row.original.scheduledAt,
        row.original.endsAt,
      );
      const Icon = statusIconMap[status] ?? ClockFadingIcon;

      return (
        <Badge
          variant="outline"
          className={cn(
            "capitalize flex items-center gap-x-2 [&>svg]:size-4",
            statusColorMap[status],
          )}
        >
          <Icon className={cn(status === MeetingStatus.PROCESSING && "animate-spin")} />
          {status}
        </Badge>
      );
    },
  },
  {
    accessorKey: "duration",
    header: "Duration",
    cell: ({ row }) => {
      const seconds =
        row.original.duration ||
        (row.original.durationMinutes ?? 0) * 60 ||
        0;

      return (
        <Badge
          variant="outline"
          className="capitalize flex items-center gap-x-2 [&>svg]:size-4"
        >
          <ClockFadingIcon className="text-blue-700" />
          {seconds > 0 ? formatDuration(seconds) : "N/A"}
        </Badge>
      );
    },
  },
];
