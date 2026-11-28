"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useCallback, useState, type FormEvent } from "react";

export function AccountSettingsForm({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(name);
  const [savedName, setSavedName] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const updatedName = displayName.trim();
  const needsName = updatedName.length === 0;
  const canSave = !saving && !needsName && updatedName !== savedName;

  const syncNameInput = useCallback((input: HTMLInputElement | null) => {
    // The browser can accept an edit before React hydrates the form.
    if (input) setDisplayName(input.value);
  }, []);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSave) return;

    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const { data, error } = await authClient.updateUser({ name: updatedName });
      if (data?.status !== true) {
        setError(error?.message || "Could not confirm your profile was saved. Try again.");
        return;
      }
      setSavedName(updatedName);
      setDisplayName(updatedName);
      setSaved(true);
      router.refresh();
    } catch {
      setError("Could not save your profile. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={saveProfile} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="profile-name">Display name</Label>
        <Input
          ref={syncNameInput}
          id="profile-name"
          name="name"
          autoComplete="name"
          value={displayName}
          onChange={(event) => {
            setDisplayName(event.target.value);
            setSaved(false);
            setError("");
          }}
          aria-invalid={needsName}
          aria-describedby={needsName ? "profile-name-error" : undefined}
          disabled={saving}
          required
        />
        {needsName && <p id="profile-name-error" className="text-sm text-destructive">Enter a display name.</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-email">Account email</Label>
        <Input id="profile-email" type="email" value={email} readOnly />
      </div>
      <Button type="submit" disabled={!canSave}>{saving ? "Saving…" : "Save profile"}</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {saved && <p role="status" className="text-sm text-green-700">Profile saved.</p>}
    </form>
  );
}
