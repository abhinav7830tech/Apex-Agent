"use client";
import { cn } from "@/lib/utils";
import { BotIcon, StarIcon, VideoIcon, HomeIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DashboardUserButton } from "./DashboardUserButton";

const firstSection = [
  { icon: HomeIcon, label: "Dashboard", href: "/" },
  { icon: VideoIcon, label: "Meeting", href: "/meetings" },
  { icon: BotIcon, label: "Agents", href: "/agents" },
];

const secondSection = [
  { icon: StarIcon, label: "About Developers", href: "/about-developers" },
];

export const DashboardSidebar = () => {
  const pathname = usePathname();
  return (
    <div className="flex h-screen w-64 flex-col bg-white border-r border-[#e2e8f0] fixed left-0 top-0 shadow-sm">
      {/* Sidebar Header */}
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="relative">
          <Image
            src="/logo.svg"
            height={40}
            width={40}
            alt="logo"
            className="relative rounded-xl shadow-sm"
          />
        </div>
        <div className="flex flex-col">
          <p className="text-lg font-bold tracking-wide text-[#0f172a]">Apex</p>
          <p className="text-xs text-indigo-500 -mt-1">Agents</p>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-5 mb-4 h-px bg-[#e2e8f0]" />

      {/* Main Navigation */}
      <div className="flex-1 overflow-auto px-3 space-y-6">
        {/* First Section */}
        <nav className="space-y-1">
          <p className="px-3 text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">Menu</p>
          {firstSection.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-indigo-50 text-indigo-600 border-l-2 border-indigo-500"
                    : "text-[#475569] hover:bg-slate-50 hover:text-[#0f172a]"
                )}
              >
                <item.icon className={cn("h-5 w-5 flex-shrink-0", isActive ? "text-indigo-500" : "text-[#94a3b8]")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Second Section */}
        <div>
          <div className="mx-3 mb-3 h-px bg-[#e2e8f0]" />
          <p className="px-3 text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-2">Settings</p>
          <nav className="space-y-1">
            {secondSection.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-indigo-50 text-indigo-600 border-l-2 border-indigo-500"
                      : "text-[#475569] hover:bg-slate-50 hover:text-[#0f172a]"
                  )}
                >
                  <item.icon className={cn("h-5 w-5 flex-shrink-0", isActive ? "text-indigo-500" : "text-[#94a3b8]")} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#e2e8f0] bg-white px-4 py-4 mt-auto">
        <DashboardUserButton />
      </footer>
    </div>
  );
};