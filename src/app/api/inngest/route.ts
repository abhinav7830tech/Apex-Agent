import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import {
  billingReservationReconciliation,
  billingUsageReconciliation,
  meetingReminders,
  meetingsProcessing,
  meetingsProcessingReconciliation,
} from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    meetingsProcessing,
    meetingsProcessingReconciliation,
    meetingReminders,
    billingReservationReconciliation,
    billingUsageReconciliation,
  ],
});
