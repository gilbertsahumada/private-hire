import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

describe('operator broadcast safety', () => {
  it('rejects evaluation broadcast without authorization before accessing credentials', () => {
    const env = { ...process.env };
    delete env.ALLOW_ARC_BROADCAST;
    const result = spawnSync(
      'python3',
      ['scripts/jobs.py', 'evaluate', '--broadcast'],
      { env, encoding: 'utf8' },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Explicit authorization required');
  });

  it('never permits dispatch broadcast even with the authorization guard set', () => {
    const result = spawnSync(
      'python3',
      ['scripts/jobs.py', 'dispatch', '--broadcast'],
      {
        env: { ...process.env, ALLOW_ARC_BROADCAST: 'yes' },
        encoding: 'utf8',
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Explicit authorization required');
  });

  it('isolates report writing without changing the destination', () => {
    const standard = JSON.parse(
      readFileSync('apps/cre/jobs/config.staging.json', 'utf8'),
    );
    const broadcast = JSON.parse(
      readFileSync('apps/cre/jobs/config.staging-broadcast.json', 'utf8'),
    );
    expect(standard.writeReport).toBe(false);
    expect(broadcast).toEqual({ ...standard, writeReport: true });
  });
});
