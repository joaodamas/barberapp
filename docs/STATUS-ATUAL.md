# Status atual — o que existe, o que está publicado, o que funciona

Fotografia do sistema. Complementa o `GO-LIVE-READINESS.md`, que lista o que
**falta**; aqui está o que **existe**, separado por onde existe.

**Gerado em 12/08/2026**, do repositório e do histórico de deploy. Onde algo não
pôde ser verificado contra o ambiente publicado, está dito.

---

## 1. A distinção que mais confunde: três camadas

Ler os documentos sem esta separação faz o produto parecer mais adiantado do que
está no ar.

| Camada | O que é | Como conferir |
|---|---|---|
| **Publicado** | o que responde em `osiqueira.jpproject.com.br` | último deploy: commit `5a3bef6`, 12/08, pela esteira |
| **Na `main`** | mergeado, não necessariamente publicado | `git log origin/main` |
| **Só local** | 13 commits de 12/08, **não empurrados** | `git log --oneline origin/main..HEAD` |

**Tudo do merge de 12/08 está na terceira camada.** Três planos, modo leitura,
cancelamento pelo dono, rotina de assinaturas: nada disso está no ar, e a `main`
remota não enxerga nada disso.

Os dois commits que a `main` recebeu depois do deploy (`42ddd66`, `8d09db1`) são
só documentação — o código publicado continua sendo o de `5a3bef6`.

---

## 2. Stack

| Camada | Escolha |
|---|---|
| Front | Next.js (App Router), TypeScript, Tailwind |
| Banco | Firestore, multi-tenant em `/barbershops/{id}` |
| Backend | Cloud Functions (2ª geração), região `southamerica-east1` |
| Auth | Firebase Auth, papel do dono por **custom claim** |
| Hospedagem | Firebase Hosting |
| Publicação | GitHub Actions — **deploy local é proibido** |
| Testes | Vitest (web e functions) + testes de regras com emulador |

Resolução de tenant por **subdomínio**: `osiqueira.jpproject.com.br` → ficha da
barbearia. O domínio do CorteHub **ainda não foi comprado**.

---

## 3. Cloud Functions — 18 no código

```
availableSlots            createBooking             provisionBarbershop
cancelBooking             creditLoyaltyOnCompletion redeemLoyaltyReward
changeInitialPassword     grantShopRole             rescheduleBooking
checkSlugAvailability     healthcheck               revisarAssinaturas
completeOnboardingStep    materializeFinancialsOnCompletion
                          notifyBookingCreated      setOwnerRole
                          signUpBarbershop          whatsappWebhook
```

Duas ressalvas:

- **`revisarAssinaturas` nunca foi publicada** — veio no merge local de 12/08.
  Roda 06:00 e está em `DRY_RUN = true`: só registra o que faria.
- **`notifyBookingCreated` e `whatsappWebhook` existem e não enviam nada.**
  Falta credencial e verificação comercial na Meta.

Todas executam com a conta de runtime padrão, que tem `roles/editor` no projeto
— é o **SEC-001**, o segundo bloqueador da lista de prontidão.

---

## 4. O que está publicado e funcionando

Cada linha aqui tem evidência de produção nomeada em `GO-LIVE-READINESS.md` §4.

- Agenda pública por subdomínio, com resolução correta de tenant
- Reserva pelo cliente, com motor de horários que respeita jornada, intervalo,
  duração do serviço e antecedência mínima
- Painel do dono: agenda do dia, conclusão de atendimento com meio de pagamento,
  marcação de falta, aprovação e recusa de encaixe
- **Financeiro congelado no fato**: ao concluir, comissão e taxa da maquininha
  viram documento e param de mudar. Mudar o percentual de um barbeiro hoje não
  reescreve o que ele ganhou antes
- DRE, projeção e fechamento lendo o materializado
- Configurações grava e reflete na hora, com merge de política parcial
- Esteira de deploy, com credencial exercida
- PWA com troca de versão ao fechar e reabrir

> ⚠️ **Três dessas linhas foram provadas contra o código de 11/08**, e o merge de
> 12/08 reescreveu o cálculo da comissão. Estão marcadas para re-exercício na
> lista de prontidão. Não trate como verde puro.

