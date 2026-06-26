import {
  CircleXIcon,
  CircleCheckIcon,
  ClockArrowUpIcon,
  VideoIcon,
  LoaderIcon,
} from "lucide-react";

import { CommandSelect } from "@/components/command-select";
import { MeetingStatus } from "../../types";
import { useMeetingsFilter } from "../../hooks/use-meetings-filter";


const options = [
  {
    id: MeetingStatus.UPCOMING,
    value: MeetingStatus.UPCOMING,
    label: MeetingStatus.UPCOMING,
    logo: (
      <div className="flex items-center gap-x-2 capitalize">
        <ClockArrowUpIcon className="h-4 w-4" />
      </div>
    )
  },
  {
    id: MeetingStatus.ACTIVE,
    value: MeetingStatus.ACTIVE,
    label: MeetingStatus.ACTIVE,
    logo: (
      <div className="flex items-center gap-x-2 capitalize">
        <VideoIcon className="h-4 w-4 text-blue-500" />
      </div>
    )
  },
  {
    id: MeetingStatus.COMPLETED,
    value: MeetingStatus.COMPLETED,
    label: MeetingStatus.COMPLETED,
    logo: (
      <div className="flex items-center gap-x-2 capitalize">
        <CircleCheckIcon className="h-4 w-4 text-green-500" />
      </div>
    )
  },
  {
    id: MeetingStatus.PROCESSING,
    value: MeetingStatus.PROCESSING,
    label: MeetingStatus.PROCESSING,
    logo: (
      <div className="flex items-center gap-x-2 capitalize">
        <LoaderIcon className="h-4 w-4 animate-spin text-yellow-500" />
      </div>
    )
  },
  {
    id: MeetingStatus.CANCELLED,
    value: MeetingStatus.CANCELLED,
    label: MeetingStatus.CANCELLED,
    logo: (
      <div className="flex items-center gap-x-2 capitalize">
        <CircleXIcon className="h-4 w-4 text-red-500" />
      </div>
    )
  },
];

export const StatusFilter = () => {
  const [filters, setFilters] = useMeetingsFilter()

  return (
    <CommandSelect
      placeholder="Filter by status..."
      className="h-9 w-[200px]"
      options={options}

      onSelect={(value) => {
        setFilters({ status: value as MeetingStatus })
      }}
      value={filters.status || ""}

    />
  );
}