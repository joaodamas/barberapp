"use client";

import { BottomNav } from "@/components/bottom-nav";
import { clienteNavItems } from "@/lib/nav-items";

export function ClienteBottomNav() {
  return <BottomNav items={clienteNavItems} />;
}
