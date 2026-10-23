import type { Shard } from 'xxscreeps/engine/db/index.js';
import { assert, describe, test } from 'xxscreeps/test/index.js';
import { scheduleRunnerCpuBucket, takeScheduledRunnerCpuBucket } from './model.js';

class Data {
	readonly values = new Map<string, string>();
	async get(key: string) { return this.values.get(key) ?? null; }
	async set(key: string, value: string) { this.values.set(key, value); }
	async vDel(key: string) { this.values.delete(key); }
}

describe('scheduled runner CPU buckets', () => {
	test('delivers a configured bucket once at its exact tick', async () => {
		const data = new Data();
		const shard = { data } as unknown as Shard;
		await scheduleRunnerCpuBucket(shard, 'user-1', 42, 1_000);
		assert.strictEqual(await takeScheduledRunnerCpuBucket(shard, 'user-1', 41), undefined);
		assert.strictEqual(await takeScheduledRunnerCpuBucket(shard, 'user-1', 42), 1_000);
		assert.strictEqual(await takeScheduledRunnerCpuBucket(shard, 'user-1', 42), undefined);
	});

	test('refuses ambiguous, malformed, or corrupt bucket controls', async () => {
		const data = new Data();
		const shard = { data } as unknown as Shard;
		await assert.rejects(() => scheduleRunnerCpuBucket(shard, 'user-1', 1, 1), /at least two/);
		await assert.rejects(() => scheduleRunnerCpuBucket(shard, 'user-1', 2, -1), /non-negative/);
		await scheduleRunnerCpuBucket(shard, 'user-1', 2, 0);
		await assert.rejects(() => scheduleRunnerCpuBucket(shard, 'user-1', 2, 1), /already scheduled/);
		data.values.set('user/user-1/scheduledCpuBucket/3', 'not-a-number');
		await assert.rejects(() => takeScheduledRunnerCpuBucket(shard, 'user-1', 3), /corrupt/);
	});
});
