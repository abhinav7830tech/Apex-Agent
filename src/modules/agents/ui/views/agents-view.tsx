"use client";

import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { useTRPC } from "@/trpc/client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { DataTable } from "../components/data-table";
import { agentColumns } from "../components/agents-columns";
import { EmptyState } from "@/components/empty-state";

import { useAgentsFilter } from "../../hooks/use-agents-filter";
import { DataPagination } from "../components/data-pagination";
import { useRouter } from "next/navigation";

export const AgentsView = () => {
  const router=useRouter();
  const [filters,setFilters]=useAgentsFilter();
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(
    trpc.agents.getMany.queryOptions({
      ...filters,
    })
  );

  return(
     <div className="flex-1 pb-4 px-4 md:px-8 flex flex-col gap-y-4">
     <DataTable data={data.items} columns={agentColumns} 
     onRowClick={(row) => router.push(`/agents/${row.id}`)}
     />
     <DataPagination
     page={filters.page}
     totalPages={data.totalPages}
     onPageChange={(page) =>setFilters({page})}
     
     />
     {data.items.length === 0 && (
      <EmptyState
      title="Create your first Agent"
      description="Create your agent to join meeting. It will help assist you"
      />
     )}
   </div>
   
  )
};

export const AgentViewLoading = () => {
  return (
    <LoadingState
      title="Loading Agents"
      description="This may take some time"
    />
  );
};

export const AgentsViewError = () => {
  return (
    <ErrorState
      title="Error Loading Agents"
      description="Something went wrong"
    />
  );
};
