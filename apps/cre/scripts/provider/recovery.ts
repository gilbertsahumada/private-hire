import type { Hex } from 'viem';
import { keccak256 } from 'viem';
import type { Journal } from './journal';

export type RecoveryIO = {
  receipt(
    hash: Hex,
  ): Promise<{ status: string; blockHash: string; blockNumber: bigint } | null>;
  blockHash(number: bigint): Promise<string>;
  now(): Promise<bigint>;
  broadcast(raw: Hex): Promise<unknown>;
  confirm(requestId: string, hash: Hex): Promise<unknown>;
  save(journal: Journal): void;
};

export async function recoverPending(journal: Journal, io: RecoveryIO) {
  const pending = journal.pending;
  if (!pending) return;
  if (keccak256(pending.raw as Hex) !== pending.hash)
    throw new Error('PROVIDER_JOURNAL_INVALID');
  const receipt = await io.receipt(pending.hash as Hex);
  if (!receipt) {
    if ((await io.now()) >= BigInt(pending.expiry))
      throw new Error('PROVIDER_EXPIRED_TRANSACTION_REQUIRES_REVIEW');
    await io.broadcast(pending.raw as Hex);
    throw new Error('PROVIDER_TRANSACTION_PENDING');
  }
  if ((await io.blockHash(receipt.blockNumber)) !== receipt.blockHash)
    throw new Error('PROVIDER_REORG_PENDING');
  await io.confirm(pending.requestId, pending.hash as Hex);
  if (receipt.status !== 'success')
    throw new Error('PROVIDER_REVERT_REQUIRES_REVIEW');
  io.save({ ...journal, pending: null });
}
