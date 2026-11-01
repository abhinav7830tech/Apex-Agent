
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
        toast.success("Agent updated successfully!");
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
      description: initialValues?.description ?? "",
      role: initialValues?.role ?? "Meeting Assistant",
      avatarVariant: initialValues?.avatarVariant ?? "botttsNeutral",
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
          variant={
            form.watch("avatarVariant") === "initials"
              ? "initials"
              : "botttsNeutral"
          }
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
          name="role"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value ?? ""}
                  placeholder="Product meeting assistant"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          name="description"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  value={field.value ?? ""}
                  placeholder="What this agent specializes in"
                  rows={2}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          name="avatarVariant"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Avatar style</FormLabel>
              <div className="flex gap-2">
                {[
                  { value: "botttsNeutral", label: "Robot" },
                  { value: "initials", label: "Initials" },
                ].map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={
                      (field.value ?? "botttsNeutral") === option.value
                        ? "default"
                        : "outline"
                    }
                    onClick={() => field.onChange(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          name="instructions"
          control={form.control}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Instructions</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="You are a helpful meeting assistant. Keep answers concise and accurate."
                  rows={6}
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