"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpCircleIcon,
  BotIcon,
  CalendarIcon,
  HomeIcon,
  SparklesIcon,
  VideoIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Dispatch, SetStateAction, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useTRPC } from "@/trpc/client";

interface Props {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}

const quickLinks = [
  { label: "Dashboard", href: "/", icon: HomeIcon },
  { label: "Meetings", href: "/meetings", icon: VideoIcon },
  { label: "Agents", href: "/agents", icon: BotIcon },
  { label: "Calendar", href: "/calendar", icon: CalendarIcon },
  { label: "Ask AI", href: "/ask-ai", icon: SparklesIcon },
  { label: "Upgrade", href: "/upgrade", icon: ArrowUpCircleIcon },
];

export const DashboardCommand = ({ open, setOpen }: Props) => {
  const router = useRouter();
  const trpc = useTRPC();
  const [search, setSearch] = useState("");

  const { data: meetings } = useQuery({
    ...trpc.meetings.getMany.queryOptions({
      search: search || undefined,
      page: 1,
      pageSize: 5,
    }),
    enabled: open,
  });

  const { data: agents } = useQuery({
    ...trpc.agents.getMany.queryOptions({
      search: search || undefined,
      page: 1,
      pageSize: 5,
    }),
    enabled: open,
  });

  const go = (href: string) => {
    setOpen(false);
    setSearch("");
    router.push(href);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Find a meeting, agent, or page..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {search && meetings?.items.length ? (
          <CommandGroup heading="Meetings">
            {meetings.items.map((meeting) => (
              <CommandItem
                key={meeting.id}
                value={`meeting-${meeting.name}-${meeting.id}`}
                onSelect={() => go(`/meetings/${meeting.id}`)}
              >
                <VideoIcon className="mr-2 size-4" />
                {meeting.name}
                <span className="ml-auto text-xs text-muted-foreground">
                  {meeting.status}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {search && agents?.items.length ? (
          <CommandGroup heading="Agents">
            {agents.items.map((agent) => (
              <CommandItem
                key={agent.id}
                value={`agent-${agent.name}-${agent.id}`}
                onSelect={() => go(`/agents/${agent.id}`)}
              >
                <BotIcon className="mr-2 size-4" />
                {agent.name}
                <span className="ml-auto text-xs text-muted-foreground">
                  {agent.meetingCount} meetings
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {search && (meetings?.items.length || agents?.items.length) ? (
          <CommandSeparator />
        ) : null}

        <CommandGroup heading="Pages">
          {quickLinks.map((link) => (
            <CommandItem
              key={link.href}
              value={`page-${link.label}`}
              onSelect={() => go(link.href)}
            >
              <link.icon className="mr-2 size-4" />
              {link.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};
