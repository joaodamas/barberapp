import { cn } from "@/lib/cn";

export function BarberPoleDivider({ className }: { className?: string }) {
  return (
    <div
      className={cn("barber-stripe h-1.5 w-full rounded-full", className)}
      aria-hidden
    />
  );
}
