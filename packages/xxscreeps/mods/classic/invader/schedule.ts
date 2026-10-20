import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { Role, Strength } from './processor.js';

export interface ScheduledInvader {
	boosted: boolean;
	name: string;
	role: Role;
	room: string;
	strength: Strength;
	x: number;
	y: number;
}

export const scheduledInvadersKey = (time: number) => `perf/invaders/scheduled/${time}`;
export const invaderLedgerKey = (name: string) => `perf/invaders/ledger/${name}`;

/** Store exact-tick native invaders durably; the pre-tick processor consumes this key idempotently. */
export async function scheduleInvaders(shard: Shard, time: number, additions: ScheduledInvader[]) {
	if (!Number.isSafeInteger(time) || time < 1) throw new Error('scheduled invader time must be a positive integer');
	const key = scheduledInvadersKey(time);
	const raw = await shard.data.get(key);
	const current = raw === null ? [] : JSON.parse(raw) as ScheduledInvader[];
	const names = new Set(current.map(invader => invader.name));
	for (const invader of additions) {
		if (!invader.name || names.has(invader.name)) throw new Error(`duplicate scheduled invader ${invader.name}`);
		names.add(invader.name);
	}
	await shard.data.set(key, JSON.stringify([ ...current, ...additions ]));
}

export async function readScheduledInvaders(shard: Shard, time: number): Promise<ScheduledInvader[]> {
	const raw = await shard.data.get(scheduledInvadersKey(time));
	return raw === null ? [] : JSON.parse(raw) as ScheduledInvader[];
}

