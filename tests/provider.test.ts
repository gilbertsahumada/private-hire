import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  nextAction,
  expectedData,
  validatePrepared,
  type Work,
} from '../apps/cre/scripts/provider/safety';
import { readJournal, saveJournal } from '../apps/cre/scripts/provider/journal';
import { MARKET, ARC } from '../packages/chain/src/index';
import { authorizeProvider } from '../apps/web/src/lib/provider';
import type { MarketEnv } from '../apps/web/src/lib/market-env';

const work: Work = {
  requestId: 'provider-test',
  jobId: '12',
  manifestHash: ('0x' + '11'.repeat(32)) as `0x${string}`,
  buyer: '0x2222222222222222222222222222222222222222',
  provider: MARKET.provider,
  escrow: MARKET.escrow,
  evaluator: '0x3333333333333333333333333333333333333333',
  expiredAt: 1000,
  budget: '10000',
  onchainBudget: '0',
  status: 0,
  input: {
    schemaVersion: 'portfolio-input/v1',
    requestId: 'provider-test',
    positions: [
      {
        assetId: 'sample-usdc',
        quantityAtomic: '25',
        quantityDecimals: 1,
        unitPriceMicrousd: '10000000',
      },
    ],
  },
};

describe('autonomous provider boundaries', () => {
  it('confirms a zero budget once and waits when the quoted price is set', () => {
    expect(nextAction(work, 999n, 10000n)).toBe('budget');
    expect(nextAction({ ...work, onchainBudget: '10000' }, 999n, 10000n)).toBe(
      'wait',
    );
    expect(() =>
      nextAction({ ...work, onchainBudget: '1' }, 999n, 10000n),
    ).toThrow('CONFLICT');
  });

  it('delivers only a funded matching-budget job before expiry', () => {
    expect(
      nextAction({ ...work, status: 1, onchainBudget: '10000' }, 999n, 10000n),
    ).toBe('submit');
    expect(
      nextAction({ ...work, status: 1, onchainBudget: '10000' }, 1000n, 10000n),
    ).toBe('skip');
    for (const status of [2, 3, 4, 5])
      expect(nextAction({ ...work, status }, 999n, 10000n)).toBe('skip');
    expect(() => nextAction({ ...work, status: 1 }, 999n, 10000n)).toThrow(
      'CONFLICT',
    );
  });

  it('refuses different provider, escrow, zero price and excess price', () => {
    expect(() =>
      nextAction({ ...work, provider: work.buyer }, 999n, 10000n),
    ).toThrow('DESTINATION');
    expect(() =>
      nextAction({ ...work, escrow: work.buyer }, 999n, 10000n),
    ).toThrow('DESTINATION');
    for (const budget of ['0', '10001'])
      expect(() => nextAction({ ...work, budget }, 999n, 10000n)).toThrow(
        'LIMIT',
      );
  });

  it('does not trust server-prepared arbitrary transactions', () => {
    const data = expectedData(work, 'budget');
    const prepared = {
      chainId: ARC.id,
      from: MARKET.provider,
      to: MARKET.escrow,
      data,
      value: '0',
    };
    expect(() => validatePrepared(prepared, data)).not.toThrow();
    for (const mutation of [
      { to: work.buyer },
      { from: work.buyer },
      { data: '0x' },
      { chainId: 1 },
      { value: '1' },
    ])
      expect(() =>
        validatePrepared({ ...prepared, ...mutation }, data),
      ).toThrow();
    expect(() => expectedData(work, 'submit')).toThrow('RESULT_MISSING');
  });

  it('rejects operator and context credentials on the provider route', async () => {
    const env = {
      PROVIDER_SERVICE_TOKEN: 'a'.repeat(32),
      JOB_OPERATOR_TOKEN: 'b'.repeat(32),
    } as MarketEnv;
    await expect(
      authorizeProvider(
        new Request('https://example.test', {
          headers: { Authorization: 'Bearer ' + 'b'.repeat(32) },
        }),
        env,
      ),
    ).rejects.toThrow('UNAUTHORIZED');
    await expect(
      authorizeProvider(
        new Request('https://example.test', {
          headers: { Authorization: 'Bearer ' + 'a'.repeat(32) },
        }),
        env,
      ),
    ).resolves.toBeUndefined();
  });

  it('recovers identical signed bytes after restart and rejects a corrupted journal', () => {
    const dir = mkdtempSync(join(tmpdir(), 'privatehire-provider-'));
    const path = join(dir, 'journal.json');
    try {
      const journal = readJournal(path);
      journal.reservedGasWei = '1234';
      journal.pending = {
        requestId: 'provider-test',
        action: 'budget',
        hash: '0x' + '11'.repeat(32),
        raw: '0x1234',
        expiry: 1000,
      };
      saveJournal(path, journal);
      expect(readJournal(path)).toEqual(journal);
      // A failed write left a temp file: the last committed journal must win.
      writeFileSync(path + '.tmp', 'partial');
      expect(readJournal(path).pending?.raw).toBe('0x1234');
      expect(readFileSync(path, 'utf8')).not.toContain('PRIVATE_KEY');
      writeFileSync(path, '{');
      expect(() => readJournal(path)).toThrow('JOURNAL_INVALID');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

describe('pending transaction recovery', () => {
  it('resends identical signed bytes after timeout and retains the pending operation', async () => {
    const { recoverPending } =
      await import('../apps/cre/scripts/provider/recovery');
    const { keccak256 } = await import('../apps/web/node_modules/viem');
    const { vi } = await import('vitest');
    const journal = {
      version: 1 as const,
      reservedGasWei: '1234',
      pending: {
        requestId: 'provider-test',
        action: 'submit' as const,
        hash: keccak256('0x1234'),
        raw: '0x1234',
        expiry: 1000,
      },
    };
    const io = {
      receipt: vi.fn().mockResolvedValue(null),
      blockHash: vi.fn(),
      now: vi.fn().mockResolvedValue(999n),
      broadcast: vi.fn().mockRejectedValue(new Error('timeout')),
      confirm: vi.fn(),
      save: vi.fn(),
    };
    await expect(recoverPending(journal, io)).rejects.toThrow('timeout');
    await expect(recoverPending(journal, io)).rejects.toThrow('timeout');
    expect(io.broadcast.mock.calls).toEqual([['0x1234'], ['0x1234']]);
    expect(io.save).not.toHaveBeenCalled();
    expect(journal.pending).not.toBeNull();
    io.now.mockResolvedValue(1000n);
    await expect(recoverPending(journal, io)).rejects.toThrow('EXPIRED');
    expect(io.broadcast).toHaveBeenCalledTimes(2);
  });

  it('keeps the journal through a reorg or confirmation failure and clears only after verification', async () => {
    const { recoverPending } =
      await import('../apps/cre/scripts/provider/recovery');
    const { keccak256 } = await import('../apps/web/node_modules/viem');
    const { vi } = await import('vitest');
    const journal = {
      version: 1 as const,
      reservedGasWei: '1234',
      pending: {
        requestId: 'provider-test',
        action: 'budget' as const,
        hash: keccak256('0x1234'),
        raw: '0x1234',
        expiry: 1000,
      },
    };
    const io = {
      receipt: vi
        .fn()
        .mockResolvedValue({
          status: 'success',
          blockHash: 'a',
          blockNumber: 4n,
        }),
      blockHash: vi.fn().mockResolvedValue('b'),
      now: vi.fn(),
      broadcast: vi.fn(),
      confirm: vi.fn().mockRejectedValue(new Error('API timeout')),
      save: vi.fn(),
    };
    await expect(recoverPending(journal, io)).rejects.toThrow('REORG');
    expect(io.confirm).not.toHaveBeenCalled();
    io.blockHash.mockResolvedValue('a');
    await expect(recoverPending(journal, io)).rejects.toThrow('API timeout');
    expect(io.save).not.toHaveBeenCalled();
    io.confirm.mockResolvedValue({});
    await recoverPending(journal, io);
    expect(io.save).toHaveBeenCalledWith({ ...journal, pending: null });
    expect(io.broadcast).not.toHaveBeenCalled();
  });
});
