-- CreateEnum
CREATE TYPE "lottery_state" AS ENUM ('ACTIVE', 'PAUSED', 'PENDING_DISABLE', 'DISABLED');

-- CreateEnum
CREATE TYPE "prize_kind" AS ENUM ('SOL', 'PHYSICAL');

-- CreateEnum
CREATE TYPE "round_state" AS ENUM ('OPEN', 'CLOSED', 'AWAITING_VRF', 'RESOLVED');

-- CreateTable
CREATE TABLE "lottery" (
    "pubkey" TEXT NOT NULL,
    "lottery_index" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "state" "lottery_state" NOT NULL,
    "prize_kind" "prize_kind" NOT NULL,
    "ticket_price_lamports" BIGINT NOT NULL,
    "duration_seconds" BIGINT NOT NULL,
    "auto_rollover" BOOLEAN NOT NULL DEFAULT false,
    "admin" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lottery_pkey" PRIMARY KEY ("pubkey")
);

-- CreateTable
CREATE TABLE "lottery_state_log" (
    "id" TEXT NOT NULL,
    "lottery_pubkey" TEXT NOT NULL,
    "previous_state" "lottery_state" NOT NULL,
    "new_state" "lottery_state" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "tx_signature" TEXT NOT NULL,

    CONSTRAINT "lottery_state_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lottery_round" (
    "pubkey" TEXT NOT NULL,
    "lottery_pubkey" TEXT NOT NULL,
    "index" BIGINT NOT NULL,
    "state" "round_state" NOT NULL DEFAULT 'OPEN',
    "ticket_price_lamports" BIGINT NOT NULL,
    "duration_seconds" BIGINT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "effective_end" TIMESTAMP(3) NOT NULL,
    "paused_total_seconds" BIGINT NOT NULL DEFAULT 0,
    "tickets_sold" BIGINT NOT NULL DEFAULT 0,
    "donated_lamports" BIGINT NOT NULL DEFAULT 0,
    "winner" TEXT,
    "winning_ticket_index" BIGINT,
    "pool_amount_lamports" BIGINT,
    "total_distributed_lamports" BIGINT,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "lottery_round_pkey" PRIMARY KEY ("pubkey")
);

-- CreateTable
CREATE TABLE "ticket_purchase" (
    "tx_signature" TEXT NOT NULL,
    "round_pubkey" TEXT NOT NULL,
    "buyer" TEXT NOT NULL,
    "quantity" BIGINT NOT NULL,
    "total_paid_lamports" BIGINT NOT NULL,
    "running_total" BIGINT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_purchase_pkey" PRIMARY KEY ("tx_signature")
);

-- CreateTable
CREATE TABLE "donation" (
    "tx_signature" TEXT NOT NULL,
    "round_pubkey" TEXT NOT NULL,
    "donor" TEXT NOT NULL,
    "amount_lamports" BIGINT NOT NULL,
    "running_total_lamports" BIGINT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "donation_pkey" PRIMARY KEY ("tx_signature")
);

-- CreateTable
CREATE TABLE "admin_transfer" (
    "tx_signature" TEXT NOT NULL,
    "previous_admin" TEXT NOT NULL,
    "new_admin" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_transfer_pkey" PRIMARY KEY ("tx_signature")
);

-- CreateTable
CREATE TABLE "raw_event" (
    "tx_signature" TEXT NOT NULL,
    "slot" BIGINT NOT NULL,
    "block_time" TIMESTAMP(3),
    "event_name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "raw_event_pkey" PRIMARY KEY ("tx_signature")
);

-- CreateIndex
CREATE UNIQUE INDEX "lottery_lottery_index_key" ON "lottery"("lottery_index");

-- CreateIndex
CREATE INDEX "lottery_state_idx" ON "lottery"("state");

-- CreateIndex
CREATE INDEX "lottery_state_log_lottery_pubkey_at_idx" ON "lottery_state_log"("lottery_pubkey", "at");

-- CreateIndex
CREATE INDEX "lottery_round_state_idx" ON "lottery_round"("state");

-- CreateIndex
CREATE UNIQUE INDEX "lottery_round_lottery_pubkey_index_key" ON "lottery_round"("lottery_pubkey", "index");

-- CreateIndex
CREATE INDEX "ticket_purchase_round_pubkey_at_idx" ON "ticket_purchase"("round_pubkey", "at");

-- CreateIndex
CREATE INDEX "ticket_purchase_buyer_idx" ON "ticket_purchase"("buyer");

-- CreateIndex
CREATE INDEX "donation_round_pubkey_at_idx" ON "donation"("round_pubkey", "at");

-- CreateIndex
CREATE INDEX "donation_donor_idx" ON "donation"("donor");

-- CreateIndex
CREATE INDEX "raw_event_event_name_slot_idx" ON "raw_event"("event_name", "slot");

-- AddForeignKey
ALTER TABLE "lottery_state_log" ADD CONSTRAINT "lottery_state_log_lottery_pubkey_fkey" FOREIGN KEY ("lottery_pubkey") REFERENCES "lottery"("pubkey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lottery_round" ADD CONSTRAINT "lottery_round_lottery_pubkey_fkey" FOREIGN KEY ("lottery_pubkey") REFERENCES "lottery"("pubkey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_purchase" ADD CONSTRAINT "ticket_purchase_round_pubkey_fkey" FOREIGN KEY ("round_pubkey") REFERENCES "lottery_round"("pubkey") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation" ADD CONSTRAINT "donation_round_pubkey_fkey" FOREIGN KEY ("round_pubkey") REFERENCES "lottery_round"("pubkey") ON DELETE RESTRICT ON UPDATE CASCADE;
