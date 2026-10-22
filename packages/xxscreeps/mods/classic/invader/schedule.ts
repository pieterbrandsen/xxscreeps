import type { Shard } from 'xxscreeps/engine/db/index.js';
import { registerShardTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { pushIntentsForRoomNextTick } from 'xxscreeps/engine/processor/model.js';
import { kInvaderUserId } from './game.js';
import type { Role, Strength } from './model.js';

export interface ScheduledInvader {
	boosted: boolean;
	name: string;
	role: Role;
	room: string;
	strength: Strength;
	x: number;
	y: number;
}

const scheduledInvadersKey = (dispatchTime: number) => `perf/invaders/scheduled/${dispatchTime}`;

/** Store invaders one tick before their target so normal room processing creates and publishes them on time. */
export async function scheduleInvaders(shard: Shard, time: number, additions: ScheduledInvader[]) {
	if (!Number.isSafeInteger(time) || time < 2) throw new Error('scheduled invader time must be at least two');
	const key = scheduledInvadersKey(time - 1);
	const raw = await shard.data.get(key);
	const current = raw === null ? [] : JSON.parse(raw) as ScheduledInvader[];
	const names = new Set(current.map(invader => invader.name));
	for (const invader of additions) {
		if (!invader.name || names.has(invader.name)) throw new Error(`duplicate scheduled invader ${invader.name}`);
		names.add(invader.name);
	}
	await shard.data.set(key, JSON.stringify([ ...current, ...additions ]));
}

async function readScheduledInvaders(shard: Shard, time: number): Promise<ScheduledInvader[]> {
	const raw = await shard.data.get(scheduledInvadersKey(time));
	return raw === null ? [] : JSON.parse(raw) as ScheduledInvader[];
}

registerShardTickProcessor(async (shard, time) => {
	const scheduled = await readScheduledInvaders(shard, time);
	await Promise.all(scheduled.map(entry => pushIntentsForRoomNextTick(shard, entry.room, kInvaderUserId, {
		local: { scheduleInvader: [ [ entry.name, entry.role, entry.strength, entry.x, entry.y, entry.boosted ] ] },
		internal: true,
	})));
	await shard.data.vDel(scheduledInvadersKey(time));
});

