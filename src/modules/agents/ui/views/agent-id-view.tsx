"use client";
import { ErrorState } from "@/components/error-state";
import { LoadingState } from "@/components/loading-state";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { AgentIdViewHeader } from "../components/AgentIdViewHeader";
import { GeneratedAvatar } from "@/components/generated-avatar";
import { Badge } from "@/components/ui/badge";
import { VideoIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/use-confirm"; 
import { useState } from "react";
import { UpdateAgentDialog } from "../components/update-agent-dialog";

interface Props {
  agentId: string;
}

export const AgentIdView = ({ agentId }: Props) => {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  
  // State for update dialog
  const [updateAgentDialogOpen, setUpdateAgentDialogOpen] = useState(false);
  
  const { data } = useSuspenseQuery(
    trpc.agents.getOne.queryOptions({ id: agentId })
  );
 
  const removeAgent = useMutation(
    trpc.agents.remove.mutationOptions({
      onSuccess: async () => {
        queryClient.invalidateQueries(trpc.agents.getMany.queryOptions({}));
        router.push("/agents");
        toast.success("Agent removed successfully");
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const [RemoveConfirmation, confirmRemove] = useConfirm(
    "Remove this agent?",
    data.meetingCount > 0
      ? `This agent is attached to ${data.meetingCount} meeting${
          data.meetingCount === 1 ? "" : "s"
        }. Delete or reassign those meetings before removing the agent.`
      : "This permanently removes the agent. This action cannot be undone.",
    "Remove",
    "Cancel",
  );

  const handleRemoveAgent = async () => {
    const ok = await confirmRemove();
    if (!ok) return;

    try {
      await removeAgent.mutateAsync({ id: agentId });
    } catch {
      // The mutation's onError already surfaces the message.
    }
  };

  return (
    <>
      <UpdateAgentDialog
        open={updateAgentDialogOpen}
        onOpenChange={setUpdateAgentDialogOpen}
        initialValues={data}
      />
      <RemoveConfirmation />
      <div className="flex-1 py-4 px-4 md:px-8 flex flex-col gap-y-4">
        <div className="bg-gray-100 p-4 rounded-lg overflow-auto text-sm">
          <AgentIdViewHeader
            agentId={agentId}
            agentName={data.name}
            onEdit={() => setUpdateAgentDialogOpen(true)}
            onRemove={handleRemoveAgent}
          />
        </div>
        <div className="bg-white rounded-lg border">
          <div className="px-4 py-5 gap-y-5 flex flex-col">
            <div className="flex items-center gap-x-3">
              <GeneratedAvatar
                variant={
                  data.avatarVariant === "initials"
                    ? "initials"
                    : "botttsNeutral"
                }
                seed={data.name}
                className="size-10"
              />
              <div>
                <h1 className="text-2xl font-medium">{data.name}</h1>
                {data.role && (
                  <p className="text-sm text-muted-foreground">{data.role}</p>
                )}
              </div>
            </div>
            <Badge variant="outline" className="flex items-center gap-x-2 w-fit">
              <VideoIcon className="size-4" />
              {data.meetingCount}{" "}
              {data.meetingCount === 1 ? "meeting" : "meetings"}
            </Badge>
            {data.description && (
              <div className="flex flex-col gap-y-2">
                <p className="text-lg font-medium">Description</p>
                <p className="text-neutral-800 whitespace-pre-wrap">
                  {data.description}
                </p>
              </div>
            )}
            <div className="flex flex-col gap-y-4">
              <p className="text-lg font-medium">Instructions</p>
              <p className="text-neutral-800 whitespace-pre-wrap">
                {data.instructions}
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export const AgentIDViewLoading = () => {
  return (
    <LoadingState
      title="Loading Agent"
      description="This may take some time"
    />
  );
};

export const AgentsIDViewError = () => {
  return (
    <ErrorState
      title="Error Loading Agent"
      description="Something went wrong"
    />
  );
};