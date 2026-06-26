"use client"

import { ColumnDef } from "@tanstack/react-table"
import { AgentGetMany } from "@/modules/agents/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowUpDown } from "lucide-react"
import { format } from "date-fns"
import { GeneratedAvatar } from "@/components/generated-avatar"

export const agentColumns: ColumnDef<AgentGetMany[number]>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <GeneratedAvatar
          variant="botttsNeutral"
          seed={row.original.name || 'Agent'}
          className="h-8 w-8"
        />
        <div className="font-medium">
          {row.getValue("name")}
        </div>
      </div>
    ),
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Created
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => format(new Date(row.getValue("createdAt")), "MMM d, yyyy"),
  },
  {
    accessorKey: "meetingCount",
    header: "Meetings",
    cell: ({ row }) => (
      <Badge variant="outline">
        {row.getValue("meetingCount")} {row.getValue("meetingCount") === 1 ? "meeting" : "meetings"}
      </Badge>
    ),
  },
]
