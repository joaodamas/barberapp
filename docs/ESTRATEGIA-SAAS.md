# De ferramenta interna a SaaS — estratégia e arquitetura

**Data:** 2026-08-02 · **Contexto:** o produto nasceu resolvendo as dores de uma barbearia específica e precisa virar plataforma para muitas.

---

## 1. A tese

Ter nascido de uma barbearia real é a maior vantagem competitiva do produto, não uma dívida. O mercado está cheio de sistemas genéricos de beleza adaptados para barbearia (Trinks), de agendas sem gestão (BarberCloud) e de apps que exigem download (AppBarber, BestBarbers). Nenhum foi construído olhando o dono contar o caixa no fim do dia.

Isso aparece no código: o DRE com margem de contribuição, custo fixo separado de variável, ponto de equilíbrio calculado e projeção de caixa dia a dia **não é o que se constrói quando se está fazendo software genérico**. É o que se constrói quando alguém sentou com o dono e perguntou o que ele precisa saber para decidir.

O risco do caminho SaaS é diluir exatamente isso, tentando servir salão de beleza, estética e pet shop. **A recomendação é o oposto: continuar vertical em barbearia** e transformar a especificidade em barreira de entrada.

---

## 2. Onde o produto está — medido, não estimado

| Dimensão | Situação |
|---|---|
| Marca acoplada ao código | 35 ocorrências em 12 arquivos → **0** fora do tenant |
| Políticas de negócio | já isoladas em `business-rules.ts`, 10 exports |
| Vínculo pessoa↔barbearia | claim `workspaceId` existia e não era usado → substituído por `barbershops: {id: papel}` |
| Isolamento de dados | ✅ subcoleções sob `/barbershops/{id}` |
| Resolução por subdomínio | ✅ implementada e testada |
| Persistência | ❌ **bloqueio único** |

O acoplamento era **raso** — strings de interface e um objeto de configuração. A parte cara (isolar as regras de negócio da apresentação) tinha sido feita na auditoria, sem esse objetivo em mente. Isso encurta o caminho de meses para semanas.

---

## 3. Decisões tomadas

### 3.1 Isolamento: subcoleções sob a barbearia

```
/barbershops/{barbershopId}
    slug, status, brand{}, contact{}, policies{}, features{}, plan{}
  ├── members/{userId}          quem trabalha aqui e com que papel
  ├── services/{id}             catálogo próprio de cada barbearia
  ├── plans/{id}                planos de mensalista
  ├── bookings/{id}
  ├── expenses/{id}
  ├── products/{id}
  ├── subscriptions/{id}
  ├── payments/{id}  refunds/{id}  cash_entries/{id}  commissions/{id}
  ├── loyalty_transactions/{id}  client_occurrences/{id}
  └── whatsapp_messages/{id}  audit_log/{id}

/users/{userId}                 conta global do cliente final
  └── memberships/{barbershopId}

/slugs/{slug} → { barbershopId }   índice público que resolve o subdomínio
```

**Por que assim.** O isolamento é estrutural. Uma regra no nível do pai protege tudo abaixo:

```
match /barbershops/{bid}/expenses/{id} {
  allow read, write: if isOwnerOf(bid);
}
```

No modelo alternativo — coleções na raiz com campo `barbershopId` — cada regra e cada query precisa lembrar de filtrar. **Um único `where` esquecido vaza o financeiro de uma barbearia para outra, e o erro é silencioso.** Em produto que guarda dinheiro de terceiros, esse risco não se assume por conveniência de consulta.

O custo é real e conhecido: relatórios agregados da plataforma ("faturamento total de todas as barbearias") precisam de `collectionGroup`, e alguns exigem índice. É um custo de consulta interna, não de segurança do cliente.

> ⚠️ **Isto corrigiu um defeito grave.** As Security Rules escritas na auditoria eram single-tenant: `isOwner()` checava apenas `role == 'owner'`, global, sobre coleções na raiz. Com duas barbearias, o dono da A leria `/expenses` da B. Corrigir antes de existir qualquer dado é gratuito; depois, exige migração e reescrita de todas as queries.

### 3.2 Acesso: claim em vez de documento

O vínculo vive no custom claim `barbershops: { "<id>": "owner" | "staff" }`. Ler o claim dentro da regra é grátis; ler um documento de membership custaria **uma leitura cobrada por avaliação de regra** — e regras são avaliadas por documento acessado.

