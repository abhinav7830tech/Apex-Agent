"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  CheckIcon,
  CopyIcon,
  LinkIcon,
  LoaderIcon,
  RefreshCwIcon,
  UserPlusIcon,
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
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const InviteGuestsDialog = ({
  meetingId,
  open,
  onOpenChange,
}: Props) => {
  const trpc = useTRPC();
  const [requireAccount, setRequireAccount] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const { mutate } = createInvite;

  useEffect(() => {
    if (!open) return;
    // Do not send `requireAccount` here. Omitting it keeps the setting of an
    // existing invitation intact; the response below syncs the checkbox.
    mutate({ meetingId });
    // `mutate` is stable across renders; re-running on every mutation state
    // change would create an infinite loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, meetingId]);

  useEffect(() => {
    if (!open) {
      setCopied(false);
      return;
    }
    if (createInvite.data) {
      setRequireAccount(createInvite.data.requireAccount);
    }
  }, [open, createInvite.data]);

  const copyLink = async () => {
    if (!createInvite.data?.url) return;

    try {
      await navigator.clipboard.writeText(createInvite.data.url);
      setCopied(true);
      toast.success("Guest invitation link copied.");
    } catch {
      toast.error("Could not copy the link. Select it and copy manually.");
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlusIcon className="size-5" />
            Invite guests
          </DialogTitle>
          <DialogDescription>
            Share this link with people outside your workspace. Guests do not
            need an Apex Agent account unless you enable the option below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {createInvite.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderIcon className="size-4 animate-spin" />
              Creating a secure invitation link...
            </div>
          )}

          {createInvite.isError && !createInvite.isPending && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {createInvite.error.message}
            </div>
          )}

          {createInvite.data && (
            <>
              <div className="space-y-2">
                <Label htmlFor="guest-invite-url">Invitation link</Label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <LinkIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="guest-invite-url"
                      readOnly
                      value={createInvite.data.url}
                      className="pl-9 font-mono text-xs"
                      onFocus={(event) => event.currentTarget.select()}
                    />
                  </div>
                  <Button type="button" variant="outline" onClick={copyLink}>
                    {copied ? (
                      <CheckIcon className="size-4" />
                    ) : (
                      <CopyIcon className="size-4" />
                    )}
                    <span className="ml-2 hidden sm:inline">
                      {copied ? "Copied" : "Copy"}
                    </span>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Expires{" "}
                  {new Date(createInvite.data.expiresAt).toLocaleString()}.
                  Guests join at this link without installing anything.
                </p>
              </div>

              <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-primary"
                  checked={requireAccount}
                  onChange={(event) =>
                    handleRequireAccountChange(event.target.checked)
                  }
                  disabled={createInvite.isPending}
                />
                <span>
                  <span className="font-medium">
                    Require guests to sign in
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    When enabled, only signed-in Apex Agent users can join this
                    link.
                  </span>
                </span>
              </label>
            </>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={regenerate}
            disabled={createInvite.isPending}
          >
            <RefreshCwIcon className="mr-2 size-4" />
            New link
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
