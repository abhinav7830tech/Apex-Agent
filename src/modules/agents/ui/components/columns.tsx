import { format } from "date-fns";
import { ColumnDef } from "@tanstack/react-table"
import { GeneratedAvatar } from "@/components/generated-avatar"
import {
  CircleCheckIcon, CircleXIcon, CircleArrowUpIcon, ClockFadingIcon, LoaderIcon, CornerDownRight
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils";
import { MeetingGetMany } from "@/modules/meetings/types"

/**
 * Formats a duration in seconds into a human-readable string
 * @example
 * formatDuration(90) // "1m 30s"
 * formatDuration(3600) // "1h"
 * formatDuration(3665) // "1h 1m 5s"
 */



const statusIconMap = {
  upcoming: {
    icon: ClockFadingIcon,
    color: "text-blue-400",
    label: "Upcoming"
  },
  scheduled: {
    icon: ClockFadingIcon,
    color: "text-blue-500",
    label: "Scheduled"
  },
  active: {
    icon: LoaderIcon,
    color: "text-amber-500 animate-spin",
    label: "In Progress"
  },
  completed: {
    icon: CircleCheckIcon,
    color: "text-emerald-500",
    label: "Completed"
  },
  cancelled: {
    icon: CircleXIcon,
    color: "text-rose-500",
    label: "Cancelled"
  },
  processing: {
    icon: CircleArrowUpIcon,
    color: "text-amber-500",
    label: "processing"
  },
  default: {
    icon: ClockFadingIcon,
    color: "text-muted-foreground",
    label: "Unknown"
  }
} as const;

const statusColorMap = {
  upcoming: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  scheduled: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  active: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 animate-pulse",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  cancelled: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
  processing: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  default: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"
} as const;


export const columns: ColumnDef<MeetingGetMany[number]>[] = [
  {
    accessorKey: "name",
    header: "Meeting Name",
    cell: ({ row }) => (
      <div className="flex flex-col gap-y-1">
        <div className="flex items-center gap-x-2">
          <span className="font-semibold capitalize">{row.original.name}</span>
        </div>

        <div className="flex gap-x-1">
          <CornerDownRight className="size-3 text-muted-foreground" />
          <span className="text-sm max-w-[200px] truncate capitalize">{row.original.agent?.name || 'Agent'}</span>
        </div>
        <GeneratedAvatar
          variant="botttsNeutral"
          seed={row.original.agent?.name || row.original.name || 'Agent'}
          className="size-5"
        />
        <span className="text-sm text-muted-foreground">
          {row.original.startedAt ? format(row.original.startedAt, "MMM d") : ""}
        </span>
      </div>
    )
  },

  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.original.status || 'default';
      const { icon: StatusIcon } = statusIconMap[status as keyof typeof statusIconMap] || statusIconMap.default;

      return (
        <Badge
          variant="outline"
          className={cn(
            "captialize [&>svg]:size-4 text-muted-foreground",
            statusColorMap[row.original.status as keyof typeof statusColorMap]
          )}
        >
          <StatusIcon className={cn(

            row.original.status == "processing" && "animate-spin"
          )}
          />
          {row.original.status}
        </Badge>
      );
    }

  }

]