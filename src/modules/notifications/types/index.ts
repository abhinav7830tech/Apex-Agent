export type NotificationType =
  | "meeting_reminder"
  | "meeting_started"
  | "meeting_ended"
  | "meeting_cancelled"
  | "meeting_updated"
  | "meeting_failed"
  | "summary_ready";

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  meetingId?: string | null;
  read: boolean;
  createdAt: Date | string;
}
