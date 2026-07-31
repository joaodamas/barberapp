import { type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Tone = "gold" | "success" | "danger" | "neutral";

const tones: Record<Tone, string> = {
  gold: "bg-gold/15 text-gold-light border-gold/30",
  success: "bg-success/15 text-success border-success/30",
  danger: "bg-danger/15 text-danger border-danger/30",
  neutral: "bg-surface-raised text-ivory-muted border-border",
};

export function Pill({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
