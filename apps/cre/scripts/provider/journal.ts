import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';

const pendingSchema = z.object({
  requestId: z.string(),
  action: z.enum(['budget', 'submit']),
  hash: z.string().regex(/^0x[0-9a-f]{64}$/),
  raw: z.string().regex(/^0x[0-9a-f]+$/),
  expiry: z.number().int(),
});
const journalSchema = z.object({
  version: z.literal(1),
  reservedGasWei: z.string().regex(/^(0|[1-9][0-9]*)$/),
  pending: pendingSchema.nullable(),
});

export type Journal = z.infer<typeof journalSchema>;

export function readJournal(path: string): Journal {
  try {
    return journalSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { version: 1, reservedGasWei: '0', pending: null };
    throw new Error('PROVIDER_JOURNAL_INVALID');
  }
}

export function saveJournal(path: string, journal: Journal) {
  const temporary = path + '.tmp';
  const fd = openSync(temporary, 'w', 0o600);
  try {
    writeFileSync(fd, JSON.stringify(journalSchema.parse(journal)));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
  const directory = openSync(dirname(path), 'r');
  try {
    fsyncSync(directory);
  } finally {
    closeSync(directory);
  }
}
