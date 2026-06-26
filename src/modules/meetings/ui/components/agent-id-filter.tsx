import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { CommandSelect } from "@/components/command-select";
import { GeneratedAvatar } from "@/components/generated-avatar";
import { useMeetingsFilter } from "../../hooks/use-meetings-filter";


export const AgentIdFilter = () => {
    const [agentSearch, setAgentSearch] = useState("");
    const [filters, setFilters] = useMeetingsFilter();
    const trpc = useTRPC();

    // Fetch agents with search functionality
    const { data } = useQuery(
        trpc.agents.getMany.queryOptions({
            pageSize: 100,
            search: agentSearch,
        }),
    );

    return (
        <CommandSelect
            className="h-9 w-[180px]"
            placeholder="Agent"
            value={filters.agentId ?? ''}
            onSelect={(value: string) => setFilters({ ...filters, agentId: value })}
            options={(data?.items ?? []).map((agent) => ({
                id: agent.id,
                value: agent.id,
                label: agent.name,
                logo: (
                    <GeneratedAvatar
                        seed={agent.name}
                        variant="botttsNeutral"
                        className="size-4"
                    />
                )
            }))}
            onSearch={setAgentSearch}
        />
    )
}