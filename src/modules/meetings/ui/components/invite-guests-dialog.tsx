"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  CheckIcon,
  CopyIcon,
  KeyRoundIcon,
  LinkIcon,
  LoaderIcon,
  MessageCircleIcon,
  RefreshCwIcon,
  Share2Icon,
  UserPlusIcon,
  VideoIcon,
} from "lucide-react";
import { toast } from "sonner";

import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  meetingId: string;
  meetingTitle?: string;
  initialPasscode?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const InviteGuestsDialog = ({
  meetingId,
  meetingTitle,
  initialPasscode,
  open,
  onOpenChange,
}: Props) => {
  const trpc = useTRPC();
  const [requireAccount, setRequireAccount] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedPasscode, setCopiedPasscode] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [passcode, setPasscode] = useState(initialPasscode ?? "");

  const createInvite = useMutation(
    trpc.meetings.createInvite.mutationOptions({
      onError: (error) => toast.error(error.message),
      onSuccess: (data, variables) => {
        if (variables.regenerate) {
          toast.success("Previous invitation links were revoked.");
        }
      },
    }),
  );

  const newPasscodeMutation = useMutation(
    trpc.meetings.generateNewPasscode.mutationOptions({
      onSuccess: (data) => {
        setPasscode(data.passcode);
        toast.success("New 6-digit meeting passcode generated.");
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const { mutate } = createInvite;

  useEffect(() => {
    if (!open) return;
    mutate({ meetingId });
  }, [open, meetingId, mutate]);

  useEffect(() => {
    if (!open) {
      setCopiedLink(false);
      setCopiedId(false);
      setCopiedPasscode(false);
      setCopiedAll(false);
      return;
    }
    if (createInvite.data) {
      setRequireAccount(createInvite.data.requireAccount);
    }
  }, [open, createInvite.data]);

  const inviteUrl = createInvite.data?.url ?? "";

  const copyLink = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      toast.success("Guest invitation link copied.");
    } catch {
      toast.error("Could not copy the link.");
    }
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(meetingId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
      toast.success("Meeting ID copied.");
    } catch {
      toast.error("Could not copy Meeting ID.");
    }
  };

  const copyPasscode = async () => {
    if (!passcode) return;
    try {
      await navigator.clipboard.writeText(passcode);
      setCopiedPasscode(true);
      setTimeout(() => setCopiedPasscode(false), 2000);
      toast.success("Passcode copied.");
    } catch {
      toast.error("Could not copy Passcode.");
    }
  };

  const getFullShareText = () => {
    const title = meetingTitle || "Apex Agent Meeting";
    const lines = [
      `Apex Agent Meeting: ${title}`,
      "",
      `Meeting Link: ${inviteUrl}`,
      `Meeting ID: ${meetingId}`,
      passcode ? `Passcode: ${passcode}` : null,
      "",
      "Join directly in your browser without installing anything.",
    ].filter(Boolean);
    return lines.join("\n");
  };

  const copyAllDetails = async () => {
    const text = getFullShareText();
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2500);
      toast.success("Meeting details copied! Ready to share on WhatsApp or email.");
    } catch {
      toast.error("Could not copy details.");
    }
  };

  const handleShareWhatsApp = () => {
    const text = getFullShareText();
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title: meetingTitle || "Apex Agent Meeting",
          text: getFullShareText(),
          url: inviteUrl,
        });
      } catch {
        // User cancelled share
      }
    } else {
      void copyAllDetails();
    }
  };

  const handleRequireAccountChange = (checked: boolean) => {
    setRequireAccount(checked);
    mutate({ meetingId, requireAccount: checked });
  };

  const regenerate = () => {
    mutate({ meetingId, requireAccount, regenerate: true });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <UserPlusIcon className="size-5 text-emerald-600" />
            Share Meeting Details
          </DialogTitle>
          <DialogDescription>
            Invite participants by link or by Meeting ID & Passcode.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {createInvite.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderIcon className="size-4 animate-spin" />
              Generating secure meeting link...
            </div>
          )}

          {createInvite.isError && !createInvite.isPending && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {createInvite.error.message}
            </div>
          )}

          {createInvite.data && (
            <>
              {/* Meeting Link */}
              <div className="space-y-1.5">
                <Label htmlFor="guest-invite-url" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Meeting Link
                </Label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <LinkIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="guest-invite-url"
                      readOnly
                      value={inviteUrl}
                      className="pl-9 font-mono text-xs"
                      onFocus={(event) => event.currentTarget.select()}
                    />
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={copyLink}>
                    {copiedLink ? (
                      <CheckIcon className="size-4 text-emerald-600" />
                    ) : (
                      <CopyIcon className="size-4" />
                    )}
                    <span className="ml-1.5 hidden sm:inline">
                      {copiedLink ? "Copied" : "Copy Link"}
                    </span>
                  </Button>
                </div>
              </div>

              {/* Meeting ID & Passcode Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1.5">
                  <Label htmlFor="meeting-id-display" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Meeting ID
                  </Label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <VideoIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="meeting-id-display"
                        readOnly
                        value={meetingId}
                        className="pl-9 font-mono text-xs font-semibold"
                        onFocus={(event) => event.currentTarget.select()}
                      />
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={copyId}>
                      {copiedId ? (
                        <CheckIcon className="size-4 text-emerald-600" />
                      ) : (
                        <CopyIcon className="size-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="passcode-display" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Passcode
                    </Label>
                    <button
                      type="button"
                      className="text-[11px] text-emerald-600 hover:underline"
                      onClick={() => newPasscodeMutation.mutate({ meetingId })}
                      disabled={newPasscodeMutation.isPending}
                    >
                      {newPasscodeMutation.isPending ? "Generating..." : "Reset"}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <KeyRoundIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="passcode-display"
                        readOnly
                        value={passcode || "Click Reset"}
                        className="pl-9 font-mono text-xs font-semibold tracking-wider"
                        onFocus={(event) => event.currentTarget.select()}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={copyPasscode}
                      disabled={!passcode}
                    >
                      {copiedPasscode ? (
                        <CheckIcon className="size-4 text-emerald-600" />
                      ) : (
                        <CopyIcon className="size-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Fast Action Buttons: Copy All Details & WhatsApp */}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  type="button"
                  variant="default"
                  className="bg-emerald-600 hover:bg-emerald-700 flex-1 min-w-[160px]"
                  onClick={copyAllDetails}
                >
                  {copiedAll ? (
                    <CheckIcon className="size-4 mr-2" />
                  ) : (
                    <CopyIcon className="size-4 mr-2" />
                  )}
                  {copiedAll ? "Details Copied!" : "Copy Meeting Details"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                  onClick={handleShareWhatsApp}
                >
                  <MessageCircleIcon className="size-4 mr-2 text-emerald-600" />
                  WhatsApp
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleNativeShare}
                >
                  <Share2Icon className="size-4 mr-2" />
                  Share
                </Button>
              </div>

              <div className="rounded-lg border bg-muted/20 p-3 space-y-2 mt-2">
                <label className="flex items-start gap-3 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-emerald-600"
                    checked={requireAccount}
                    onChange={(event) =>
                      handleRequireAccountChange(event.target.checked)
                    }
                    disabled={createInvite.isPending}
                  />
                  <span>
                    <span className="font-medium text-foreground">
                      Require guests to sign in
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      When enabled, guests must log into an Apex Agent account. Uncheck to allow anyone with the link or ID + Passcode to join.
                    </span>
                  </span>
                </label>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={regenerate}
            disabled={createInvite.isPending}
          >
            <RefreshCwIcon className="mr-2 size-4" />
            Revoke &amp; New Link
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
