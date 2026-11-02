"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CalendarClockIcon,
  CheckCircle2Icon,
  ClockIcon,
  LoaderIcon,
  LogInIcon,
  ShieldAlertIcon,
  UserIcon,
  UsersIcon,
  VideoIcon,
} from "lucide-react";
import { toast } from "sonner";

import { useTRPC } from "@/trpc/client";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatMeetingWindow } from "@/modules/meetings/utils";
import type { GuestJoinResult, MeetingGetInvite } from "@/modules/meetings/types";
import { GuestCall } from "../components/guest-call";

interface Props {
  meetingId: string;
}

type Stage = "name" | "waiting" | "lobby" | "call" | "ended";

const useCountdown = (target: string | null) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!target) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [target]);

  if (!target) return null;
  const remaining = Math.max(0, new Date(target).getTime() - now);
  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return { remaining, label: `${minutes}:${String(seconds).padStart(2, "0")}` };
};

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-screen w-full items-center justify-center bg-[radial-gradient(circle,_#0F5A44,_#062E24)] p-4 sm:p-6">
    <div className="w-full max-w-2xl">{children}</div>
  </div>
);

const Card = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl bg-white p-6 shadow-xl sm:p-8">{children}</div>
);

const MeetingSummary = ({ meeting }: { meeting: MeetingGetInvite["meeting"] }) => (
  <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-4">
    <div className="flex flex-wrap items-center gap-2">
      <h1 className="text-xl font-bold text-gray-900">{meeting.name}</h1>
      <Badge variant={meeting.status === "active" ? "default" : "secondary"}>
        {meeting.status === "active" ? "Live now" : "Scheduled"}
      </Badge>
    </div>
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <ClockIcon className="size-4" />
      {formatMeetingWindow(meeting.scheduledAt, meeting.durationMinutes)}
    </div>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <UserIcon className="size-4" /> Hosted by {meeting.hostName}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <VideoIcon className="size-4" /> AI agent: {meeting.agentName}
      </span>
      {meeting.participants.length > 0 && (
        <span className="inline-flex items-center gap-1.5">
          <UsersIcon className="size-4" /> {meeting.participants.length} invited
        </span>
      )}
    </div>
    {meeting.description && (
      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
        {meeting.description}
      </p>
    )}
  </div>
);

