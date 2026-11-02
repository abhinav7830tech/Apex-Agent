"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { useTRPC } from "@/trpc/client";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CommandSelect } from "@/components/command-select";
import { GeneratedAvatar } from "@/components/generated-avatar";
import { NewAgentDialog } from "@/modules/agents/ui/components/new-agent-dialog";
import { meetingsInsertSchema } from "../../schemas";
import { MeetingGetOne } from "../../types";
import {
  toDatetimeLocalValue,
  toZonedDatetimeLocalValue,
  zonedDateTimeToUtc,
} from "../../utils";

interface MeetingFormProps {
  onSuccess?: (id?: string) => void;
  onCancel?: () => void;
  initialValues?: MeetingGetOne;
}

const getDefaultScheduledAt = () => {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(0, 0, 0);
  return toDatetimeLocalValue(date);
};

const getBrowserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

export const MeetingForm = ({
  onSuccess,
  onCancel,
  initialValues,
}: MeetingFormProps) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [openNewDialog, setOpenNewDialog] = useState(false);
  const [agentSearch, setAgentSearch] = useState("");
  const [participantsInput, setParticipantsInput] = useState(
    initialValues?.participants?.join(", ") ?? "",
  );

  const timezone = initialValues?.timezone ?? getBrowserTimezone();

  const agents = useQuery(
    trpc.agents.getMany.queryOptions({
      pageSize: 100,
      search: agentSearch,
    }),
  );

  const invalidateMeetings = async (meetingId?: string) => {
    await queryClient.invalidateQueries({
      queryKey: trpc.meetings.getMany.queryKey({}),
    });
    if (meetingId) {
      await queryClient.invalidateQueries({
        queryKey: trpc.meetings.getOne.queryKey({ id: meetingId }),
      });
    }
  };

  const createMeeting = useMutation(
    trpc.meetings.create.mutationOptions({
      onSuccess: async (data) => {
        await invalidateMeetings(data.id);
        onSuccess?.(data.id);
        toast.success("Meeting scheduled successfully.");
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const updateMeeting = useMutation(
    trpc.meetings.update.mutationOptions({
      onSuccess: async (data) => {
        await invalidateMeetings(data.id);
        onSuccess?.(data.id);
        toast.success("Meeting updated successfully.");
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const form = useForm<
    z.input<typeof meetingsInsertSchema>,
    unknown,
    z.infer<typeof meetingsInsertSchema>
  >({
    resolver: zodResolver(meetingsInsertSchema),
    defaultValues: {
      name: initialValues?.name ?? "",
      description: initialValues?.description ?? "",
      agentId: initialValues?.agentId ?? "",
      isInstant: false,
      passcode: "",
      scheduledAt: initialValues?.scheduledAt
        ? toZonedDatetimeLocalValue(initialValues.scheduledAt, timezone)
        : getDefaultScheduledAt(),
      durationMinutes: initialValues?.durationMinutes ?? 30,
      timezone,
      participants: initialValues?.participants ?? [],
      visibility: initialValues?.visibility === "public" ? "public" : "private",
    },
  });

  const isEdit = !!initialValues?.id;
  const isPending = createMeeting.isPending || updateMeeting.isPending;
  const isInstant = form.watch("isInstant");

  const onSubmit = (values: z.infer<typeof meetingsInsertSchema>) => {
    let scheduledAtUtc: Date | null = null;
    if (values.isInstant) {
      scheduledAtUtc = new Date();
    } else if (values.scheduledAt) {
      scheduledAtUtc = zonedDateTimeToUtc(values.scheduledAt, values.timezone);
    }

    if (!values.isInstant && !scheduledAtUtc) {
      form.setError("scheduledAt", {
        message: "Enter a valid meeting date and time.",
      });
      return;
    }

    const participants = participantsInput
      .split(",")
      .map((participant) => participant.trim())
      .filter(Boolean);

    const payload = {
      ...values,
      description: values.description?.trim() ? values.description.trim() : null,
      passcode: values.passcode?.trim() || undefined,
      scheduledAt: scheduledAtUtc ? scheduledAtUtc.toISOString() : undefined,
      participants,
    };

    if (isEdit) {
      updateMeeting.mutate({ ...payload, id: initialValues.id });
    } else {
      createMeeting.mutate(payload);
    }
  };

  return (
    <>
      <NewAgentDialog open={openNewDialog} onOpenChange={setOpenNewDialog} />
      <Form {...form}>
        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
          <FormField
            name="name"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Meeting title</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Weekly product sync" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            name="agentId"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>AI agent</FormLabel>
                <FormControl>
                  <CommandSelect
                    options={
                      agents.data?.items?.map((agent) => ({
                        id: agent.id,
                        value: agent.id,
                        label: agent.name,
                        logo: (
                          <GeneratedAvatar
                            seed={agent.name}
                            variant="botttsNeutral"
                            className="h-4 w-4"
                          />
                        ),
                      })) || []
                    }
                    value={field.value}
                    onSelect={field.onChange}
                    onSearch={setAgentSearch}
                    placeholder="Select an agent..."
                  />
                </FormControl>
                <FormDescription className="flex items-center gap-2">
                  Can&apos;t find your agent?{" "}
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0"
                    onClick={() => setOpenNewDialog(true)}
                  >
                    Create New Agent
                  </Button>
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {!isEdit && (
            <FormField
              name="isInstant"
              control={form.control}
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base font-semibold">Instant Meeting</FormLabel>
                    <FormDescription>
                      Start the meeting immediately. You will be able to join right away.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <input
                      type="checkbox"
                      checked={field.value}
                      onChange={field.onChange}
                      className="size-5 rounded border-gray-300 accent-emerald-600"
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {!isInstant && (
              <FormField
                name="scheduledAt"
                control={form.control}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date and time</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              name="durationMinutes"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Duration (minutes)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={5}
                      max={480}
                      step={5}
                      {...field}
                      onChange={(event) =>
                        field.onChange(Number(event.target.value))
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="passcode"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Passcode (optional)</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Auto-generated if left empty"
                      maxLength={20}
                    />
                  </FormControl>
                  <FormDescription>
                    Leave blank to auto-generate a secure 6-digit passcode.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            name="timezone"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Timezone</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="America/New_York" />
                </FormControl>
                <FormDescription>
                  Use an IANA timezone such as America/New_York or Asia/Kolkata.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormItem>
            <FormLabel>Participants</FormLabel>
            <FormControl>
              <Input
                value={participantsInput}
                onChange={(event) => setParticipantsInput(event.target.value)}
                placeholder="alex@example.com, sam@example.com"
              />
            </FormControl>
            <FormDescription>
              Separate participants with commas. This is optional.
            </FormDescription>
          </FormItem>

          <FormField
            name="description"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Agenda / description</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    value={field.value ?? ""}
                    rows={3}
                    placeholder="What should this meeting cover?"
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
                Cancel
              </Button>
            )}
            <Button disabled={isPending} type="submit">
              {isEdit ? "Save changes" : "Schedule meeting"}
            </Button>
          </div>
        </form>
      </Form>
    </>
  );
};
