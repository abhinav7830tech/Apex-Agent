'use client'

import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

interface ResponsiveDialogProps {
  title: string;
  description: string;
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
  scrollable?: boolean;
}

export const ResponsiveDialog = ({
  title,
  description,
  children,
  open,
  onOpenChange,
  className,
  scrollable = false,
}: ResponsiveDialogProps) => {
  const isMobile = useIsMobile();
  const scrollClasses = scrollable && "min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-y-contain";

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className={cn(
          className,
          "max-h-[90vh]",
          scrollable && "overflow-hidden data-[vaul-drawer-direction=bottom]:max-h-[90vh] supports-[height:100dvh]:data-[vaul-drawer-direction=bottom]:max-h-[90dvh]",
        )}>
          <DrawerHeader className={cn("text-left", scrollable && "shrink-0")}>
            <DrawerTitle className="text-lg font-semibold">
              {title}
            </DrawerTitle>
            <DrawerDescription className="text-sm text-muted-foreground">
              {description}
            </DrawerDescription>
          </DrawerHeader>
          <div className={cn("px-4 pb-4 overflow-auto", scrollClasses)}>
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        className,
        "max-w-lg",
        scrollable && "flex max-h-[90vh] flex-col overflow-hidden supports-[height:100dvh]:max-h-[90dvh]",
      )}>
        <DialogHeader className={cn(scrollable && "shrink-0")}>
          <DialogTitle className="text-lg font-semibold">
            {title}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>
        <div className={cn("mt-4", scrollClasses)}>
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
};
