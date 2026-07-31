"use client";

import { useAuth } from "@/lib/auth-context";

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function ProfileIdentity() {
  const { user } = useAuth();

  const name = user?.displayName || user?.email?.split("@")[0] || "Cliente";
  const contact = user?.phoneNumber || user?.email || "";

  return (
    <div className="flex items-center gap-3 md:gap-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gold/15 text-lg font-semibold text-gold-light md:h-20 md:w-20 md:text-2xl">
        {initialsOf(name) || "?"}
      </div>
      <div className="min-w-0">
        <p className="truncate text-ivory md:text-lg md:font-medium">{name}</p>
        <p className="truncate text-sm text-ivory-muted md:text-base">{contact}</p>
      </div>
    </div>
  );
}
