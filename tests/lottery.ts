/**
 * End-to-end tests for the sol-lottery Anchor program.
 *
 * Each test in here doubles as a usage example. Comments explain the
 * mechanics in plain English so non-Rust readers can follow what's
 * happening on-chain.
 *
 * Run with: `anchor test` (spins up solana-test-validator automatically).
 */
import * as anchor from '@coral-xyz/anchor';
import * as web3 from '@solana/web3.js';
import { expect } from 'chai';
import type { Lottery as LotteryIdl } from '../target/types/lottery';

const { BN } = anchor;
type Program<T extends anchor.Idl = anchor.Idl> = anchor.Program<T>;
const { PublicKey, Keypair, SystemProgram, LAMPORTS_PER_SOL } = web3;
type PublicKey = web3.PublicKey;
type Keypair = web3.Keypair;

// ----------------------------- helpers -----------------------------

const padBytes = (s: string, n: number): number[] => {
  const buf = Buffer.alloc(n);
  buf.write(s, 'utf8');
  return Array.from(buf);
};

const u64Le = (v: bigint | number): Buffer => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(typeof v === 'bigint' ? v : BigInt(v), 0);
  return b;
};

const u32Le = (v: number): Buffer => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v, 0);
  return b;
};

interface SplitInput {
  label: string;
  destination: PublicKey;
  bps: number;
  isPool: boolean;
}

const toIdlSplit = (s: SplitInput) => ({
  label: padBytes(s.label, 16),
  destination: s.destination,
  bps: s.bps,
  isPool: s.isPool,
});

const airdrop = async (
  conn: anchor.web3.Connection,
  to: PublicKey,
  sol: number,
) => {
  const sig = await conn.requestAirdrop(to, sol * LAMPORTS_PER_SOL);
  await conn.confirmTransaction(sig, 'confirmed');
};

// ----------------------------- tests -------------------------------

