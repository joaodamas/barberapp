import {
  Bell,
  ChevronRight,
  CircleHelp,
  FileText,
  Sparkles,
  User,
} from "lucide-react";
import { Card } from "@/components/ui/card";

const menuItems = [
  { icon: User, label: "Meus dados" },
  { icon: Sparkles, label: "Meu plano" },
  { icon: Bell, label: "Notificações" },
  { icon: FileText, label: "Política de cancelamento" },
  { icon: CircleHelp, label: "Ajuda" },
];

export default function PerfilPage() {
  return (
    <div className="flex flex-col gap-5 pt-1 md:mx-auto md:max-w-xl md:gap-7 md:pt-4">
      <div className="flex items-center gap-3 md:gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gold/15 text-lg font-semibold text-gold-light md:h-20 md:w-20 md:text-2xl">
          JD
        </div>
        <div>
          <p className="text-ivory md:text-lg md:font-medium">João Damas</p>
          <p className="text-sm text-ivory-muted md:text-base">(11) 99999-9999</p>
        </div>
      </div>

      <Card className="flex flex-col divide-y divide-border p-0">
        {menuItems.map(({ icon: Icon, label }) => (
          <button
            key={label}
            className="flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-raised md:px-6 md:py-4"
          >
            <Icon size={18} className="text-gold-light" />
            <span className="flex-1 text-sm text-ivory md:text-base">{label}</span>
            <ChevronRight size={16} className="text-ivory-muted" />
          </button>
        ))}
      </Card>

      <button className="text-sm text-ivory-muted transition-colors hover:text-ivory">
        Sair da conta
      </button>
    </div>
  );
}
