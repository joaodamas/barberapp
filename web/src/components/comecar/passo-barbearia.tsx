"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { shortNameFrom, type Tenant } from "@/lib/tenant";

/** Paleta validada: toda cor aqui dá contraste ≥4,5:1 com texto escuro.
 *  Seletor livre deixaria o dono escolher um dourado claro e derrubar a
 *  legibilidade do botão primário — o problema que a auditoria corrigiu. */
const CORES = [
  { hex: "#b8863a", nome: "Dourado" },
  { hex: "#a8602f", nome: "Cobre" },
  { hex: "#8c6f4e", nome: "Areia" },
  { hex: "#7a7f6b", nome: "Oliva" },
  { hex: "#6f7d8c", nome: "Aço" },
  { hex: "#9a5a5a", nome: "Terracota" },
];

export function PassoBarbearia({
  tenant,
  onSubmit,
  saving,
}: {
  tenant: Tenant;
  onSubmit: (data: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const [nome, setNome] = useState(tenant.brand.name);
  const [endereco, setEndereco] = useState(tenant.contact.address);
  const [whatsapp, setWhatsapp] = useState(tenant.contact.whatsapp);
  const [instagram, setInstagram] = useState(tenant.contact.instagram ?? "");
  const [cor, setCor] = useState(tenant.brand.accentColor);

  const digitos = whatsapp.replace(/\D/g, "");
  const podeAvancar = nome.trim().length > 1 && endereco.trim().length > 3 && digitos.length >= 10;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          "brand.name": nome.trim(),
          "brand.shortName": shortNameFrom(nome),
          "brand.accentColor": cor,
          "contact.address": endereco.trim(),
          "contact.whatsapp": digitos.startsWith("55") ? digitos : `55${digitos}`,
          "contact.instagram": instagram.trim() || null,
        });
      }}
    >
      <Campo
        id="nome"
        label="Nome da barbearia"
        dica="Como sua barbearia é conhecida. Aparece no topo do app e nas mensagens de WhatsApp."
        value={nome}
        onChange={setNome}
        placeholder="Ex: Barbearia do Zé"
        required
      />
      <Campo
        id="endereco"
        label="Endereço"
        dica="Rua, número e bairro. O cliente toca e abre no mapa."
        value={endereco}
        onChange={setEndereco}
        placeholder="Ex: Rua das Flores, 120 — Centro"
        required
      />
      <Campo
        id="whatsapp"
        label="WhatsApp"
        dica="Com DDD. É por aqui que você vai aprovar encaixes e receber avisos."
        value={whatsapp}
        onChange={setWhatsapp}
        placeholder="(11) 99999-9999"
        inputMode="tel"
        required
      />
      <Campo
        id="instagram"
        label="Instagram"
        dica="Opcional. Aparece no rodapé do app do cliente."
        value={instagram}
        onChange={setInstagram}
        placeholder="@suabarbearia"
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-ink">Cor de destaque</legend>
        <p className="text-xs text-ink-muted">
          A cor dos botões e destaques. O resto do visual é fixo, para o texto continuar legível.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {CORES.map((c) => (
            <button
              key={c.hex}
              type="button"
              aria-label={c.nome}
              aria-pressed={cor === c.hex}
              onClick={() => setCor(c.hex)}
              style={{ backgroundColor: c.hex }}
              className={
                "flex h-11 w-11 items-center justify-center rounded-xl border-2 transition-transform " +
                (cor === c.hex ? "border-ink scale-105" : "border-transparent")
              }
            >
              {cor === c.hex && <span className="text-xs font-bold text-ink">✓</span>}
            </button>
          ))}
        </div>
      </fieldset>

      <Button type="submit" disabled={!podeAvancar || saving}>
        {saving ? "Salvando…" : "Continuar"}
      </Button>
    </form>
  );
}

function Campo({
  id, label, dica, value, onChange, placeholder, required, inputMode,
}: {
  id: string;
  label: string;
  dica: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  inputMode?: "tel" | "text";
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label} {required && <span className="text-gold-strong">*</span>}
      </label>
      <p className="text-xs text-ink-muted">{dica}</p>
      <input
        id={id}
        value={value}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-ink"
      />
    </div>
  );
}
