import Link from "next/link";
import { Mail, Facebook } from "lucide-react";
import { siteConfig } from "@/data/site-config";

export function Footer() {
  return (
    <footer className="bg-[#0a0704] border-t border-[rgba(245,158,11,0.1)]">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <Link href="/" className="group">
              <span className="font-display text-xl font-bold text-white group-hover:text-amber-400 transition-colors">
                <em className="not-italic italic text-amber-400">Kelso</em>{" "}Kelly
              </span>
            </Link>
            <p className="mt-4 text-zinc-400 text-sm max-w-xs">
              {siteConfig.description}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
              Quick Links
            </h3>
            <ul className="mt-4 space-y-2">
              <li>
                <Link
                  href="/schedule"
                  className="text-zinc-400 hover:text-amber-500 transition-colors"
                >
                  Upcoming Shows
                </Link>
              </li>
              <li>
                <Link
                  href="/media"
                  className="text-zinc-400 hover:text-amber-500 transition-colors"
                >
                  Photos & Videos
                </Link>
              </li>
              <li>
                <Link
                  href="/songs"
                  className="text-zinc-400 hover:text-amber-500 transition-colors"
                >
                  Song List
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="text-zinc-400 hover:text-amber-500 transition-colors"
                >
                  Book Kelso
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
              Get in Touch
            </h3>
            <ul className="mt-4 space-y-2">
              <li>
                <a
                  href={`mailto:${siteConfig.email}`}
                  className="flex items-center gap-2 text-zinc-400 hover:text-amber-500 transition-colors"
                >
                  <Mail className="h-4 w-4" />
                  {siteConfig.email}
                </a>
              </li>
              {siteConfig.socialLinks.facebook && (
                <li>
                  <a
                    href={siteConfig.socialLinks.facebook}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-zinc-400 hover:text-amber-500 transition-colors"
                  >
                    <Facebook className="h-4 w-4" />
                    Facebook
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-[rgba(245,158,11,0.08)]">
          <p className="text-center text-zinc-500 text-sm">
            &copy; {new Date().getFullYear()} {siteConfig.name}. All rights
            reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
