"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useMutation } from "@tanstack/react-query";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  KeyRoundIcon,
  LoaderIcon,
  UserIcon,
  VideoIcon,
} from "lucide-react";
import { toast } from "sonner";

import { useTRPC } from "@/trpc/client";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GuestCall } from "@/modules/join/ui/components/guest-call";

export default function JoinMeetingPage() {
  const trpc = useTRPC();
  const { data: session } = authClient.useSession();

  const [meetingId, setMeetingId] = useState("");
  const [passcode, setPasscode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [callSession, setCallSession] = useState<{
    meetingId: string;
    meetingName: string;
    hostName: string;
    userId: string;
    userName: string;
    userImage: string;
    streamToken: string;
    inviteToken: string;
  } | null>(null);

  const joinMutation = useMutation(
    trpc.meetings.joinByMeetingId.mutationOptions({
      onError: (err) => {
        setError(err.message);
        toast.error(err.message);
      },
    }),
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const mId = meetingId.trim();
    const code = passcode.trim();
    const name = session?.user?.name || displayName.trim();

    if (!mId) {
      setError("Please enter a Meeting ID.");
      return;
    }
    if (!code) {
      setError("Please enter the meeting passcode.");
      return;
    }
    if (!name || name.length < 2) {
      setError("Please enter a display name with at least 2 characters.");
      return;
    }

    try {
      const result = await joinMutation.mutateAsync({
        meetingId: mId,
        passcode: code,
        displayName: name,
      });

      setCallSession({
        meetingId: mId,
        meetingName: result.meeting.name,
        hostName: result.meeting.hostName,
        userId: result.userId,
        userName: result.userName,
        userImage: result.userImage,
        streamToken: result.streamToken,
        inviteToken: result.inviteToken,
      });
    } catch {
      // Handled in onError
    }
  };

  if (callSession) {
    return (
      <GuestCall
        meetingId={callSession.meetingId}
        meetingName={callSession.meetingName}
        hostName={callSession.hostName}
        userId={callSession.userId}
        userName={callSession.userName}
        userImage={callSession.userImage}
        streamToken={callSession.streamToken}
        inviteToken={callSession.inviteToken}
        onExit={() => {
          setCallSession(null);
          setPasscode("");
        }}
      />
    );
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[radial-gradient(circle,_#0F5A44,_#062E24)] p-4 sm:p-6">
      <div className="w-full max-w-lg">
        <div className="rounded-2xl bg-white p-6 shadow-xl sm:p-8">
          <div className="mb-6 flex flex-col items-center text-center">
            <Link href="/" className="mb-3 flex items-center gap-2">
              <Image src="/logo.svg" alt="Apex Agent" width={40} height={40} />
              <span className="text-xl font-bold tracking-tight text-gray-900">
                Apex Agent
              </span>
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Join a Meeting</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter the Meeting ID and Passcode shared by the meeting host.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="meeting-id" className="flex items-center gap-1.5">
                <VideoIcon className="size-4 text-emerald-600" />
                Meeting ID
              </Label>
              <Input
                id="meeting-id"
                value={meetingId}
                onChange={(e) => setMeetingId(e.target.value)}
                placeholder="e.g. 5x8k2..."
                className="font-mono text-sm"
                autoComplete="off"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="meeting-passcode" className="flex items-center gap-1.5">
                <KeyRoundIcon className="size-4 text-emerald-600" />
                Meeting Passcode
              </Label>
              <Input
                id="meeting-passcode"
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="6-digit passcode"
                maxLength={32}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="display-name" className="flex items-center gap-1.5">
                <UserIcon className="size-4 text-emerald-600" />
                Your Display Name
              </Label>
              {session ? (
                <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  <CheckCircle2Icon className="size-4 text-emerald-600" />
                  Joining as <span className="font-medium">{session.user.name}</span>
                </div>
              ) : (
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  maxLength={80}
                  autoComplete="name"
                />
              )}
              <p className="text-xs text-muted-foreground">
                No account required. Other participants will see this name.
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700"
              disabled={joinMutation.isPending}
            >
              {joinMutation.isPending ? (
                <LoaderIcon className="mr-2 size-4 animate-spin" />
              ) : (
                <VideoIcon className="mr-2 size-4" />
              )}
              {joinMutation.isPending ? "Connecting..." : "Join Meeting"}
            </Button>
          </form>

          <div className="mt-6 border-t pt-4 text-center">
            <p className="text-xs text-muted-foreground">
              Have an invitation link instead? Open the shared link directly in your browser.
            </p>
            <div className="mt-2">
              <Button asChild variant="link" size="sm">
                <Link href="/sign-in">Host sign in</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
