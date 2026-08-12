# Rodada de validação pós-deploy

Roteiro do que exercer no domínio publicado para promover item de 🟡 para ✅ no
`GO-LIVE-READINESS.md`.

Existe porque a promoção não pode depender de memória. Sem um roteiro escrito
antes, a rodada vira "abri o painel e pareceu funcionar" — que é precisamente o
tipo de evidência que este projeto decidiu não aceitar.

**Regra:** cada item só sobe para ✅ com a **evidência nomeada** copiada para o
`GO-LIVE-READINESS.md` §4. Observou e não anotou é o mesmo que não observou.

---

## Antes de começar

| | |
|---|---|
| Publicação | `Deploy (produção)` → `workflow_dispatch` → escopo `tudo` |
| Confirmar | o run terminou em `release complete`, e o commit publicado é o da `main` |
| Anotar | número do run e SHA — vão junto com cada evidência abaixo |

> ⚠️ **A primeira publicação depois do merge é a única chance de provar a
> rotação do cache do PWA por build.** Não vale deploy artificial depois: o que
> se prova é que o `sw.js` mudou de nome entre DUAS publicações reais. Se
> ninguém observar nesta, o item continua 🟡 até a próxima entrega de verdade.

---

## 1. O que só esta publicação prova

### 1.1 Rotação do cache do PWA

1. Antes de publicar, abrir o painel e anotar o nome do cache em
   DevTools → Application → Cache Storage (hoje: `barbearia-5a3bef6cc3d5`).
2. Publicar.
3. Recarregar. O cache novo deve nascer com o **SHA novo**, e o antigo sumir.

**Evidência:** os dois nomes de cache, o de antes e o de depois.

### 1.2 O botão "Atualizar" do PWA

Está **observado sem funcionar** em 11/08 — nem o clique nem um `SKIP_WAITING`
direto trocaram o worker. Com a publicação nova, o aviso "Nova versão
disponível" deve aparecer com a aba aberta.

- Funcionou → ✅, e some da lista de defeitos.
- Não funcionou → continua defeito, **agora com segunda observação**, e vira
  investigação com causa raiz em vez de sintoma.

**Evidência:** o que aconteceu ao clicar, e se "fechar e reabrir" resolveu.

---

## 2. O que veio no PR #12 e nunca rodou em produção

### 2.1 Cancelamento pelo dono

1. Criar uma reserva de teste para hoje, com pagamento registrado.
2. No painel, "Cancelar" na linha da reserva.
3. Conferir **antes de confirmar**: o diálogo mostra a devolução calculada.
4. Confirmar.

Verificar: status `cancelled_by_shop`; `refundedAmount` igual ao que a tela
prometeu; o horário sai da previsão do dia e volta a ficar livre na agenda; a
conversa do WhatsApp abre com o texto pronto.

**Evidência:** o valor prometido na tela × o gravado no documento.

> O ponto desta verificação é a **igualdade entre os dois números**. Eram
> calculados por fontes diferentes até 12/08, e divergiam em barbearia com
> política própria.

### 2.2 Três planos e o gate por nível

Com uma barbearia em `plan: "agenda"`:

- DRE, Projeção, Fluxo de Caixa e Despesas mostram o bloqueio que **vende** em
  vez de só negar.
- Trocar para `crescimento`: loja e fidelidade abrem, financeiro avançado não.
- Trocar para `gestao`: tudo abre.

**Evidência:** que tela bloqueou em que plano.

### 2.3 Modo leitura

Com uma barbearia de teste em `status: "suspenso"`:

- A barra de modo leitura aparece no topo do painel.
- O dono **enxerga** agenda, financeiro e histórico.
- Salvar qualquer coisa não passa.
- **O app do cliente continua agendando pelo link.** Esta é a parte que mais
  importa e a mais fácil de esquecer.

**Evidência:** confirmação explícita de que o link público continuou aceitando
reserva com a barbearia suspensa.

### 2.4 Política e Termos