O cliente final **não tem claim nenhum**: ele acessa o que é dele por `clientId == request.auth.uid`. Isso mantém o claim pequeno (limite de 1000 bytes) mesmo com milhares de clientes.

`platformAdmin: true` é o papel de suporte, separado — quem opera a plataforma não deve ganhar acesso por ser dono de alguma barbearia.

### 3.3 Endereço: subdomínio por barbearia

`osiqueira.dominio.com.br`, `barbearia-do-ze.dominio.com.br`.

O ganho não é estético. Cada barbearia vira **um PWA instalável distinto**, com nome e ícone próprios na tela do celular — que é 90% do valor do app white-label do BestBarbers (R$ 299/mês), sem passar por loja de aplicativo nem pelos 15 dias de publicação. Cada origem tem seu próprio service worker e seu próprio armazenamento, o que também isola o cache entre barbearias.

**Consequência arquitetural que precisa ser dita:** ler o host torna a rota dinâmica. As 19 rotas eram estáticas (`○`) e passaram a ser renderizadas sob demanda (`ƒ`). Não dá para prerenderizar uma marca que só se conhece na requisição.

Mitigação implementada: como todo conteúdo logado já era renderizado no cliente (o `AuthGuard` mostra spinner no HTML), a casca servida é **idêntica para todos os visitantes de uma mesma barbearia**. Com `s-maxage` e `Vary: Host`, o CDN cacheia por hostname e o render acontece uma vez por barbearia, não uma vez por visita.

> ⚠️ Esse cache **deixa de ser seguro** no dia em que qualquer dado de usuário for renderizado no servidor. Está marcado em `next.config.ts` com o aviso.

### 3.4 Onboarding: assistido primeiro

Nas primeiras dezenas de clientes, o tenant é criado por você. Isso permite validar produto e preço sem construir cadastro, checkout de assinatura, provisionamento automático e trial **antes de saber se vende**. O self-service entra quando a demanda justificar — e aí já se sabe o que automatizar.

---

## 4. O que a personalização deve e não deve permitir

| Personalizável pela barbearia | Fixo da plataforma | Por quê |
|---|---|---|
| Nome, logo, cor de destaque | Fundo, cor de texto, semânticas (sucesso/perigo) | O contraste foi medido e corrigido; deixar o lojista escolher fundo e texto reintroduz o problema que acabou de ser resolvido |
| Catálogo de serviços e preços | Estrutura do DRE e do fluxo | O valor do produto é a leitura financeira correta, não a flexibilidade dela |
| Janelas e taxa de cancelamento, reagendamento, antecedências | Os estados de `booking` | Estado de reserva é contrato com o gateway e com o WhatsApp |
| Rateio de comissão, alíquota, dias de funcionamento | Motor de slots | A lógica de encaixe é o diferencial; fragmentá-la por cliente mata a manutenção |
| Fidelidade: meta e recompensa | Mecânica de carimbo | — |

**A regra:** personaliza-se o *conteúdo* e os *parâmetros*, nunca a *estrutura*. Esse é o limite que separa SaaS de consultoria — e a maior armadilha de quem começa com um cliente-âncora é dizer sim para uma exceção estrutural.

---

## 5. Recursos por plano

`features` no tenant já suporta o corte comercial:

| Recurso | Entrada | Completo |
|---|---|---|
| Agenda, encaixe, pagamento flexível | ✅ | ✅ |
| WhatsApp (confirmação, lembrete, encaixe) | ✅ | ✅ |
| Fidelidade | ✅ | ✅ |
| Mensalistas com cobrança recorrente | — | ✅ |
| Loja e estoque | — | ✅ |
| **DRE, projeção, fechamento em PDF** | — | ✅ |

**WhatsApp no plano de entrada é decisão estratégica, não generosidade.** É exatamente o que o Trinks cobra como add-on, e o argumento de venda mais direto contra ele. O que sustenta o plano superior é a profundidade financeira — que nenhum concorrente entrega.

Referência de preço (ver [comparativo](./COMPARATIVO-MERCADO-2026-08.md)): entrada perto de Barbeiro.app Pro (~R$ 60–80/mês), superior ancorado no BestBarbers (~R$ 200–300/mês). **Sempre por barbearia, nunca por profissional** — cobrança por assento é a maior objeção contra Trinks e Booksy, e é de graça não repetir o erro deles.

