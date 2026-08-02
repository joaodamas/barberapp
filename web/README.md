# O Siqueira Barbearia — app web

PWA única que serve dois produtos a partir do mesmo bundle: o **app do cliente**
(agendar, planos, reservas, perfil) e o **painel do dono** (agenda do dia,
financeiro, números, mensalistas, loja).

Produção: <https://osiqueira.jpproject.com.br>

> **Leia `AGENTS.md` antes de escrever código de framework.** Este projeto usa
> Next.js 16, que tem breaking changes em relação a versões anteriores. A
> documentação da versão exata está em `node_modules/next/dist/docs/`.

---

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencha com as chaves do projeto Firebase
npm run dev                  # http://localhost:3000
```

**As variáveis são obrigatórias.** Sem elas o app falha no boot com uma
mensagem dizendo exatamente o que falta — o Auth é inicializado no escopo do
módulo e o `AuthProvider` está no layout raiz, então toda rota depende dele.

As chaves `NEXT_PUBLIC_FIREBASE_*` vêm do console do Firebase, em
**Configurações do projeto → Seus apps → Web**. Elas são públicas por design
(vão para o bundle): a proteção real vem das Security Rules em
`../firestore.rules` e dos domínios autorizados no console, nunca do sigilo da
`apiKey`.

`NEXT_PUBLIC_DEMO_MODE=true` exibe o aviso de ambiente de demonstração. Mantenha
ligado enquanto os dados forem fictícios — a interface diz "Reserva
confirmada!" e nada é salvo.

---

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | build de produção (19 rotas estáticas) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint + React Compiler |
| `npm run test` | testes unitários (Vitest) |
| `npm run check` | typecheck + lint + testes — rode antes de abrir PR |
| `npm run check:data` | confere se os números do dataset fecham entre si |

---

## Estrutura

```
src/
├── app/
│   ├── layout.tsx          fontes, metadata, AuthProvider, service worker
│   ├── login/              telefone/SMS · e-mail/senha · Google
│   ├── (cliente)/          app do cliente — AuthGuard
│   └── painel/(dashboard)/ painel do dono — AuthGuard requireOwner
├── components/
│   ├── ui/                 button · card · pill · modal · kpi-tile
│   └── ...                 guards, navegação, identidade
└── lib/
    ├── firebase.ts         init + carregamento sob demanda do SDK
    ├── auth-context.tsx    AuthProvider / useAuth
    ├── business-rules.ts   políticas configuráveis (cancelamento, comissão…)
    ├── dre.ts              cálculo do resultado do mês — fonte única
    ├── slots.ts            motor de horários (jornada, antecedência, duração)
    ├── mock-data.ts        dados de demonstração
    └── format.ts           formatação e divisões seguras
```

Os grupos `(cliente)` e `(dashboard)` **não aparecem na URL** — existem para
separar o layout logado da tela de login.

---

## Regras que não se quebram

1. **Não separe o estado do `AuthProvider`.** `user`, `claims` e `loading` vivem
   num único objeto de propósito: dois `setState` criam uma renderização com
   "logado, mas sem permissão ainda", e o redirect lê `role` errado nesse
   instante — era o bug que mandava o dono para o app do cliente.
2. **Percentual, prazo e janela de política vêm de `lib/business-rules.ts`.** Se
   um número de política aparece em JSX, ele veio de lá.
3. **Não use `formatDatePtBR(...).split(",")[0]`** — isso devolve o dia da
   semana, não a data. Use `formatDateShortPtBR` ou `formatDateNumeric`.
4. **Divisões passam por `safeDiv`/`safePct`.** `NaN%` e `R$ ∞` já chegaram à
   tela.
5. **Modal é o de `components/ui/modal.tsx`** — já tem `Esc`, focus trap,
   trava de scroll e `aria-modal`.
6. **Firebase pesado sob demanda:** `getDb()`, `getAppStorage()`,
   `getAppFunctions()` nunca no topo de um módulo alcançado pelo layout raiz.
   O Firestore sozinho são ~558 KB.
7. **Navegação interna com `<Link>`**, nunca `<a href="/rota">`.
8. **Sem `useMemo` manual** onde o React Compiler já memoiza — ele desiste de
   otimizar o componente inteiro quando não consegue preservar o memo.

---

## Deploy

```bash
# da raiz do repositório
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore:rules,storage:rules
```

Depois de publicar, o service worker antigo continua ativo até o usuário
aceitar o aviso de "Nova versão disponível" (ou `Ctrl+Shift+R`). Isso é
intencional: ativar o build novo enquanto a aba roda o anterior faz ela pedir
chunks que já não existem.

---

## Documentação

- [`../docs/ARQUITETURA.md`](../docs/ARQUITETURA.md) — referência técnica completa
- [`../docs/AUDITORIA-2026-08-02.md`](../docs/AUDITORIA-2026-08-02.md) — auditoria e achados
- [`../prd-app-barbearia.md`](../prd-app-barbearia.md) — PRD do produto
- [`../CHANGELOG.md`](../CHANGELOG.md) — histórico de mudanças
