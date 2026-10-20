import type { Shard } from 'xxscreeps/engine/db/index.js';
import { registerShardPreTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import * as Creep from 'xxscreeps/mods/classic/creep/creep.js';
import { kInvaderUserId } from './game.js';
import { create, type Role, type Strength } from './model.js';
import * as C from 'xxscreeps:mods/constants';

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

registerShardPreTickProcessor(async (shard, time) => {
	const scheduled = await readScheduledInvaders(shard, time);
	if (scheduled.length === 0) return;
	for (const entry of scheduled) {
		const room = await shard.loadRoom(entry.room, time, true);
		room['#initialize']();
		let creep = [ ...room['#objects'] ].find(object => object instanceof Creep.Creep && object.name === entry.name) as Creep.Creep | undefined;
		if (creep && creep['#user'] !== kInvaderUserId) throw new Error(`scheduled invader name is already owned: ${entry.name}`);
		if (!creep) {
			creep = create(new RoomPosition(entry.x, entry.y, entry.room), entry.role, entry.strength, time + C.CREEP_LIFE_TIME);
			creep.name = entry.name;
			if (entry.boosted) {
				const boosts = { [C.HEAL]: 'LO', [C.RANGED_ATTACK]: 'KO', [C.WORK]: 'ZH', [C.ATTACK]: 'UH', [C.TOUGH]: 'GO' } as const;
				for (const part of creep.body) if (part.type in boosts) part.boost = boosts[part.type as keyof typeof boosts];
			}
			room['#insertObject'](creep);
			room['#flushObjects'](null);
			await shard.saveRoom(entry.room, time, room);
		}
		await shard.data.set(invaderLedgerKey(entry.name), JSON.stringify({ ...entry, ageTime: creep['#ageTime'], id: creep.id, insertedAt: time }));
	}
	await shard.data.vDel(scheduledInvadersKey(time));
});

