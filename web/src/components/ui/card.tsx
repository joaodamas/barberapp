import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const Card = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { interactive?: boolean }
>(function Card({ className, interactive, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "card-elevated rounded-2xl border border-border bg-surface p-4",
        interactive && "card-interactive",
        className
      )}
      {...props}
    />
  );
});