- `/privacidade` e `/termos` abrem no domínio publicado, sem login.
- No subdomínio da barbearia, a política **nomeia a barbearia** como
  controladora.
- Os links aparecem no rodapé da landing, no cadastro e **no passo 3 do
  agendamento**.
- Os quatro campos jurídicos **não podem estar em amarelo**. Se estiverem, o
  documento não deveria ter sido publicado.

### 2.5 Exclusão de dados — o `DRY_RUN`

1. Criar uma barbearia descartável, com ao menos uma reserva.
2. Chamar `encerrarConta`. Conferir `status: "encerrada"` e `encerradaEmMs`.
3. Conferir que o painel dela entrou em leitura, e **não** liberou o plano.
4. Recuar `encerradaEmMs` em 31 dias, à mão.
5. Disparar `expurgarContasEncerradas` e **ler o log**.

O log deve listar a barbearia com a contagem de alvos, e **nada deve ter sido
apagado** — é `DRY_RUN`.

6. Conferir no banco que a barbearia continua lá.

**Só então** desligar o `DRY_RUN`, repetir, e verificar que sumiram: a
barbearia, o `slugs/{slug}`, os `memberships`, e os três índices de WhatsApp.

> Este é o único item da lista em que **errar é irreversível**. Fazer com
> barbearia descartável, nunca com o tenant piloto.

---

## 3. O que já está publicado e nunca foi exercido

### 3.1 O ciclo de falta — o grande checkpoint

Depende do relógio, e portanto de horário comercial.

```
confirmed → horário passa → +tolerância → atraso no Action Center
         → "Não veio" → no_show → NENHUM payment/commission
         → "Veio depois" → fechamento → financeiro materializado
```

Conferir em cada etapa: o alerta aparece **depois** da tolerância, não antes; o
`no_show` não cria `payments` nem `commissions`; "Veio depois" materializa os
dois; o horário permanece ocupado na agenda enquanto `no_show`.

**Evidência:** os documentos que existiam em cada passo.

### 3.2 Action Center — ver uma regra disparar

Só o estado **vazio** foi observado em produção. Basta **uma** regra disparando
com dado real para o item deixar de ser teórico.

### 3.3 Cancelamento e remarcação pelo cliente

Pelo `/reservas`, com conta de cliente. Na remarcação, tentar uma terceira —
`rescheduleCount` não é gravado, então a política de 2 é burlável com F5. Se
confirmar, é defeito com evidência.

### 3.4 Encaixe

Solicitar pelo app do cliente, aprovar e recusar pelo painel. E anotar o
horário: `fitInExpirationMinutes` é 45 e **nada expira nada** — o encaixe
pendente deve continuar lá depois de uma hora, confirmando o defeito conhecido.

---

## 4. O que NÃO se prova nesta rodada

Registrado para ninguém marcar por engano:

- **Isolamento entre barbearias.** Existe uma barbearia real. Os 66 testes de
  regras continuam sendo a única evidência, e é evidência de CI, não de
  produção. Só sobe para ✅ quando houver uma segunda barbearia operando.
- **Trial vencendo de verdade.** Exige um tenant chegar ao fim dos 7 dias sem
  intervenção. Forçar a data prova o gate, não o ciclo.
- **`revisarAssinaturas`.** Mesma coisa: roda 04:00 em `DRY_RUN`, e provar exige
  ler o log dela com um trial vencido real.
- **Envio de WhatsApp.** Nada disso depende de deploy — depende da Meta.

---

## 5. Ao terminar

1. Atualizar o `GO-LIVE-READINESS.md`: o que subiu para ✅, **com a evidência
   nomeada**, e o que continuou 🟡 e por quê.
2. Registrar no `CHANGELOG.md` o que a publicação revelou. A de 12/08 revelou
   três defeitos que nenhuma suíte pegaria; não há razão para supor que esta
   revele zero.
3. Achado novo vira linha na lista, com o estado certo — não comentário.
