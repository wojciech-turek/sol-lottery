/**
 * Mapping between the DB's uppercase enum values (Prisma-generated) and the
 * lowercase string discriminants the on-chain SDK + frontend consume.
 * Centralized so the snapshot and admin routes can't drift apart.
 */

export const LOTTERY_STATE_MAP = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  PENDING_DISABLE: 'pendingDisable',
  DISABLED: 'disabled',
} as const;

export type LotteryStateLower = (typeof LOTTERY_STATE_MAP)[keyof typeof LOTTERY_STATE_MAP];

export const ROUND_STATE_MAP = {
  OPEN: 'open',
  CLOSED: 'closed',
  AWAITING_VRF: 'awaitingVrf',
  RESOLVED: 'resolved',
} as const;

export type RoundStateLower = (typeof ROUND_STATE_MAP)[keyof typeof ROUND_STATE_MAP];

export const PRIZE_KIND_MAP = {
  SOL: 'sol',
  PHYSICAL: 'physical',
} as const;

export type PrizeKindLower = (typeof PRIZE_KIND_MAP)[keyof typeof PRIZE_KIND_MAP];
