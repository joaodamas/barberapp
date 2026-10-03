/**
 * De onde vieram os clientes e os agendamentos de uma barbearia (02/10).
 *
 * Cliente: `origin` "app" = se cadastrou sozinho pelo link; "balcao" = o
 * barbeiro cadastrou; "importacao" = carga inicial.
 * Agendamento: `origin` "app" = o cliente marcou; "balcao" = o barbeiro marcou
 * à mão; "fixo" = horário fixo gerado; "importacao" = carga inicial. Reserva
 * antiga sem `origin` aparece como "sem registro".
 *
 *   node scripts/relatorio-origens.mjs --id <barbershopId> [--desde AAAA-MM-DD] [--csv <pasta>]
 *
 * Sem `--csv`, só imprime CONTAGENS (nenhum nome). Com `--csv`, grava
 * clientes.csv e agendamentos.csv na pasta, com nome — para o dono abrir.
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const valor = (nome) => (args.includes(nome) ? args[args.indexOf(nome) + 1] : null);
const id = valor("--id");
const desde = valor("--desde") ?? "0000-00-00";
const pasta = valor("--csv");
if (!id) {
  console.error("Use --id <barbershopId>.");
  process.exit(1);
}

initializeApp();
const db = getFirestore();
const loja = db.doc(`barbershops/${id}`);

const ROTULO = {
  app: "pelo app (o próprio cliente)",
  balcao: "no balcão (o barbeiro)",
  fixo: "horário fixo",
  importacao: "importação",
  "sem registro": "sem registro",
};
const contar = (itens, chave) =>
  itens.reduce((m, x) => ((m[chave(x)] = (m[chave(x)] ?? 0) + 1), m), {});
const imprimir = (titulo, contagem) => {
  console.log(`\n${titulo}`);
  for (const [k, n] of Object.entries(contagem).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${ROTULO[k] ?? k}`);
  }
};
const csv = (linhas) =>
  linhas.map((l) => l.map((c) => `"${String(c ?? "").replaceAll('"', '""')}"`).join(";")).join("\n");

const clientes = (await loja.collection("clients").get()).docs
  .map((d) => ({ id: d.id, ...d.data() }))
  .filter((c) => !c.mergedInto);
const reservas = (await loja.collection("bookings").get()).docs
  .map((d) => ({ id: d.id, ...d.data() }))
  .filter((b) => b.status !== "removido" && (b.date ?? "") >= desde);

imprimir(`Clientes (${clientes.length})`, contar(clientes, (c) => c.origin ?? "sem registro"));
imprimir(
  `Agendamentos${desde !== "0000-00-00" ? ` desde ${desde}` : ""} (${reservas.length})`,
  contar(reservas, (b) => b.origin ?? "sem registro")
);

const porMes = {};
for (const b of reservas) {
  const mes = (b.date ?? "").slice(0, 7);
  const o = b.origin ?? "sem registro";
  porMes[mes] ??= {};
  porMes[mes][o] = (porMes[mes][o] ?? 0) + 1;
}
console.log("\nAgendamentos por mês");
for (const mes of Object.keys(porMes).sort()) {
  console.log(`  ${mes}  ${Object.entries(porMes[mes]).map(([o, n]) => `${o}: ${n}`).join(" · ")}`);
}

if (pasta) {
  mkdirSync(pasta, { recursive: true });
  writeFileSync(
    join(pasta, "clientes.csv"),
    "﻿" +
      csv([
        ["nome", "whatsapp", "origem", "ativo"],
        ...clientes.map((c) => [c.name, c.whatsapp, ROTULO[c.origin ?? "sem registro"], c.active === false ? "não" : "sim"]),
      ])
  );
  writeFileSync(
    join(pasta, "agendamentos.csv"),
    "﻿" +
      csv([
        ["data", "hora", "cliente", "origem", "status", "encaixe"],
        ...reservas
          .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
          .map((b) => [b.date, b.time, b.clientName, ROTULO[b.origin ?? "sem registro"], b.status, b.isFitIn ? "sim" : ""]),
      ])
  );
  console.log(`\nCSV gravados em ${pasta}`);
}
