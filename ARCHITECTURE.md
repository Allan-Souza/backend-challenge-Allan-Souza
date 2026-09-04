# Distributed Wagering Processor

## 1. Visão Geral da Arquitetura

O sistema segue uma arquitetura hexagonal (Ports & Adapters) com camadas bem definidas:

```
┌──────────────────────────────────────────────────┐
│                 Presentation Layer                │
│  HTTP Controllers  │  SQS Consumer (Inbox Worker) │
├──────────────────────────────────────────────────┤
│                Application Layer                  │
│      Use Cases  │  Workers (Outbox, Pending Ref)  │
├──────────────────────────────────────────────────┤
│                  Domain Layer                     │
│  Money │ Wallet │ WagerTransaction │ LedgerEntry  │
│         InboxMessage │ OutboxMessage              │
├──────────────────────────────────────────────────┤
│              Infrastructure Layer                 │
│  MikroORM Repositories │ SQS Client │ Entities    │
└──────────────────────────────────────────────────┘
```

---

## 2. Decisões Técnicas

### 2.1 ORM — MikroORM (preferencial)

**Escolha**: MikroORM v7 com EntitySchema (sem decorators).

**Justificativa**:
- **Unit of Work explícito** — todas as operações de uma transação financeira (wallet, ledger, inbox, outbox) são persistidas atomicamente via `EntityManager.transactional()`.
- **Identity Map** — evita inconsistências de leitura dentro da mesma transação.
- **Optimistic Locking nativo** — o campo `version` no `WalletEntity` é gerenciado automaticamente pelo MikroORM, lançando `OptimisticLockError` quando duas escritas concorrentes colidem.
- **Migrations versionadas** — geradas via `mikro-orm migration:create` e reversíveis.

### 2.2 Representação Monetária — `decimal.js`

**Escolha**: `decimal.js` para todas as operações financeiras.

**Justificativa**: O JavaScript nativo (`number`, `float`, `double`) sofre de imprecisão em ponto flutuante (ex: `0.1 + 0.2 !== 0.3`). Usamos `Decimal` com escala fixa de 2 casas decimais. O `Money` é um Value Object imutável que encapsula valor + moeda e valida entradas inválidas (`NaN`, `Infinity`, notação científica, strings vazias, mais de 2 casas).

**Persistência**: O `balance` é armazenado como `numeric(20,2)` no PostgreSQL, garantindo precisão exata no banco. A coluna `currency` é separada (`varchar(3)`, ISO-4217).

### 2.3 Estratégia de Concorrência — Optimistic Locking

**Escolha**: Optimistic Locking via coluna `version` na tabela `wallets`.

**Justificativa**: Em cenários de iGaming, a maioria das operações não conflita (wallets distintas). O Optimistic Locking permite paralelismo máximo sem degradar throughput. Quando duas operações atingem a mesma wallet simultaneamente, uma delas falha com `OptimisticLockError`, que é traduzido para `409 Conflict` pelo `GlobalExceptionFilter`.

**Trade-off**: Em cenários de "hot wallet" (muitas apostas simultâneas na mesma carteira), a taxa de rejeição sobe. Isso foi comprovado no teste de carga: das 250 requests simultâneas na mesma wallet, ~87% falharam por conflito de versão. Para cenários de produção com hot wallets, considerar: (a) retry automático com backoff, (b) pessimistic locking seletivo, ou (c) event sourcing.

**Alternativa descartada**: Pessimistic Locking (`SELECT ... FOR UPDATE`) — bloqueia a row e serializa as operações, mas reduz drasticamente o throughput e pode causar deadlocks entre múltiplas instâncias.

### 2.4 Idempotência — Persistente via `idempotency_key`

**Implementação**:
- O header `Idempotency-Key` é obrigatório em `POST /wagering/transactions`.
- O valor padrão é `{providerId}:{externalTransactionId}`.
- A coluna `idempotency_key` na tabela `wager_transactions` possui uma `UNIQUE` constraint no banco.
- O `payloadHash` é calculado via SHA-256 sobre um JSON canônico (chaves ordenadas alfabeticamente) dos campos de negócio do body (excluindo headers e metadados de transporte).
- **Replay**: Mesma key + mesmo payload → retorna resultado original com `idempotentReplay: true`.
- **Conflito**: Mesma key + payload diferente → `409 Conflict`.

### 2.5 Mensageria — ElasticMQ (SQS-compatible)

**Escolha**: `softwaremill/elasticmq-native` em vez de LocalStack.

**Justificativa**: A versão mais recente do LocalStack (`2026.8.x`) passou a exigir licença PRO para o serviço SQS, tornando-o inutilizável em ambiente local sem credenciais. O ElasticMQ é um substituto leve, open-source, 100% compatível com a API do AWS SQS, e é a mesma tecnologia subjacente utilizada pelo MiniStack (mencionado como alternativa aceitável no README do desafio).

**Filas criadas**:
- `wager-transactions.fifo` — entrada de transações de apostas
- `wager-transactions-dlq.fifo` — Dead Letter Queue (maxReceiveCount: 3)
- `outbox-events.fifo` — saída de eventos de integração

