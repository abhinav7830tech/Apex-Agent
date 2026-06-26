import { ResponsiveDialog } from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import type { ReactElement } from "react";

export const useConfirm = (
  title: string,
  description: string,
  confirmText: string = "Confirm",
  cancelText: string = "Cancel"
): [() => ReactElement, () => Promise<boolean>] => {
  const [promise, setPromise] = useState<{
    resolve: (value: boolean) => void;
  } | null>(null);

  const confirm = (): Promise<boolean> => {
    return new Promise((resolve) => {
      setPromise({ resolve });
    });
  };

  const handleClose = () => {
    // Resolve with false to prevent hanging promises
    promise?.resolve(false);
    setPromise(null);
  };

  const handleConfirm = () => {
    promise?.resolve(true);
    setPromise(null);
  };

  const handleCancel = () => {
    promise?.resolve(false);
    setPromise(null);
  };

  const ConfirmationDialog = (): ReactElement => (
    <ResponsiveDialog
      open={promise !== null}
      onOpenChange={handleClose}
      title={title}
      description={description}
    >
      <div className="pt-4 flex flex-col-reverse gap-y-2 lg:flex-row lg:gap-x-2 items-center justify-end">
        <Button
          onClick={handleCancel}
          variant="outline"
          className="w-full lg:w-auto"
        >
          {cancelText}
        </Button>
        <Button
          onClick={handleConfirm}
          className="w-full lg:w-auto"
        >
          {confirmText}
        </Button>
      </div>
    </ResponsiveDialog>
  );

  return [ConfirmationDialog, confirm];
};