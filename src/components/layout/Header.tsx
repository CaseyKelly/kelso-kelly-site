"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/data/site-config";

const navigation = [
  { name: "Home", href: "/" },
  { name: "Photos & Videos", href: "/media" },
  { name: "Schedule", href: "/schedule" },
  { name: "Bio", href: "/bio" },
  { name: "Song List", href: "/songs" },
  { name: "Contact", href: "/contact" },
];

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[rgba(10,7,4,0.92)] backdrop-blur-md border-b border-[rgba(245,158,11,0.12)]">
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center">
            <Link href="/" className="group">
              <span className="font-display text-xl font-bold text-white group-hover:text-amber-400 transition-colors tracking-tight">
                <em className="not-italic italic text-amber-400">Kelso</em>{" "}Kelly
              </span>
            </Link>
          </div>

          <div className="hidden md:flex md:items-center md:gap-1">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "px-4 py-2 text-sm font-medium tracking-wide transition-colors",
                  pathname === item.href
                    ? "text-amber-400 border-b-2 border-amber-500"
                    : "text-zinc-400 hover:text-white"
                )}
              >
                {item.name}
              </Link>
            ))}
          </div>

          <div className="md:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-zinc-400 hover:text-white transition-colors"
            >
              {mobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-[rgba(245,158,11,0.12)]">
            <div className="flex flex-col gap-1">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "px-4 py-3 text-base font-medium transition-colors",
                    pathname === item.href
                      ? "text-amber-400 border-l-2 border-amber-500 pl-3"
                      : "text-zinc-400 hover:text-white hover:bg-[#1e1710] rounded-lg"
                  )}
                >
                  {item.name}
                </Link>
              ))}
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
