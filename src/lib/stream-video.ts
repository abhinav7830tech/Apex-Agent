import "server-only";

import { StreamClient } from "@stream-io/node-sdk";

// Production historically used NEXT_PUBLIC_STREAM_VIDEO_API_KEY while some
// environments only define NEXT_PUBLIC_VIDEO_STREAM_API_KEY. Accept both.
const streamApiKey =
  process.env.NEXT_PUBLIC_STREAM_VIDEO_API_KEY ??
  process.env.NEXT_PUBLIC_VIDEO_STREAM_API_KEY;

export const isStreamConfigured = () =>
  Boolean(streamApiKey && process.env.STREAM_VIDEO_SECRET_KEY);

export const streamVideo = new StreamClient(
  streamApiKey!,
  process.env.STREAM_VIDEO_SECRET_KEY!,
);
