"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { BellIcon, CheckCheckIcon, Trash2Icon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTRPC } from "@/trpc/client";
import { cn } from "@/lib/utils";

const iconForType = (type: string) => {
  switch (type) {
    case "meeting_reminder":
      return "🔔";
    case "meeting_started":
      return "🎥";
    case "meeting_ended":
      return "✅";
    case "meeting_cancelled":
      return "❌";
    case "meeting_updated":
      return "✏️";
    case "meeting_failed":
      return "⚠️";
    case "summary_ready":
      return "📝";
    default:
      return "📢";
  }
};

export const NotificationsView = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery(
    trpc.notifications.getMany.queryOptions({ limit: 50 }),
  );

  const markAsRead = useMutation(
    trpc.notifications.markAsRead.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.notifications.getMany.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.notifications.getUnreadCount.queryKey(),
        });
      },
      onError: (mutationError) => toast.error(mutationError.message),
    }),
  );

  const markAllAsRead = useMutation(
    trpc.notifications.markAllAsRead.mutationOptions({
      onSuccess: () => {
        toast.success("All notifications marked as read");
        queryClient.invalidateQueries({
          queryKey: trpc.notifications.getMany.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.notifications.getUnreadCount.queryKey(),
        });
      },
      onError: (mutationError) => toast.error(mutationError.message),
    }),
  );

  const removeNotification = useMutation(
    trpc.notifications.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.notifications.getMany.queryKey(),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.notifications.getUnreadCount.queryKey(),
        });
      },
      onError: (mutationError) => toast.error(mutationError.message),
    }),
  );

  const unreadCount = data?.filter((item) => !item.read).length ?? 0;

  return (
    <div className="mx-auto w-full max-w-4xl p-6 md:p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1a3d2e]">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            Meeting reminders, AI summaries and failure alerts.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={unreadCount === 0 || markAllAsRead.isPending}
          onClick={() => markAllAsRead.mutate()}
        >
          <CheckCheckIcon className="mr-2 size-4" />
          Mark all read
        </Button>
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            {error.message}
          </CardContent>
        </Card>
      ) : !data || data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <BellIcon className="size-10 text-muted-foreground" />
            <p className="font-medium">No notifications yet</p>
            <p className="text-sm text-muted-foreground">
              Activity from your meetings and agents will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.map((notification) => (
            <Card
              key={notification.id}
              className={cn(!notification.read && "border-l-4 border-l-primary")}
            >
              <CardContent className="flex items-start gap-4 p-4">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-lg">
                  {iconForType(notification.type)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{notification.title}</p>
                    {!notification.read && (
                      <Badge variant="secondary">New</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {notification.message}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      {formatDistanceToNow(new Date(notification.createdAt), {
                        addSuffix: true,
                      })}
                    </span>
                    {notification.meetingId && (
                      <Link
                        href={`/meetings/${notification.meetingId}`}
                        className="font-medium text-primary hover:underline"
                      >
                        Open meeting
                      </Link>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!notification.read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => markAsRead.mutate({ id: notification.id })}
                    >
                      Mark read
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete notification"
                    onClick={() => removeNotification.mutate({ id: notification.id })}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
