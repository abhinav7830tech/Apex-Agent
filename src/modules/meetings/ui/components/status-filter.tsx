import {
  CircleAlertIcon,
  CircleCheckIcon,
  ClockArrowUpIcon,
  ClockIcon,
  LoaderIcon,
  VideoIcon,
} from "lucide-react";

import { CommandSelect } from "@/components/command-select";
import { MeetingStatus } from "../../types";
import { useMeetingsFilter } from "../../hooks/use-meetings-filter";

const options = [
  {
    id: MeetingStatus.SCHEDULED,
    value: MeetingStatus.SCHEDULED,
    label: "Scheduled",
    logo: <ClockIcon className="h-4 w-4 text-sky-500" />,
  },
  {
    id: MeetingStatus.UPCOMING,
    value: MeetingStatus.UPCOMING,
    label: "Upcoming",
    logo: <ClockArrowUpIcon className="h-4 w-4" />,
  },
  {
    id: MeetingStatus.ACTIVE,
    value: MeetingStatus.ACTIVE,
    label: "Active",
    logo: <VideoIcon className="h-4 w-4 text-blue-500" />,
  },
  {
    id: MeetingStatus.COMPLETED,
    value: MeetingStatus.COMPLETED,
    label: "Completed",
    logo: <CircleCheckIcon className="h-4 w-4 text-green-500" />,
  },
  {
    id: MeetingStatus.PROCESSING,
    value: MeetingStatus.PROCESSING,
    label: "Processing",
    logo: <LoaderIcon className="h-4 w-4 animate-spin text-yellow-500" />,
  },
  {
    id: MeetingStatus.FAILED,
    value: MeetingStatus.FAILED,
    label: "Failed",
    logo: <CircleAlertIcon className="h-4 w-4 text-red-500" />,
  },
  {
    id: MeetingStatus.CANCELLED,
    value: MeetingStatus.CANCELLED,
    label: "Cancelled",
    logo: <CircleAlertIcon className="h-4 w-4 text-rose-500" />,
  },
];

export const StatusFilter = () => {
  const [filters, setFilters] = useMeetingsFilter();

  return (
    <CommandSelect
      placeholder="Filter by status..."
      className="h-9 w-[200px]"
      options={options}
      onSelect={(value) => {
        setFilters({ status: value as MeetingStatus });
      }}
      value={filters.status || ""}
    />
  );
};