---

## 5. O que existe no código e ninguém provou

Implementado, com teste, sem evidência de produção:

| Item | Onde está |
|---|---|
| As 5 regras do Action Center | publicado; só o estado **vazio** foi observado |
| Cancelamento e remarcação pelo cliente | publicado; ninguém cancelou de verdade |
| Cancelamento pelo dono | **só local**, de 12/08; nenhum clique, nem em emulador |
| Três planos e o gate por nível | **só local**; em produção só existe barbearia em trial, que libera tudo |
| Modo leitura ao vencer o trial | **só local**; nunca houve tenant vencido |
| `revisarAssinaturas` | **só local**, em `DRY_RUN` |
| Isolamento entre barbearias | 66 testes de regras verdes; em produção existe **uma** barbearia |
| Rotação do cache do PWA | provar exige a **próxima** publicação real |

---

## 6. O que aparenta funcionar e não funciona

A distinção importa: funcionalidade ausente é escopo, funcionalidade que mente é
defeito.

| Onde | O que acontece |
|---|---|
| Botão "Atualizar" do PWA | **observado sem funcionar** em 11/08. O caminho "fechar e reabrir" funciona |
| Expiração de encaixe | `fitInExpirationMinutes` (45) existe e **nada expira nada** — pendência acumula para sempre |
| Estorno | `cancelBooking` grava `refundedAmount`, e **dinheiro nenhum volta** — não há gateway |
| Mensalistas | `subscriptions` é flag de plano; **não cobra nada** |
| Aba "Celular" no login | provider Phone/SMS não está habilitado |
| `ChunkLoadError` | apareceu 4×, some quando forçado, **sem causa raiz** |
| Política de 2 remarcações | `rescheduleCount` não é gravado — burlável com F5 |

---

## 7. Integrações

| Integração | Estado |
|---|---|
| Firebase Auth (e-mail/senha) | funcionando |
| Firebase Auth (telefone/SMS) | **não habilitado** |
| Firestore + regras | funcionando, com 66 testes |
| GitHub Actions | funcionando |
| **WhatsApp / Meta** | 34 templates prontos, **zero envio**. Depende de chip novo e verificação comercial |
| **Gateway de pagamento** | **não existe** — nem para o cliente da barbearia, nem para a mensalidade da plataforma |
| Nota fiscal | não existe |
| Observabilidade / alertas | **não existe** — ninguém é avisado se uma function começar a falhar |

---

## 8. Dados

- Uma barbearia em produção, sem operação real
- Sem dado de cliente final em volume
- **Sem rotina de backup configurada**
- Sem varredura do que fica para trás: reserva de ontem em aberto some do painel

É a janela em que consertar coisa estrutural ainda é barato.

---

## 9. Segurança — o resumo

Detalhe em `GO-LIVE-READINESS.md` §2.

| | |
|---|---|
| 🔴 **SEC-001** | conta de runtime das functions tem `roles/editor` no projeto |
| 🔴 **SEC-002** | **um único** owner e **um único** admin de faturamento, na mesma conta pessoal, e o projeto **não está sob organização nenhuma** — sem caminho de recuperação |
| 🔴 **App Check** | zero referências no código: qualquer um chama as functions de fora do app |
| 🔴 **LGPD** | nenhuma rota de privacidade ou termos, e a plataforma guarda nome, telefone e histórico de **clientes de terceiros** |
| ✅ | isolamento entre barbearias coberto por regras e testes |
| ✅ | credencial de deploy com papéis mínimos |

---

## 10. O que não pôde ser verificado aqui

Honestidade sobre o alcance deste documento:

- **O estado real do ambiente publicado** foi lido do histórico de deploy e do
  changelog, não consultado ao vivo.
- **Nada do merge de 12/08 foi exercido em nenhum ambiente** — só typecheck,
  lint, 162 testes no web, 130 nas functions e build.
- A lista de prontidão diz "19 functions" no SEC-001; a contagem do código hoje
  é **18**. A diferença não muda o risco descrito.
