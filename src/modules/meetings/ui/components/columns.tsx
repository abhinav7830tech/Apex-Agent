"use client";

import { format } from "date-fns";
import { ColumnDef } from "@tanstack/react-table";
import {
  CircleCheckIcon,
  CircleXIcon,
  ClockFadingIcon,
  LoaderIcon,
  CircleArrowUpIcon,
  CornerDownRightIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { GeneratedAvatar } from "@/components/generated-avatar";
import { MeetingGetMany } from "../../types";
import { formatDuration } from "@/lib/utils";

/* ---------------- status colors ---------------- */
const statusColorMap = {
  active: "bg-blue-500/20 text-blue-800 border-blue-800/50",
  completed: "bg-emerald-500/20 text-emerald-800 border-emerald-800/50",
  cancelled: "bg-rose-500/20 text-rose-800 border-rose-800/50",
  processing: "bg-gray-300/20 text-gray-800 border-gray-800/50",
} as const;

/* ---------------- status icons ---------------- */
const statusIconMap = {
  active: LoaderIcon,
  completed: CircleCheckIcon,
  cancelled: CircleXIcon,
  processing: CircleArrowUpIcon,
  default: ClockFadingIcon,
} as const;

/* ---------------- table columns ---------------- */
export const columns: ColumnDef<MeetingGetMany[number]>[] = [
  {
    accessorKey: "name",
    header: "Meeting Name",
    cell: ({ row }) => (
      <div className="flex flex-col gap-y-1">
        {/* Meeting name */}
        <span className="font-semibold capitalize">
          {row.original.name}
        </span>

        {/* Agent info */}
        <div className="flex items-center gap-x-2">
          <CornerDownRightIcon className="size-3 text-muted-foreground" />
          <GeneratedAvatar
            seed={row.original.agent?.name ?? row.original.name}
            className="size-4"
          />
          <span className="text-sm text-muted-foreground max-w-[200px] truncate capitalize">
            {row.original.agent?.name ?? "Agent"}
          </span>
        </div>

        {/* Date */}
        {row.original.startedAt && (
          <span className="text-xs text-muted-foreground">
            {format(row.original.startedAt, "MMM d")}
          </span>
        )}
      </div>
    ),
  },

  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.original.status ?? "default";
      const Icon =
        statusIconMap[status as keyof typeof statusIconMap] ??
        statusIconMap.default;

      return (
        <Badge
          variant="outline"
          className={cn(
            "capitalize flex items-center gap-x-2 [&>svg]:size-4",
            statusColorMap[status as keyof typeof statusColorMap]
          )}
        >
          <Icon
            className={cn(
              status === "processing" && "animate-spin"
            )}
          />
          {status}
        </Badge>
      );
    },
  },

  {
    accessorKey: "duration",
    header: "Duration",
    cell: ({ row }) => (
      <Badge
        variant="outline"
        className="capitalize flex items-center gap-x-2 [&>svg]:size-4"
      >
        <ClockFadingIcon className="text-blue-700" />
        {formatDuration(row.original.duration)}
      </Badge>
    ),
  },
];
