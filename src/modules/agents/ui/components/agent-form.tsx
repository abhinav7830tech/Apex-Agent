
'use client'
import { useTRPC } from "@/trpc/client";
import { AgentGetOne } from "../../types";

import {  useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { agentsInsertSchema } from "../../schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { GeneratedAvatar } from "@/components/generated-avatar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface AgentFormProps {
  onSuccess?: () => void;
  onCancel?: () => void; // Fixed typo: onCancle -> onCancel
  initialValues?: AgentGetOne; // Fixed: removed () => function wrapper
}

export const AgentForm = ({
  onSuccess,
  onCancel,
  initialValues,
}: AgentFormProps) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  
  const createAgent = useMutation(
    trpc.agents.create.mutationOptions({
      onSuccess: async() => {
        await queryClient.invalidateQueries(
          trpc.agents.getMany.queryOptions({}),
        );
       
        onSuccess?.(); // Call success callback
        toast.success("Agent created successfully!");
      },
      onError: (error) => {
        toast.error(error.message);
      },
    })
  );
  
    const UpdateAgent = useMutation(
    trpc.agents.update.mutationOptions({
      onSuccess: async() => {
        await queryClient.invalidateQueries(
          trpc.agents.getMany.queryOptions({}),
        );
        if(initialValues?.id){
          await queryClient.invalidateQueries(
            trpc.agents.getOne.queryOptions({id: initialValues.id})
          ); 
        }
        onSuccess?.(); // Call success callback
        toast.success("Agent created successfully!");
      },
      onError: (error) => {
        toast.error(error.message);
      },
    })
  );
  const form = useForm<z.infer<typeof agentsInsertSchema>>({
    resolver: zodResolver(agentsInsertSchema),
    defaultValues: {
      name: initialValues?.name ?? "",
      instructions: initialValues?.instructions ?? "",
    },
  });

  const isEdit = !!initialValues?.id;
  const isPending = createAgent.isPending ||UpdateAgent.isPending;

  const onSubmit = (values: z.infer<typeof agentsInsertSchema>) => {
    if (isEdit) {
     UpdateAgent.mutate({...values,id:initialValues.id});
    } else {
      createAgent.mutate(values);
    }
  };

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <GeneratedAvatar
          seed={form.watch("name") || "default"}
          variant="botttsNeutral"
          className="border size-16"
        />
        
        <FormField
          name="name"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Neon" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          name="instructions"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Instructions</FormLabel> {/* Fixed capitalization */}
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="You are an assistant that helps me play good Valorant"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="flex justify-between gap-x-2">
          {onCancel && (
            <Button
              variant="ghost"
              disabled={isPending}
              type="button"
              onClick={() => onCancel()}
            >
              Cancel {/* Fixed typo: Cancle -> Cancel */}
            </Button>
          )}
          <Button disabled={isPending} type="submit">
            {isEdit ? "Update" : "Create"}
          </Button>
        </div>
      </form>
    </Form>
  );
};