---

## 6. Caminho de execução

### Fase A — fundação multi-tenant ✅ concluída
Modelo de dados, Security Rules por barbearia, resolução por subdomínio, contexto de tenant, manifest e metadata por barbearia, marca extraída do código, 54 testes.

### Fase B — persistência (bloqueio único)
1. Migrar `mock-data` para `/barbershops/{id}/...`, tela por tela.
2. `loadTenantBySlug` lendo `/slugs/{slug}` e `/barbershops/{id}`, com cache.
3. Cloud Function de provisionamento: cria barbearia, grava slug, concede o claim ao dono.
4. Remover o aviso de demonstração.

Sem isto não há produto vendável — nenhum polimento resolve uma tela que diz "Reserva confirmada!" e não confirma nada.

### Fase C — o diferencial
5. Submeter os 16 templates à Meta. **Fazer agora, em paralelo:** a aprovação leva dias e é caminho crítico. Os textos já passam na validação automatizada.
6. Webhook de encaixe com botões Aprovar/Recusar — é o diferencial nº 1 e a [Opero](https://gestaoparabarbearia.com.br/) já opera no mesmo terreno.
7. Gateway de pagamento e cobrança recorrente de mensalista.

### Fase D — vender
8. Painel de administração da plataforma (criar tenant, suspender, ver uso).
9. Wildcard DNS + certificado curinga.
10. Fechamento mensal em PDF — materializa a vantagem financeira num artefato que o dono leva ao contador.
11. NFS-e: **elevar de "fora de escopo" para prioritário** — é critério de compra recorrente e dois concorrentes de topo já entregam.

### Fase E — escalar
12. Onboarding self-service com trial de 7 dias e cobrança —
    especificado em [`ONBOARDING-SELF-SERVICE.md`](./ONBOARDING-SELF-SERVICE.md).
13. Multi-unidade e segundo barbeiro (o rateio de comissão já está pronto para isso).

---

## 7. Decisões ainda em aberto

| Decisão | Por que trava outras coisas |
|---|---|
| **Nome da plataforma** | Define o domínio raiz (`ROOT_DOMAIN`), os slugs reservados, a assinatura dos templates do WhatsApp e o `NEXT_PUBLIC_ROOT_DOMAIN`. Hoje está em `jpproject.com.br` como provisório. Trocar depois de barbearias instaladas significa migrar PWAs já instalados — o ícone na tela do celular aponta para a origem antiga. **Decidir antes da primeira barbearia externa.** |
| Conta do cliente final entre barbearias | Foi modelada como **global** (`/users/{uid}` na raiz): o cliente usa o mesmo login em qualquer barbearia e o histórico é por barbearia. Abre caminho para marketplace depois. Se a preferência for isolamento total, muda o modelo — e é mais caro depois. |
| Gateway | O PRD cita InfinitePay e Pagar.me. Split automático de comissão no recebimento (como o Trinks faz com a Belezinha) depende dessa escolha. |
| Preço final e limites do plano de entrada | Define o que `features` corta. |

---

## 8. O risco que vale nomear

O modo mais provável de isso dar errado não é técnico. É a primeira barbearia que pedir algo estrutural — "meu DRE precisa de outra linha", "quero cobrar comissão sobre o preço cheio", "minha agenda tem duas cadeiras com regras diferentes" — e a resposta ser sim.

Cada sim desses transforma o produto em consultoria com login. A defesa é o limite da seção 4, e ela precisa ser explícita antes do primeiro contrato, não depois.

---

## 9. Referências

- [`COMPARATIVO-MERCADO-2026-08.md`](./COMPARATIVO-MERCADO-2026-08.md) — posicionamento e preço
- [`ARQUITETURA.md`](./ARQUITETURA.md) — referência técnica
- [`AUDITORIA-2026-08-02.md`](./AUDITORIA-2026-08-02.md) — estado do código
- [`REVISAO-UIUX-2026-08-02.md`](./REVISAO-UIUX-2026-08-02.md) — interface e re-auditoria
- [`ONBOARDING-SELF-SERVICE.md`](./ONBOARDING-SELF-SERVICE.md) — cadastro, onboarding guiado e trial
- [`../prd-app-barbearia.md`](../prd-app-barbearia.md) §3 e §13 — fases e entidades
