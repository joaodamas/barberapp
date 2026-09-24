"use client";

import { BottomNav } from "@/components/bottom-nav";
import { clienteNavItems, clienteNavVisitante } from "@/lib/nav-items";
import { useAuth } from "@/lib/auth-context";

export function ClienteBottomNav() {
  const { user } = useAuth();
  return <BottomNav items={user ? clienteNavItems : clienteNavVisitante} />;
}
