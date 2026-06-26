"use client";

import { Button } from "@/components/ui/button";
import { SearchIcon, BellIcon, XIcon, ChevronRightIcon, ClockIcon } from "lucide-react";
import { DashboardCommand } from "./dashboard-command";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/client";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

export const DashboardNavbar = () => {
  const [commandOpen, setCammandOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: notifications, isLoading, isError, error } = useQuery({
    ...trpc.notifications.getMany.queryOptions({ limit: 10 }),
    enabled: notificationsOpen,
  });

  const { data: unreadCount } = useQuery({
    ...trpc.notifications.getUnreadCount.queryOptions(),
  });

  const { data: completedMeetings } = useQuery({
    ...trpc.notifications.getCompletedMeetings.queryOptions({ limit: 3 }),
  });

  const { data: upcomingMeetings } = useQuery({
    ...trpc.notifications.getUpcomingMeetings.queryOptions({ limit: 3 }),
  });

  const markAsRead = useMutation({
    ...trpc.notifications.markAsRead.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.notifications.getUnreadCount.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.notifications.getMany.queryKey() });
      },
    }),
  });

  const markAllAsRead = useMutation({
    ...trpc.notifications.markAllAsRead.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.notifications.getUnreadCount.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.notifications.getMany.queryKey() });
      },
    }),
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCammandOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "meeting_reminder": return "🔔";
      case "meeting_started": return "🎥";
      case "meeting_ended": return "✅";
      case "meeting_cancelled": return "❌";
      case "summary_ready": return "📝";
      default: return "📢";
    }
  };

  const getNotificationLink = (type: string, meetingId?: string | null) => {
    if (!meetingId) return "#";
    return `/meetings/${meetingId}`;
  };

  return (
    <>
      <DashboardCommand open={commandOpen} setOpen={setCammandOpen} />
      <nav className="flex items-center justify-between px-6 py-3 border-b border-[#b8e8ce] bg-white/70 backdrop-blur-xl relative z-40">
        <div className="flex items-center gap-x-3">
          <Button
            className="h-10 w-[260px] justify-start font-normal text-[#5a7a6a] bg-[#e8f5ef] hover:bg-[#d4f0e1] hover:text-[#1a3d2e] border border-[#b8e8ce] transition-all duration-200"
            variant="outline"
            size="sm"
            onClick={() => setCammandOpen((open) => !open)}
          >
            <SearchIcon className="h-4 w-4 mr-2 text-[#5a7a6a]" />
            <span className="text-[#5a7a6a]">Search...</span>
            <kbd className="ml-auto pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-[#b8e8ce] bg-white px-1.5 font-mono text-[10px] font-medium text-[#5a7a6a]">
              <span className="text-xs">⌘K</span>
            </kbd>
          </Button>
        </div>
        
        <div className="flex items-center gap-x-3 relative">
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="text-[#5a7a6a] hover:text-[#1a3d2e] hover:bg-green-100 relative"
              onClick={() => setNotificationsOpen(!notificationsOpen)}
            >
              <BellIcon className="h-5 w-5" />
              {unreadCount?.count ? (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 bg-green-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                  {Number(unreadCount.count) > 9 ? "9+" : unreadCount.count}
                </span>
              ) : null}
            </Button>

            {notificationsOpen && (
              <>
                <div 
                  className="fixed inset-0 z-[9998]" 
                  onClick={() => setNotificationsOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 w-[380px] bg-white border border-[#b8e8ce] rounded-2xl shadow-2xl shadow-green-100/50 z-[9999] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8f5ef] bg-gradient-to-r from-green-50/50 to-white">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-green-100 rounded-lg">
                      <BellIcon className="h-4 w-4 text-green-600" />
                    </div>
                    <h3 className="font-bold text-[#1a3d2e] text-lg">Notifications</h3>
                    {unreadCount?.count ? (
                      <span className="px-2 py-0.5 bg-green-500 text-white text-xs font-medium rounded-full">
                        {unreadCount.count} new
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {unreadCount?.count ? (
                      <button onClick={() => markAllAsRead.mutate()} className="text-xs font-medium text-green-600 hover:text-green-700 px-3 py-1.5 hover:bg-green-50 rounded-lg transition-colors">
                        Mark all read
                      </button>
                    ) : null}
                    <button onClick={() => setNotificationsOpen(false)} className="p-1.5 text-[#5a7a6a] hover:text-[#1a3d2e] hover:bg-green-50 rounded-lg transition-colors">
                      <XIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="max-h-[480px] overflow-y-auto scrollbar-thin scrollbar-thumb-green-200 scrollbar-track-transparent">
                  {upcomingMeetings && upcomingMeetings.length > 0 && (
                    <div className="px-5 py-4 border-b border-[#e8f5ef] bg-gradient-to-r from-blue-50/30 to-transparent">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-sm">📅</span>
                        <h4 className="text-xs font-bold text-[#5a7a6a] uppercase tracking-wider">Upcoming Meetings</h4>
                      </div>
                      <div className="space-y-2">
                        {upcomingMeetings.map((meeting) => (
                          <a
                            key={meeting.id}
                            href={`/meetings/${meeting.id}`}
                            className="flex items-center gap-3 p-3 rounded-xl hover:bg-green-50 transition-all duration-200 group"
                            onClick={() => setNotificationsOpen(false)}
                          >
                            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-lg shadow-sm">
                              📅
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-[#1a3d2e] truncate group-hover:text-green-700 transition-colors">{meeting.name}</p>
                              <p className="text-xs text-[#7a9a8a] flex items-center gap-1">
                                <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                                {meeting.status}
                              </p>
                            </div>
                            <ChevronRightIcon className="h-4 w-4 text-[#b8e8ce] group-hover:text-green-500 transition-colors" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {completedMeetings && completedMeetings.length > 0 && (
                    <div className="px-5 py-4 border-b border-[#e8f5ef] bg-gradient-to-r from-purple-50/30 to-transparent">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-sm">✅</span>
                        <h4 className="text-xs font-bold text-[#5a7a6a] uppercase tracking-wider">Completed Meetings</h4>
                      </div>
                      <div className="space-y-2">
                        {completedMeetings.map((meeting) => (
                          <a
                            key={meeting.id}
                            href={`/meetings/${meeting.id}`}
                            className="flex items-center gap-3 p-3 rounded-xl hover:bg-green-50 transition-all duration-200 group"
                            onClick={() => setNotificationsOpen(false)}
                          >
                            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-lg shadow-sm">
                              {meeting.status === "completed" ? "✅" : "⚙️"}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-[#1a3d2e] truncate group-hover:text-green-700 transition-colors">{meeting.name}</p>
                              <p className="text-xs text-[#7a9a8a] line-clamp-1">
                                {meeting.summary || meeting.status}
                              </p>
                            </div>
                            <ChevronRightIcon className="h-4 w-4 text-[#b8e8ce] group-hover:text-green-500 transition-colors" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="px-5 py-3 border-t border-[#e8f5ef] bg-gray-50/50">
                    <h4 className="text-xs font-bold text-[#5a7a6a] uppercase tracking-wider flex items-center gap-2">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                      All Notifications
                    </h4>
                  </div>
                  {isLoading ? (
                    <div className="p-8 text-center">
                      <div className="w-8 h-8 border-3 border-green-200 border-t-green-500 rounded-full animate-spin mx-auto mb-3"></div>
                      <p className="text-sm text-[#5a7a6a]">Loading notifications...</p>
                    </div>
                  ) : isError ? (
                    <div className="p-6 text-center">
                      <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <XIcon className="h-6 w-6 text-red-500" />
                      </div>
                      <p className="text-sm text-red-600 font-medium">Failed to load</p>
                      <p className="text-xs text-red-400 mt-1">{error?.message || "Something went wrong"}</p>
                    </div>
                  ) : !notifications || notifications.length === 0 ? (
                    <div className="p-8 text-center">
                      <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <BellIcon className="h-8 w-8 text-green-300" />
                      </div>
                      <p className="text-[#1a3d2e] font-semibold mb-1">All caught up!</p>
                      <p className="text-sm text-[#7a9a8a]">No new notifications at the moment</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-[#e8f5ef]">
                      {notifications?.map((notification) => (
                        <a
                          key={notification.id}
                          href={getNotificationLink(notification.type, notification.meetingId)}
                          className={cn(
                            "flex items-start gap-4 px-5 py-4 hover:bg-green-50 transition-all duration-200 group",
                            !notification.read && "bg-green-50/70"
                          )}
                          onClick={() => {
                            if (!notification.read) markAsRead.mutate({ id: notification.id });
                            setNotificationsOpen(false);
                          }}
                        >
                          <div className={cn(
                            "w-11 h-11 rounded-xl flex items-center justify-center text-xl shadow-sm transition-transform group-hover:scale-110",
                            !notification.read ? "bg-gradient-to-br from-green-400 to-green-500" : "bg-gray-100"
                          )}>
                            {getNotificationIcon(notification.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={cn("text-sm font-semibold truncate", notification.read ? "text-[#5a7a6a]" : "text-[#1a3d2e]")}>
                                {notification.title}
                              </p>
                              {!notification.read && (
                                <span className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></span>
                              )}
                            </div>
                            <p className="text-xs text-[#7a9a8a] line-clamp-2 mt-1 leading-relaxed">{notification.message}</p>
                            <p className="text-xs text-[#a0baba] mt-2 flex items-center gap-1">
                              <ClockIcon className="h-3 w-3" />
                              {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                            </p>
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                <a href="/notifications" className="flex items-center justify-center gap-2 px-5 py-4 text-sm font-medium text-green-600 hover:text-green-700 border-t border-[#e8f5ef] hover:bg-green-50 transition-colors">
                  View all notifications
                  <ChevronRightIcon className="h-4 w-4" />
                </a>
              </div>
              </>
            )}
          </div>
        </div>
      </nav>
    </>
  );
};
