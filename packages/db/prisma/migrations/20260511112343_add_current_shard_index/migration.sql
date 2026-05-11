-- AlterTable
ALTER TABLE "lottery_round" ADD COLUMN     "current_shard_index" INTEGER NOT NULL DEFAULT 0;
