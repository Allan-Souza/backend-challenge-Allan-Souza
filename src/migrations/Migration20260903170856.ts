import { Migration } from '@mikro-orm/migrations';

export class Migration20260903170856 extends Migration {

  override name = 'Migration20260903170856';

  override up(): void | Promise<void> {
    this.addSql(`create table "inbox_messages" ("message_id" varchar(255) not null, "consumer_name" varchar(255) not null, "payload_hash" varchar(255) not null, "received_at" timestamptz not null, "processed_at" timestamptz null, primary key ("message_id", "consumer_name"));`);

    this.addSql(`create table "outbox_messages" ("id" varchar(255) not null, "aggregate_id" varchar(255) not null, "event_type" varchar(255) not null, "payload" jsonb not null, "occurred_at" timestamptz not null, "attempts" int not null, "next_attempt_at" timestamptz null, "published_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "outbox_messages_published_at_index" on "outbox_messages" ("published_at");`);
    this.addSql(`create index "outbox_messages_next_attempt_at_index" on "outbox_messages" ("next_attempt_at");`);

    this.addSql(`create table "wager_transactions" ("id" varchar(255) not null, "provider_id" varchar(255) not null, "external_transaction_id" varchar(255) not null, "idempotency_key" varchar(255) not null, "payload_hash" varchar(255) not null, "wallet_id" varchar(255) not null, "player_id" varchar(255) not null, "round_id" varchar(255) not null, "game_id" varchar(255) not null, "kind" text not null, "money_amount" numeric(18,2) not null, "money_currency" varchar(255) not null, "reference_external_transaction_id" varchar(255) null, "created_at" timestamptz not null, "status" text not null, "reference_transaction_id" varchar(255) null, "failure_code" text null, "processed_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "wager_transactions_provider_id_external_transaction_id_index" on "wager_transactions" ("provider_id", "external_transaction_id");`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_idempotency_key_unique" unique ("idempotency_key");`);

    this.addSql(`create table "wallets" ("id" varchar(255) not null, "player_id" varchar(255) not null, "currency" varchar(255) not null, "balance" numeric(18,2) not null, "version" int not null default 1, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "wallets" add constraint "wallets_player_id_currency_unique" unique ("player_id", "currency");`);
    this.addSql(`alter table "wallets" add constraint "wallets_balance_non_negative" check ("balance" >= 0);`);

    this.addSql(`create table "wallet_ledger" ("id" varchar(255) not null, "wallet_id" varchar(255) not null, "transaction_id" varchar(255) not null, "direction" text not null, "money_amount" numeric(18,2) not null, "money_currency" varchar(255) not null, "balance_before_amount" numeric(18,2) not null, "balance_before_currency" varchar(255) not null, "balance_after_amount" numeric(18,2) not null, "balance_after_currency" varchar(255) not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "wallet_ledger" add constraint "wallet_ledger_transaction_id_unique" unique ("transaction_id");`);
    this.addSql(`create index "wallet_ledger_wallet_id_created_at_index" on "wallet_ledger" ("wallet_id", "created_at");`);

    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_provider_external_unique" unique ("provider_id", "external_transaction_id");`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_kind_check" check ("kind" in ('OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK'));`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_status_check" check ("status" in ('PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED'));`);
    this.addSql(`alter table "wager_transactions" add constraint "wager_transactions_failure_code_check" check ("failure_code" in ('INSUFFICIENT_FUNDS', 'NEGATIVE_BALANCE', 'DUPLICATE_REFERENCE', 'REFERENCE_NOT_FOUND', 'INVALID_STATE', 'INVALID_CURRENCY', 'PROVIDER_MISMATCH', 'UNEXPECTED_ERROR'));`);

    this.addSql(`alter table "wallet_ledger" add constraint "wallet_ledger_direction_check" check ("direction" in ('DEBIT', 'CREDIT'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "inbox_messages" cascade;`);
    this.addSql(`drop table if exists "outbox_messages" cascade;`);
    this.addSql(`drop table if exists "wager_transactions" cascade;`);
    this.addSql(`drop table if exists "wallets" cascade;`);
    this.addSql(`drop table if exists "wallet_ledger" cascade;`);
  }

}
