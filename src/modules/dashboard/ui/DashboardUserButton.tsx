import { GeneratedAvatar } from "@/components/generated-avatar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { authClient } from "@/lib/auth-client";
import { ChevronDownIcon, CreditCardIcon, LogOutIcon, SettingsIcon } from "lucide-react";
import { useRouter } from "next/navigation";

export const DashboardUserButton = () => {
  const isMobile = useIsMobile();
  const router = useRouter();
  const { data, isPending } = authClient.useSession();

  if (isPending || !data?.user) {
    return null;
  }

  const onLogout = async () => {
    try {
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => router.push("/sign-in"),
          onError: (error) => console.error("Logout failed:", error),
        },
      });
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  if (isMobile) {
    return (
      <Drawer>
        <DrawerTrigger className="rounded-xl border border-green-200 p-3 w-full flex items-center justify-between bg-white/50 hover:bg-white transition-all overflow-hidden">
          {data.user.image ? (
            <Avatar className="size-9 mr-3">
              <AvatarImage src={data.user.image} alt={`${data.user.name}'s avatar`} />
              <AvatarFallback>{data.user.name?.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
          ) : (
            <GeneratedAvatar seed={data.user.name || "User"} variant="initials" className="size-9 mr-3" />
          )}
          <div className="flex flex-col gap-0.5 text-left overflow-hidden flex-1 min-w-0">
            <p className="text-sm font-medium text-[#1a3d2e] truncate">{data.user.name}</p>
          </div>
          <ChevronDownIcon className="size-4 shrink-0 text-[#5a7a6a]" />
        </DrawerTrigger>
        <DrawerContent className="bg-white border-green-200">
          <DrawerHeader>
            <DrawerTitle className="text-[#1a3d2e]">{data.user.name}</DrawerTitle>
            <DrawerDescription className="text-[#5a7a6a]">{data.user.email}</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>
            <Button variant="outline" className="border-green-200 bg-white text-[#1a3d2e] hover:bg-green-50">
              <CreditCardIcon className="size-4 mr-2" /> Billing
            </Button>
            <Button variant="outline" className="border-green-200 bg-white text-[#1a3d2e] hover:bg-green-50" onClick={onLogout}>
              <LogOutIcon className="size-4 mr-2" /> Logout
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-xl border border-green-200 p-3 w-full flex items-center justify-between bg-white hover:bg-green-50 transition-all overflow-hidden">
        {data.user.image ? (
          <Avatar className="size-9 mr-3">
            <AvatarImage src={data.user.image} alt={`${data.user.name}'s avatar`} />
            <AvatarFallback className="bg-green-100 text-green-600">{data.user.name?.charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
        ) : (
          <GeneratedAvatar seed={data.user.name || "User"} variant="initials" className="size-9 mr-3" />
        )}
        <div className="flex flex-col gap-0.5 text-left overflow-hidden flex-1 min-w-0">
          <p className="text-sm font-medium text-[#1a3d2e] truncate">{data.user.name}</p>
        </div>
        <ChevronDownIcon className="size-4 shrink-0 text-[#5a7a6a]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-white border-green-200">
        <DropdownMenuLabel>
          <div className="flex flex-col gap-1">
            <span className="font-medium text-[#1a3d2e]">{data.user.name}</span>
            <span className="text-sm text-[#5a7a6a]">{data.user.email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-green-100" />
        <DropdownMenuItem className="text-[#3d5a48] focus:bg-green-50 focus:text-[#1a3d2e]">
          <SettingsIcon className="size-4 mr-2" /> Settings
        </DropdownMenuItem>
        <DropdownMenuItem className="text-[#3d5a48] focus:bg-green-50 focus:text-[#1a3d2e]">
          <CreditCardIcon className="size-4 mr-2" /> Billing
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-green-100" />
        <DropdownMenuItem onClick={onLogout} className="text-red-500 focus:bg-red-50 focus:text-red-600">
          <LogOutIcon className="size-4 mr-2" /> Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
