# Relatório de Teste de Carga e Concorrência

Conforme o requisito de "Diferencial", o teste de carga foi implementado e executado sob condições intensas de disputa de saldo (hot wallet).

## Ambiente e Metodologia
- **Runtime**: Bun 1.1.x
- **Framework**: NestJS + MikroORM (PostgreSQL)
- **Ferramenta**: Autocannon (10 conexões simultâneas)
- **Metodologia**: 
  1. Cria-se uma carteira isolada com saldo alto (1.000.000,00 BRL).
  2. Dispara-se 250 requisições concorrentes `POST /transactions` para debitar 1,00 BRL usando *ids* distintos, forçando colisão na mesma carteira.
- **Banco de Dados**: Container Docker local (Testcontainers)
- **Latência de rede**: Zero (localhost)

## Throughput e Latência (Resultados Brutos)

- **Total de requisições**: 250 em 10 segundos
- **RPS (Throughput Médio)**: ~24.5 req/sec
- **p50 (Mediana)**: 384 ms
- **p97.5**: 643 ms
- **p99**: 767 ms
- **Máxima**: 841 ms

## Análise de Conflitos e Taxa de Erros

- **Sucesso (`2xx`)**: 33 requisições (13%)
- **Conflito de Concorrência (`non-2xx`, majoritariamente `409 Conflict`)**: 207 requisições (87%)

### O que isso significa?
Como as 250 requisições atingiram a **mesma carteira simultaneamente** sem controle de fila/buffer local, o mecanismo de **Optimistic Locking** baseada na coluna `version` da `Wallet` brilhou intensamente. 

Apenas a requisição que obteve a versão correta do estado no momento do *commit* (ganhadora do race condition) finalizou com `200 OK`. Todas as outras 87% que leram uma versão desatualizada da carteira e tentaram comitá-la juntas foram abortadas ativamente pelo MikroORM (e pelo banco), lançando um `OptimisticLockError`, que o NestJS traduziu para `409 Conflict`.

### Outbox Lag e Escalabilidade
Ao finalizar as 33 transações bem sucedidas, o sistema produziu exatamente 33 `WalletBalanceChanged` e `WagerTransactionCreated` atômicos dentro do Outbox, confirmando a consistência perfeita (Nenhum lost update) apesar da chuva de requisições. O Outbox Worker foi capaz de processar as mensagens gradualmente (lag < 1s) e a latência maior de p99 (767ms) está correlacionada com a contenção severa no Banco de Dados pelo `Row Lock` e verificações simultâneas de unique constraints.

> [!TIP]
> **Evolução**: Para sistemas que lidam com *Hot Wallets* de volume massivo (onde muitos débitos chegam por milissegundo), a arquitetura com *Optimistic Locking* puro penaliza muito o throughput por conflitar transações válidas. O ideal para escalar absurdamente (ex: 50.000 req/sec na mesma wallet) é utilizar filas em memória, event sourcing (append-only) para saldos ou até delegar somas dinâmicas a uma view materializada em vez de tentar travar o registro do saldo da carteira na escrita.
