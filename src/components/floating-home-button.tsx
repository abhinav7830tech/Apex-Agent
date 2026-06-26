"use client";

import Link from "next/link";
import { HomeIcon } from "lucide-react";
import { usePathname } from "next/navigation";

export function FloatingHomeButton() {
  const pathname = usePathname();

  if (pathname === "/") return null;

  return (
    <Link
      href="/"
      className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-xl border border-gray-200 bg-white/80 backdrop-blur-md px-3.5 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-white hover:border-gray-300 hover:shadow-md hover:-translate-y-[1px] transition-all duration-200"
    >
      <HomeIcon className="h-4 w-4" />
      Home
    </Link>
  );
}
