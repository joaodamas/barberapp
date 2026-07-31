import { type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Card({
  className,
  interactive,
  ...props
}: HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "card-elevated rounded-2xl border border-border bg-surface p-4",
        interactive && "card-interactive",
        className
      )}
      {...props}
    />
  );
}