describe('sol-lottery', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.lottery as Program<LotteryIdl>;
  const conn = provider.connection;
  const admin = (provider.wallet as anchor.Wallet).payer;

  // PDA helpers ---------------------------------------------------------
  const programId = program.programId;
  const globalConfigPda = (): PublicKey =>
    PublicKey.findProgramAddressSync([Buffer.from('config')], programId)[0];
  const lotteryPda = (id: bigint): PublicKey =>
    PublicKey.findProgramAddressSync(
      [Buffer.from('lottery'), u64Le(id)],
      programId,
    )[0];
  const roundPda = (lottery: PublicKey, index: bigint): PublicKey =>
    PublicKey.findProgramAddressSync(
      [Buffer.from('round'), lottery.toBuffer(), u64Le(index)],
      programId,
    )[0];
  const shardPda = (round: PublicKey, shardIndex: number): PublicKey =>
    PublicKey.findProgramAddressSync(
      [Buffer.from('shard'), round.toBuffer(), u32Le(shardIndex)],
      programId,
    )[0];
  const vrfPda = (round: PublicKey): PublicKey =>
    PublicKey.findProgramAddressSync(
      [Buffer.from('vrf'), round.toBuffer()],
      programId,
    )[0];

  // Bootstrap once: GlobalConfig must exist before any other test.
  before(async () => {
    const cfg = globalConfigPda();
    const acct = await conn.getAccountInfo(cfg);
    if (!acct) {
      await program.methods
        .initializeGlobal(PublicKey.default, PublicKey.default)
        .accounts({
          globalConfig: cfg,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
    }
  });

  // -- Helper: create a lottery + open round 1 --

  type LotteryFixture = {
    id: bigint;
    lottery: PublicKey;
    round: PublicKey;
    shard0: PublicKey;
    splits: SplitInput[];
  };

  const createLottery = async (opts: {
    name: string;
    durationSeconds: number;
    ticketPriceSol: number;
    splits: SplitInput[];
    autoRollover?: boolean;
    physical?: boolean;
  }): Promise<{ id: bigint; lottery: PublicKey; splits: SplitInput[] }> => {
    const cfg = await program.account.globalConfig.fetch(globalConfigPda());
    const id = BigInt(cfg.nextLotteryId.toString());
    const lottery = lotteryPda(id);

    await program.methods
      .createLottery(
        padBytes(opts.name, 32),
        new BN(opts.durationSeconds),
        new BN(opts.ticketPriceSol * LAMPORTS_PER_SOL),
        opts.physical ? { physical: {} } : { sol: {} },
        !!opts.autoRollover,
        opts.splits.map(toIdlSplit),
      )
      .accounts({
        globalConfig: globalConfigPda(),
        lottery,
        admin: admin.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin])
      .rpc();

    return { id, lottery, splits: opts.splits };
  };

  const openRound = async (
    lottery: PublicKey,
    index: bigint,
    payer: Keypair = admin,
    previousRound: PublicKey | null = null,
  ): Promise<{ round: PublicKey; shard0: PublicKey }> => {
    const round = roundPda(lottery, index);
    const shard0 = shardPda(round, 0);
    await program.methods
      .openRound(new BN(Number(index)))
      .accounts({
        globalConfig: globalConfigPda(),
        lottery,
        previousRound,
        round,
        shardZero: shard0,
        payer: payer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([payer])
      .rpc();
    return { round, shard0 };
  };

  const createAndOpen = async (opts: {
    name: string;
    durationSeconds: number;
    ticketPriceSol: number;
    splits: SplitInput[];
    autoRollover?: boolean;
    physical?: boolean;
  }): Promise<LotteryFixture> => {
    const { id, lottery, splits } = await createLottery(opts);
    const { round, shard0 } = await openRound(lottery, 1n);
    return { id, lottery, round, shard0, splits };
  };

  const buy = async (
    fixture: { lottery: PublicKey; round: PublicKey; shard0: PublicKey },
    buyer: Keypair,
    quantity: number,
  ) => {
    await program.methods
      .buyTickets(new BN(quantity))
      .accounts({
        lottery: fixture.lottery,
        round: fixture.round,
        currentShard: fixture.shard0,
        buyer: buyer.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();
  };

  // ============================================================
  // 1. SOL-prize happy path with split distributions
  // ============================================================

  it('runs a SOL-prize lottery end to end and pays out splits', async () => {
    const dev = Keypair.generate();
    const treasury = Keypair.generate();
    await airdrop(conn, dev.publicKey, 0.01);
    await airdrop(conn, treasury.publicKey, 0.01);

    const splits: SplitInput[] = [
      { label: 'pool', destination: PublicKey.default, bps: 8000, isPool: true },
      { label: 'dev', destination: dev.publicKey, bps: 1500, isPool: false },
      { label: 'treasury', destination: treasury.publicKey, bps: 500, isPool: false },
    ];
    const fx = await createAndOpen({
      name: 'sol-jackpot',
      durationSeconds: 60,
      ticketPriceSol: 0.1,
      splits,
    });

    const buyers = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
    for (const b of buyers) await airdrop(conn, b.publicKey, 5);
    await buy(fx, buyers[0], 2);
    await buy(fx, buyers[1], 5);
    await buy(fx, buyers[2], 3);

    const seed = Buffer.alloc(32);
    seed.writeBigUInt64LE(7n, 0);
    const winnerIndex = 7;
    const buyerOrder = [
      ...Array(2).fill(buyers[0].publicKey),
      ...Array(5).fill(buyers[1].publicKey),
      ...Array(3).fill(buyers[2].publicKey),
    ];
    const expectedWinner = buyerOrder[winnerIndex];

    const balBefore = {
      dev: await conn.getBalance(dev.publicKey),
      treasury: await conn.getBalance(treasury.publicKey),
      winner: await conn.getBalance(expectedWinner),
    };

    await program.methods
      .resolveRound(Array.from(seed))
      .accounts({
        globalConfig: globalConfigPda(),
        lottery: fx.lottery,
        round: fx.round,
        winnerShard: fx.shard0,
        admin: admin.publicKey,
      })
      .remainingAccounts([
        { pubkey: expectedWinner, isWritable: true, isSigner: false },
        { pubkey: dev.publicKey, isWritable: true, isSigner: false },
        { pubkey: treasury.publicKey, isWritable: true, isSigner: false },
      ])
      .signers([admin])
      .rpc();

    const gross = 10 * 0.1 * LAMPORTS_PER_SOL;
    expect(await conn.getBalance(dev.publicKey)).to.equal(balBefore.dev + gross * 0.15);
    expect(await conn.getBalance(treasury.publicKey)).to.equal(balBefore.treasury + gross * 0.05);
    expect(await conn.getBalance(expectedWinner)).to.equal(balBefore.winner + gross * 0.8);

    const round = await program.account.round.fetch(fx.round);
    expect(round.state).to.deep.equal({ resolved: {} });
    expect(round.winner!.toBase58()).to.equal(expectedWinner.toBase58());
  });

  // ============================================================
  // 2. Pause / resume
  // ============================================================

  it('rejects buys while paused and resumes timer correctly', async () => {
    const dev = Keypair.generate();
    await airdrop(conn, dev.publicKey, 0.01);
    const splits: SplitInput[] = [
      { label: 'pool', destination: PublicKey.default, bps: 9000, isPool: true },
      { label: 'dev', destination: dev.publicKey, bps: 1000, isPool: false },
    ];
    const fx = await createAndOpen({
      name: 'pause-test',
      durationSeconds: 60,
      ticketPriceSol: 0.05,
      splits,
    });

    const buyer = Keypair.generate();
    await airdrop(conn, buyer.publicKey, 1);

    await program.methods
      .pauseLottery()
      .accounts({
        globalConfig: globalConfigPda(),
        lottery: fx.lottery,
        round: fx.round,
        admin: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    let threw = false;
    try {
      await buy(fx, buyer, 1);
    } catch (err: any) {
      threw = true;
      expect(String(err)).to.match(/LotteryNotActive|LotteryPaused/);
    }
    expect(threw).to.equal(true);

    await program.methods
      .resumeLottery()
      .accounts({
        globalConfig: globalConfigPda(),
        lottery: fx.lottery,
        round: fx.round,
        admin: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    await buy(fx, buyer, 2);
    const round = await program.account.round.fetch(fx.round);
    expect(round.ticketsSold.toNumber()).to.equal(2);
  });

  // ============================================================
  // 3. Physical-prize lottery
  // ============================================================

  it('records a winner without paying out for a physical-prize lottery', async () => {
    const team = Keypair.generate();
    await airdrop(conn, team.publicKey, 0.01);
    const splits: SplitInput[] = [
      { label: 'team', destination: team.publicKey, bps: 10000, isPool: false },
    ];
    const fx = await createAndOpen({
      name: 'physical',
      durationSeconds: 60,
      ticketPriceSol: 0.2,
      splits,
      physical: true,
    });

    const buyer = Keypair.generate();
    await airdrop(conn, buyer.publicKey, 5);
    await buy(fx, buyer, 3);

    const balBeforeWinner = await conn.getBalance(buyer.publicKey);
    const seed = Buffer.alloc(32);
    await program.methods
      .resolveRound(Array.from(seed))
      .accounts({
        globalConfig: globalConfigPda(),
        lottery: fx.lottery,
        round: fx.round,
        winnerShard: fx.shard0,
        admin: admin.publicKey,
      })
      .remainingAccounts([
        { pubkey: team.publicKey, isWritable: true, isSigner: false },
      ])
      .signers([admin])
      .rpc();

    const round = await program.account.round.fetch(fx.round);
    expect(round.winner!.toBase58()).to.equal(buyer.publicKey.toBase58());
    expect(await conn.getBalance(buyer.publicKey)).to.equal(balBeforeWinner);
  });

  // ============================================================
  // 4. Manual VRF flow (admin-fulfill mock; works without ORAO)
  // ============================================================

  it('runs the manual request → fulfill → consume flow', async () => {
    const dev = Keypair.generate();
    await airdrop(conn, dev.publicKey, 0.01);
    const splits: SplitInput[] = [
      { label: 'pool', destination: PublicKey.default, bps: 7000, isPool: true },
      { label: 'dev', destination: dev.publicKey, bps: 3000, isPool: false },
    ];
    const fx = await createAndOpen({
      name: 'cron-flow',
      durationSeconds: 5,
      ticketPriceSol: 0.05,
      splits,
    });

    const buyer = Keypair.generate();
    await airdrop(conn, buyer.publicKey, 1);
    await buy(fx, buyer, 4);

    await new Promise((r) => setTimeout(r, 6500));

    const cron = Keypair.generate();
    await airdrop(conn, cron.publicKey, 1);

    await program.methods
      .requestResolution()
      .accounts({
        globalConfig: globalConfigPda(),
        lottery: fx.lottery,
        round: fx.round,
        vrfRequest: vrfPda(fx.round),
        caller: cron.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([cron])
      .rpc();

    const randomness = new Uint8Array(64);
    randomness[0] = 1;
    await program.methods
      .fulfillResolution(Array.from(randomness))
      .accounts({
        globalConfig: globalConfigPda(),
        vrfRequest: vrfPda(fx.round),
        admin: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    const balBefore = {
      dev: await conn.getBalance(dev.publicKey),
      buyer: await conn.getBalance(buyer.publicKey),
    };

    await program.methods
      .consumeResolution()
      .accounts({
        globalConfig: globalConfigPda(),
        lottery: fx.lottery,
        round: fx.round,
        vrfRequest: vrfPda(fx.round),
        winnerShard: fx.shard0,
        caller: cron.publicKey,
      })
      .remainingAccounts([
        { pubkey: buyer.publicKey, isWritable: true, isSigner: false },
        { pubkey: dev.publicKey, isWritable: true, isSigner: false },
      ])
      .signers([cron])
      .rpc();

    const round = await program.account.round.fetch(fx.round);
    expect(round.state).to.deep.equal({ resolved: {} });
    expect(round.winner!.toBase58()).to.equal(buyer.publicKey.toBase58());
    const gross = 4 * 0.05 * LAMPORTS_PER_SOL;
    expect(await conn.getBalance(dev.publicKey)).to.equal(balBefore.dev + gross * 0.3);
    expect(await conn.getBalance(buyer.publicKey)).to.equal(balBefore.buyer + gross * 0.7);
  });

  // ============================================================
  // 5. Begin/finalize disable + close
  // ============================================================

  it('handles begin_disable → resolve → finalize_disable → close_lottery', async () => {
    const dev = Keypair.generate();
    await airdrop(conn, dev.publicKey, 0.01);
    const splits: SplitInput[] = [
      { label: 'pool', destination: PublicKey.default, bps: 9000, isPool: true },
      { label: 'dev', destination: dev.publicKey, bps: 1000, isPool: false },
    ];
    const fx = await createAndOpen({
      name: 'disable',
      durationSeconds: 60,
      ticketPriceSol: 0.05,
      splits,
    });

    const buyer = Keypair.generate();
    await airdrop(conn, buyer.publicKey, 1);
    await buy(fx, buyer, 2);

    await program.methods
      .beginDisableLottery()
      .accounts({
        globalConfig: globalConfigPda(),
        lottery: fx.lottery,
        admin: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    const seed = Buffer.alloc(32);
    await program.methods
      .resolveRound(Array.from(seed))
      .accounts({
        globalConfig: globalConfigPda(),
        lottery: fx.lottery,
        round: fx.round,
        winnerShard: fx.shard0,
        admin: admin.publicKey,
      })
      .remainingAccounts([
        { pubkey: buyer.publicKey, isWritable: true, isSigner: false },
        { pubkey: dev.publicKey, isWritable: true, isSigner: false },
      ])
      .signers([admin])
      .rpc();

    const lottery = await program.account.lottery.fetch(fx.lottery);
    expect(lottery.state).to.deep.equal({ disabled: {} });

    await program.methods
      .closeLottery()
      .accounts({
        globalConfig: globalConfigPda(),
        lottery: fx.lottery,
        admin: admin.publicKey,
      })
      .signers([admin])
      .rpc();
    expect(await conn.getAccountInfo(fx.lottery)).to.equal(null);
  });

  // ============================================================
  // 6. Auto-rollover: round 2 opened by a non-admin caller
  // ============================================================

  it('auto-rolls into the next round when auto_rollover is enabled', async () => {
    const dev = Keypair.generate();
    await airdrop(conn, dev.publicKey, 0.01);
    const splits: SplitInput[] = [
      { label: 'pool', destination: PublicKey.default, bps: 9000, isPool: true },
      { label: 'dev', destination: dev.publicKey, bps: 1000, isPool: false },
    ];
    const fx = await createAndOpen({
      name: 'rollover',
      durationSeconds: 60,
      ticketPriceSol: 0.05,
      splits,
      autoRollover: true,
    });

    const buyer = Keypair.generate();
    await airdrop(conn, buyer.publicKey, 1);
    await buy(fx, buyer, 1);

    // Resolve round 1.
    const seed = Buffer.alloc(32);
    await program.methods
      .resolveRound(Array.from(seed))
      .accounts({
        globalConfig: globalConfigPda(),
        lottery: fx.lottery,
        round: fx.round,
        winnerShard: fx.shard0,
        admin: admin.publicKey,
      })
      .remainingAccounts([
        { pubkey: buyer.publicKey, isWritable: true, isSigner: false },
        { pubkey: dev.publicKey, isWritable: true, isSigner: false },
      ])
      .signers([admin])
      .rpc();

    // A non-admin opens round 2 (only allowed because auto_rollover=true).
    const cron = Keypair.generate();
    await airdrop(conn, cron.publicKey, 5); // pays the round + shard rent
    const round2 = roundPda(fx.lottery, 2n);
    const shard2_0 = shardPda(round2, 0);
    await program.methods
      .openRound(new BN(2))
      .accounts({
        globalConfig: globalConfigPda(),
        lottery: fx.lottery,
        previousRound: fx.round,
        round: round2,
        shardZero: shard2_0,
        payer: cron.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([cron])
      .rpc();

    const round2Data = await program.account.round.fetch(round2);
    expect(round2Data.index.toNumber()).to.equal(2);
    expect(round2Data.state).to.deep.equal({ open: {} });
  });

  // ============================================================
  // 7. Auto-rollover refused when flag is OFF
  // ============================================================

  it('refuses non-admin rollover when auto_rollover is disabled', async () => {
    const dev = Keypair.generate();
    await airdrop(conn, dev.publicKey, 0.01);
    const splits: SplitInput[] = [
      { label: 'pool', destination: PublicKey.default, bps: 10000, isPool: true },
    ];
    const fx = await createAndOpen({
      name: 'no-rollover',
      durationSeconds: 60,
      ticketPriceSol: 0.05,
      splits,
      autoRollover: false,
    });

    const buyer = Keypair.generate();
    await airdrop(conn, buyer.publicKey, 1);
    await buy(fx, buyer, 1);

    const seed = Buffer.alloc(32);
    await program.methods
      .resolveRound(Array.from(seed))
      .accounts({
        globalConfig: globalConfigPda(),
        lottery: fx.lottery,
        round: fx.round,
        winnerShard: fx.shard0,
        admin: admin.publicKey,
      })
      .remainingAccounts([
        { pubkey: buyer.publicKey, isWritable: true, isSigner: false },
      ])
      .signers([admin])
      .rpc();

    const cron = Keypair.generate();
    await airdrop(conn, cron.publicKey, 5);
    const round2 = roundPda(fx.lottery, 2n);
    const shard2_0 = shardPda(round2, 0);
    let threw = false;
    try {
      await program.methods
        .openRound(new BN(2))
        .accounts({
          globalConfig: globalConfigPda(),
          lottery: fx.lottery,
          previousRound: fx.round,
          round: round2,
          shardZero: shard2_0,
          payer: cron.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([cron])
        .rpc();
    } catch (err: any) {
      threw = true;
      expect(String(err)).to.match(/Unauthorized/);
    }
    expect(threw).to.equal(true);
  });

  // ============================================================
  // 8. Quantity > 320 is rejected
  // ============================================================

  it('rejects quantity exceeding 128 per call', async () => {
    const dev = Keypair.generate();
    await airdrop(conn, dev.publicKey, 0.01);
    const splits: SplitInput[] = [
      { label: 'pool', destination: PublicKey.default, bps: 9000, isPool: true },
      { label: 'dev', destination: dev.publicKey, bps: 1000, isPool: false },
    ];
    const fx = await createAndOpen({
      name: 'qty-cap',
      durationSeconds: 60,
      ticketPriceSol: 0.001,
      splits,
    });

    const buyer = Keypair.generate();
    await airdrop(conn, buyer.publicKey, 5);

    // 129 fails — exceeds the per-call cap.
    let threw = false;
    try {
      await buy(fx, buyer, 129);
    } catch (err: any) {
      threw = true;
      expect(String(err)).to.match(/QuantityTooLarge/);
    }
    expect(threw).to.equal(true);

    // 128 is the maximum allowed in one call.
    await buy(fx, buyer, 128);
    const round = await program.account.round.fetch(fx.round);
    expect(round.ticketsSold.toNumber()).to.equal(128);
  });

  // ============================================================
  // 9. Splits validation: sum != 100% rejected
  // ============================================================

  it('rejects splits that do not sum to 10000 bps', async () => {
    const dev = Keypair.generate();
    await airdrop(conn, dev.publicKey, 0.01);
    const cfg = await program.account.globalConfig.fetch(globalConfigPda());
    const id = BigInt(cfg.nextLotteryId.toString());
    const lottery = lotteryPda(id);

    const badSplits: SplitInput[] = [
      { label: 'pool', destination: PublicKey.default, bps: 9000, isPool: true }, // 90% only
    ];
    let threw = false;
    try {
      await program.methods
        .createLottery(
          padBytes('bad-splits', 32),
          new BN(60),
          new BN(0.1 * LAMPORTS_PER_SOL),
          { sol: {} },
          false,
          badSplits.map(toIdlSplit),
        )
        .accounts({
          globalConfig: globalConfigPda(),
          lottery,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
    } catch (err: any) {
      threw = true;
      expect(String(err)).to.match(/SplitsMustSumTo100Percent/);
    }
    expect(threw).to.equal(true);
  });

  // ============================================================
  // 10. Splits validation: bps not multiple of 100
  // ============================================================

  it('rejects splits with bps that are not multiples of 100', async () => {
    const dev = Keypair.generate();
    await airdrop(conn, dev.publicKey, 0.01);
    const cfg = await program.account.globalConfig.fetch(globalConfigPda());
    const id = BigInt(cfg.nextLotteryId.toString());
    const lottery = lotteryPda(id);

    const badSplits: SplitInput[] = [
      { label: 'pool', destination: PublicKey.default, bps: 9050, isPool: true },
      { label: 'dev', destination: dev.publicKey, bps: 950, isPool: false },
    ];
    let threw = false;
    try {
      await program.methods
        .createLottery(
          padBytes('bad-bps', 32),
          new BN(60),
          new BN(0.1 * LAMPORTS_PER_SOL),
          { sol: {} },
          false,
          badSplits.map(toIdlSplit),
        )
        .accounts({
          globalConfig: globalConfigPda(),
          lottery,
          admin: admin.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
    } catch (err: any) {
      threw = true;
      expect(String(err)).to.match(/BpsNotMultipleOf100/);
    }
    expect(threw).to.equal(true);
  });

  // ============================================================
  // 11. Wrong split destination in resolve is rejected
  // ============================================================

  it('rejects resolve when remaining_accounts do not match splits', async () => {
    const dev = Keypair.generate();
    await airdrop(conn, dev.publicKey, 0.01);
    const splits: SplitInput[] = [
      { label: 'pool', destination: PublicKey.default, bps: 8000, isPool: true },
      { label: 'dev', destination: dev.publicKey, bps: 2000, isPool: false },
    ];
    const fx = await createAndOpen({
      name: 'wrong-dest',
      durationSeconds: 60,
      ticketPriceSol: 0.05,
      splits,
    });

    const buyer = Keypair.generate();
    await airdrop(conn, buyer.publicKey, 1);
    await buy(fx, buyer, 1);

    const evil = Keypair.generate(); // not the configured dev
    await airdrop(conn, evil.publicKey, 0.01);

    const seed = Buffer.alloc(32);
    let threw = false;
    try {
      await program.methods
        .resolveRound(Array.from(seed))
        .accounts({
          globalConfig: globalConfigPda(),
          lottery: fx.lottery,
          round: fx.round,
          winnerShard: fx.shard0,
          admin: admin.publicKey,
        })
        .remainingAccounts([
          { pubkey: buyer.publicKey, isWritable: true, isSigner: false }, // pool ok
          { pubkey: evil.publicKey, isWritable: true, isSigner: false }, // wrong!
        ])
        .signers([admin])
        .rpc();
    } catch (err: any) {
      threw = true;
      expect(String(err)).to.match(/WrongSplitDestination/);
    }
    expect(threw).to.equal(true);
  });

  // ============================================================
  // 12b. ORAO VRF live integration (skipped by default — requires
  //      cloning the ORAO devnet program + state into the local validator)
  // ============================================================
  //
  // To enable:
  //   1. Add to Anchor.toml under [[test.validator.clone]]:
  //        VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y                 (program)
  //        <ORAO network_state PDA>                                     (config)
  //        <ORAO treasury (read from network_state.config.treasury)>    (vault)
  //   2. Set [test.validator] url = "https://api.devnet.solana.com"
  //   3. Drop the `.skip` below.
  //
  // Even with the program loaded, randomness will not be fulfilled locally
  // because no ORAO oracle is running. The test below stops at request
  // and asserts the CPI succeeded (the randomness account exists). Live
  // end-to-end resolution requires running against devnet itself.
  it.skip('requests randomness via ORAO VRF (live)', async () => {
    const ORAO_PROGRAM_ID = new PublicKey(
      'VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y',
    );
    const oraoNetworkState = PublicKey.findProgramAddressSync(
      [Buffer.from('orao-vrf-network-configuration')],
      ORAO_PROGRAM_ID,
    )[0];

    const dev = Keypair.generate();
    await airdrop(conn, dev.publicKey, 0.01);
    const splits: SplitInput[] = [
      { label: 'pool', destination: PublicKey.default, bps: 9000, isPool: true },
      { label: 'dev', destination: dev.publicKey, bps: 1000, isPool: false },
    ];
    const fx = await createAndOpen({
      name: 'orao-live',
      durationSeconds: 5,
      ticketPriceSol: 0.05,
      splits,
    });

    const buyer = Keypair.generate();
    await airdrop(conn, buyer.publicKey, 1);
    await buy(fx, buyer, 1);

    await new Promise((r) => setTimeout(r, 6500));

    const oraoVrfRequest = PublicKey.findProgramAddressSync(
      [Buffer.from('orao-vrf-randomness-request'), fx.round.toBuffer()],
      ORAO_PROGRAM_ID,
    )[0];

    // Treasury must be the address read from network_state.config.treasury.
    const treasury = new PublicKey('REPLACE_ME_WITH_DEVNET_TREASURY');

    const cron = Keypair.generate();
    await airdrop(conn, cron.publicKey, 1);

    await program.methods
      .requestOraoResolution()
      .accounts({
        globalConfig: globalConfigPda(),
        lottery: fx.lottery,
        round: fx.round,
        vrfRequest: oraoVrfRequest,
        vrfTreasury: treasury,
        vrfNetworkState: oraoNetworkState,
        vrfProgram: ORAO_PROGRAM_ID,
        caller: cron.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([cron])
      .rpc();

    const round = await program.account.round.fetch(fx.round);
    expect(round.state).to.deep.equal({ awaitingVrf: {} });
  });

  // ============================================================
  // 13. close_shard returns rent after resolve
  // ============================================================

  it('closes a shard after resolve and returns rent to admin', async () => {
    const dev = Keypair.generate();
    await airdrop(conn, dev.publicKey, 0.01);
    const splits: SplitInput[] = [
      { label: 'pool', destination: PublicKey.default, bps: 9000, isPool: true },
      { label: 'dev', destination: dev.publicKey, bps: 1000, isPool: false },
    ];
    const fx = await createAndOpen({
      name: 'close-shard',
      durationSeconds: 60,
      ticketPriceSol: 0.05,
      splits,
    });

    const buyer = Keypair.generate();
    await airdrop(conn, buyer.publicKey, 1);
    await buy(fx, buyer, 2);

    const seed = Buffer.alloc(32);
    await program.methods
      .resolveRound(Array.from(seed))
      .accounts({
        globalConfig: globalConfigPda(),
        lottery: fx.lottery,
        round: fx.round,
        winnerShard: fx.shard0,
        admin: admin.publicKey,
      })
      .remainingAccounts([
        { pubkey: buyer.publicKey, isWritable: true, isSigner: false },
        { pubkey: dev.publicKey, isWritable: true, isSigner: false },
      ])
      .signers([admin])
      .rpc();

    const adminBefore = await conn.getBalance(admin.publicKey);
    const shardLamportsBefore = (await conn.getAccountInfo(fx.shard0))!.lamports;

    await program.methods
      .closeShard()
      .accounts({
        globalConfig: globalConfigPda(),
        lottery: fx.lottery,
        round: fx.round,
        shard: fx.shard0,
        rentRecipient: admin.publicKey,
        caller: admin.publicKey,
      })
      .signers([admin])
      .rpc();

    expect(await conn.getAccountInfo(fx.shard0)).to.equal(null);
    const adminAfter = await conn.getBalance(admin.publicKey);
    // Admin paid a tx fee but recovered the shard's rent. Net delta should be
    // close to +shardLamportsBefore (minus fee).
    expect(adminAfter - adminBefore).to.be.greaterThan(shardLamportsBefore - 10_000);
  });
});