### 2.6 Transactional Outbox

**Padrão**: O evento de integração (`OutboxMessage`) é persistido na mesma transação SQL que a alteração financeira. Um worker separado (`OutboxWorkerService`) faz polling periódico na tabela `outbox_messages`, publica no SQS e marca como `publishedAt`.

**Concorrência entre publishers**: O Outbox Worker usa `LockMode.PESSIMISTIC_WRITE` (`FOR UPDATE`) para garantir que múltiplos publishers não processem a mesma mensagem simultaneamente.

**Backoff exponencial**: Em caso de falha de publicação, o `nextAttemptAt` é calculado como `2^attempts * 1000ms` (máx. 60s).

### 2.7 Inbox Pattern (Deduplicação de SQS)

O `InboxWorkerService` consome mensagens da fila `wager-transactions.fifo` e:
1. Reutiliza o **mesmo use case** (`SubmitWagerTransactionUseCase`) da entrada HTTP.
2. Persiste um `InboxMessage` com `(consumerName, messageId)` na mesma transação SQL.
3. Faz `deleteMessage` (ACK) **somente após o commit**.
4. Se o processo morrer entre o commit e o ACK, a mensagem retorna à fila pelo visibility timeout, mas o `InboxMessage` já existe no banco, prevenindo processamento duplo.

---

## 3. Autenticação

**Decisão**: Não implementada neste desafio.

**Justificativa**: Conforme a seção 2 do README, autenticação **não vale pontos** na tabela de avaliação e não deve competir com correção financeira, concorrência e idempotência. O foco foi direcionado integralmente para as áreas de maior pontuação.

**Ponto de extensão**: O sistema está preparado para receber um `AuthGuard` global via NestJS. Os endpoints de health (`/health/liveness`, `/health/readiness`) permaneceriam abertos. Mensagens vindas da fila SQS são tratadas como canal interno confiável.

**Desenho que adotaria**: Integração com **Keycloak** ou **Zitadel** via OIDC, validando JWT tokens no `AuthGuard` e extraindo o `providerId` do token para vincular à identidade do provedor nas operações.

---

## 4. Modelo de Dados (Schema)

### Constraints no banco (aplicadas via migrations):
- `wallets`: `UNIQUE(player_id, currency)`, `CHECK(balance >= 0)`, `version` para optimistic lock
- `wager_transactions`: `UNIQUE(idempotency_key)`, `UNIQUE(provider_id, external_transaction_id)`
- `wallet_ledger_entries`: Imutável (sem UPDATE/DELETE), foreign keys para `wallet_id` e `transaction_id`
- `inbox_messages`: `UNIQUE(consumer_name, message_id)`
- `outbox_messages`: Índice em `published_at IS NULL` para polling eficiente

---

## 5. Códigos de Falha (FailureCode)

| Código | Descrição | Ação do provedor |
|--------|-----------|------------------|
| `INSUFFICIENT_FUNDS` | Saldo insuficiente para débito (BET) | Não reenviar |
| `NEGATIVE_BALANCE` | Reversão produziria saldo negativo | Não reenviar |
| `DUPLICATE_REFERENCE` | Referência já revertida | Não reenviar |
| `REFERENCE_NOT_FOUND` | Referência exigida mas ausente/inexistente | Verificar externalTransactionId |
| `INVALID_STATE` | Transição de estado inválida | Não reenviar |
| `INVALID_CURRENCY` | Moeda da operação diferente da wallet | Corrigir payload |
| `PROVIDER_MISMATCH` | Provider da referência diferente | Corrigir payload |
| `UNEXPECTED_ERROR` | Erro inesperado de infraestrutura | Pode reenviar |

---

## 6. Trade-offs e Limitações Conhecidas

1. **Sem retry automático no HTTP**: Quando o Optimistic Lock falha, o sistema retorna 409 imediatamente sem tentar novamente. Em produção, um middleware de retry com backoff seria recomendado.

2. **Moeda única (BRL)**: O modelo suporta multi-moeda (`currency` em todas as entidades), mas os testes e cenários focam em BRL para reduzir escopo.

3. **Outbox polling**: O worker faz polling a cada 2s. Em produção, considerar CDC (Change Data Capture) via PostgreSQL LISTEN/NOTIFY ou Debezium para menor latência.

4. **Sem métricas Prometheus**: Implementamos logs estruturados via `nestjs-pino`, mas não instrumentamos contadores/histogramas. Em produção, usar `@opentelemetry/sdk-node` ou `prom-client`.

5. **ElasticMQ vs LocalStack**: O ElasticMQ não suporta 100% das features do SQS (ex: `MessageGroupId` ordering é simplificado). Para testes de integração mais fiéis, usar LocalStack com licença válida.

---

## 7. Comandos

```bash
# Subir infraestrutura
docker compose up -d

# Rodar aplicação
bun run start

# Testes unitários
bun run test

# Testes E2E (com Testcontainers)
bun run test:e2e

# Teste de carga
bun run test:load

# Migrations
bunx mikro-orm migration:create
bunx mikro-orm migration:up
```
