"use client";

import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { cn } from "@/lib/cn";

export function SignOutButton({
  className,
  children = "Sair da conta",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();

  async function handleSignOut() {
    await signOut(auth);
    router.replace("/login");
  }

  return (
    <button
      onClick={handleSignOut}
      className={cn(
        "text-sm text-ivory-muted transition-colors hover:text-ivory",
        className
      )}
    >
      {children}
    </button>
  );
}