export const JoinView = ({ meetingId }: Props) => {
  const trpc = useTRPC();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { data: session, isPending: sessionPending } = authClient.useSession();

  const [stage, setStage] = useState<Stage>("name");
  const [displayName, setDisplayName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [passcodeError, setPasscodeError] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [identity, setIdentity] = useState<GuestJoinResult | null>(null);
  const autoJoinStarted = useRef(false);

  const inviteQuery = useQuery(
    trpc.meetings.getInvite.queryOptions(
      { meetingId, token: token ?? "" },
      {
        enabled: Boolean(token),
        retry: false,
        refetchInterval: stage === "waiting" ? 8000 : false,
      },
    ),
  );

  const guestJoin = useMutation(
    trpc.meetings.guestJoin.mutationOptions({
      onError: (error) => toast.error(error.message),
    }),
  );

  const meeting = inviteQuery.data?.meeting;
  const viewer = inviteQuery.data?.viewer;
  const countdown = useCountdown(meeting?.joinableAt ?? null);

  const joinAsGuest = async (name: string, enteredPasscode?: string) => {
    if (!token) return;

    setPendingName(name);

    // Enter the waiting room without creating a guest record or Stream token
    // until the meeting is actually joinable.
    if (meeting?.state === "waiting") {
      setStage("waiting");
      return;
    }

    try {
      const result = await guestJoin.mutateAsync({
        meetingId,
        token,
        displayName: name,
        passcode: enteredPasscode ?? passcode.trim() ?? undefined,
      });
      setIdentity(result);
      setStage("lobby");
    } catch (error) {
      // The mutation's onError already surfaces a toast. If the meeting
      // closed between the last poll and the submit, wait for it to reopen.
      const code = (error as { data?: { code?: string } })?.data?.code;
      if (code === "PRECONDITION_FAILED") {
        setStage("waiting");
      }
    }
  };

  // While waiting, poll the invitation and join automatically as soon as the
  // meeting opens. This is the waiting-room hand-off.
  useEffect(() => {
    if (stage !== "waiting" || !pendingName || !token) return;
    if (meeting?.state !== "joinable" || autoJoinStarted.current) return;

    autoJoinStarted.current = true;
    void guestJoin
      .mutateAsync({ meetingId, token, displayName: pendingName })
      .then((result) => {
        setIdentity(result);
        setStage("lobby");
      })
      .catch(() => undefined)
      .finally(() => {
        autoJoinStarted.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, pendingName, token, meeting?.state, meetingId]);

  if (!token) {
    return (
      <Shell>
        <Card>
          <div className="flex flex-col items-center gap-4 text-center">
            <ShieldAlertIcon className="size-10 text-red-500" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Invalid invitation link
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                This link is missing its invitation token. Ask the host to copy
                the full invitation URL again.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/">Go to Apex Agent</Link>
            </Button>
          </div>
        </Card>
      </Shell>
    );
  }

  if (inviteQuery.isPending || sessionPending) {
    return (
      <Shell>
        <Card>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <LoaderIcon className="size-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Checking your invitation...
            </p>
          </div>
        </Card>
      </Shell>
    );
  }

  if (inviteQuery.isError) {
    return (
      <Shell>
        <Card>
          <div className="flex flex-col items-center gap-4 text-center">
            <ShieldAlertIcon className="size-10 text-red-500" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                This meeting is not available
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {inviteQuery.error.message}
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/">Go to Apex Agent</Link>
            </Button>
          </div>
        </Card>
      </Shell>
    );
  }

  if (!meeting) return null;

  if (viewer?.isHost) {
    return (
      <Shell>
        <Card>
          <div className="flex flex-col items-center gap-4 text-center">
            <CheckCircle2Icon className="size-10 text-emerald-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                You are the host of this meeting
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Open the meeting room to start the call. Share the invitation
                link with guests so they can join from their own browser.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href={`/call/${meetingId}`}>
                  <VideoIcon className="mr-2 size-4" />
                  Open meeting room
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/meetings/${meetingId}`}>Meeting details</Link>
              </Button>
            </div>
          </div>
        </Card>
      </Shell>
    );
  }

  if (meeting.requireAccount && !session) {
    const redirectTo = `/join/${meetingId}?token=${encodeURIComponent(token)}`;
    return (
      <Shell>
        <Card>
          <div className="flex flex-col items-center gap-4 text-center">
            <ShieldAlertIcon className="size-10 text-amber-500" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                An account is required
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                The host requires guests to sign in before joining{" "}
                <span className="font-medium">{meeting.name}</span>. Sign in or
                create a free account, then you will return to this invitation.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link
                  href={`/sign-in?redirectTo=${encodeURIComponent(redirectTo)}`}
                >
                  <LogInIcon className="mr-2 size-4" />
                  Sign in
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link
                  href={`/sign-up?redirectTo=${encodeURIComponent(redirectTo)}`}
                >
                  Create an account
                </Link>
              </Button>
            </div>
          </div>
        </Card>
      </Shell>
    );
  }

  if (stage === "lobby" && identity) {
    return (
      <GuestCall
        meetingId={meetingId}
        meetingName={identity.meeting.name}
        hostName={identity.meeting.hostName}
        userId={identity.userId}
        userName={identity.userName}
        userImage={identity.userImage}
        streamToken={identity.streamToken}
        inviteToken={token}
        onExit={() => setStage("ended")}
      />
    );
  }

  if (stage === "ended") {
    return (
      <Shell>
        <Card>
          <div className="flex flex-col items-center gap-4 text-center">
            <CheckCircle2Icon className="size-10 text-emerald-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                You left the meeting
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                The meeting may still be running for other participants. You can
                rejoin with the same invitation link.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                onClick={() => {
                  setIdentity(null);
                  setStage("name");
                  void inviteQuery.refetch();
                }}
              >
                Rejoin meeting
              </Button>
              <Button asChild variant="outline">
                <Link href="/">Go to Apex Agent</Link>
              </Button>
            </div>
          </div>
        </Card>
      </Shell>
    );
  }

  if (stage === "waiting" || meeting.state === "waiting") {
    return (
      <Shell>
        <Card>
          <div className="space-y-5">
            <MeetingSummary meeting={meeting} />
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center">
              <CalendarClockIcon className="size-8 text-primary" />
              <h2 className="text-lg font-semibold text-gray-900">
                Waiting for the meeting to open
              </h2>
              <p className="max-w-md text-sm text-muted-foreground">
                {meeting.joinableAt
                  ? `The host has not started yet. You will be able to join in ${countdown?.label ?? "a moment"}. Keep this tab open; we will check automatically.`
                  : "The host has not started yet. Keep this tab open; we will check automatically."}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => void inviteQuery.refetch()}
                disabled={inviteQuery.isFetching}
              >
                {inviteQuery.isFetching ? (
                  <LoaderIcon className="mr-2 size-4 animate-spin" />
                ) : (
                  <ClockIcon className="mr-2 size-4" />
                )}
                Check again
              </Button>
            </div>
          </div>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card>
        <div className="space-y-5">
          <MeetingSummary meeting={meeting} />

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();

              if (meeting?.requiresPasscode && !passcode.trim()) {
                setPasscodeError("Passcode is required to join this meeting.");
                return;
              }

              if (session) {
                setPendingName(session.user.name);
                void joinAsGuest(session.user.name, passcode.trim());
                return;
              }

              const name = displayName.trim();
              if (name.length < 2) {
                setNameError("Enter a display name with at least 2 characters.");
                return;
              }

              setNameError(null);
              setPasscodeError(null);
              setPendingName(name);
              void joinAsGuest(name, passcode.trim());
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="guest-display-name">Your display name</Label>
              {session ? (
                <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  <CheckCircle2Icon className="size-4 text-emerald-600" />
                  Joining as <span className="font-medium">{session.user.name}</span>
                </div>
              ) : (
                <>
                  <Input
                    id="guest-display-name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="e.g. Priya from Acme"
                    maxLength={80}
                    autoComplete="name"
                    autoFocus
                  />
                  {nameError && (
                    <p className="text-xs text-red-500">{nameError}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    No account needed. This name is shown to other participants.
                  </p>
                </>
              )}
            </div>

            {meeting?.requiresPasscode && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="guest-passcode">Meeting Passcode</Label>
                  <span className="text-xs text-muted-foreground">Required</span>
                </div>
                <Input
                  id="guest-passcode"
                  type="password"
                  value={passcode}
                  onChange={(event) => {
                    setPasscode(event.target.value);
                    setPasscodeError(null);
                  }}
                  placeholder="Enter 6-digit passcode"
                  maxLength={32}
                  autoComplete="off"
                />
                {passcodeError && (
                  <p className="text-xs text-red-500">{passcodeError}</p>
                )}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={guestJoin.isPending}
            >
              {guestJoin.isPending ? (
                <LoaderIcon className="mr-2 size-4 animate-spin" />
              ) : (
                <VideoIcon className="mr-2 size-4" />
              )}
              {guestJoin.isPending ? "Joining..." : "Continue to meeting"}
            </Button>
          </form>
        </div>
      </Card>
    </Shell>
  );
};
