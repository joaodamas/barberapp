import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { BarberPoleDivider } from "@/components/ui/barber-pole-divider";

export function ComingSoon({
  icon: Icon,
  title,
  description,
  epic,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  epic: string;
}) {
  return (
    <div className="flex flex-col gap-5 pt-1">
      <div>
        <h1 className="text-xl text-ivory">{title}</h1>
      </div>
      <Card className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/15 text-gold-light">
          <Icon size={22} />
        </div>
        <p className="max-w-xs text-sm text-ivory-muted">{description}</p>
        <BarberPoleDivider className="max-w-24" />
        <p className="text-xs text-ivory-muted/70">{epic}</p>
      </Card>
    </div>
  );
}
