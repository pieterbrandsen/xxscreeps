import { Fn } from 'xxscreeps/functional/fn.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import * as Creep from 'xxscreeps/mods/classic/creep/creep.js';
import { kInvaderUserId } from './game.js';
import * as C from 'xxscreeps:mods/constants';

export type Strength = 'big' | 'small';
export type Role = 'healer' | 'melee' | 'ranged';

const bodies = {
	bighealer: () => createBody({ [C.HEAL]: 25 }),
	bigranged: () => createBody({ [C.TOUGH]: 6, [C.RANGED_ATTACK]: 18, [C.WORK]: 1 }),
	bigmelee: () => createBody({ [C.TOUGH]: 16, [C.RANGED_ATTACK]: 3, [C.WORK]: 4, [C.ATTACK]: 2 }),
	smallhealer: () => createBody({ [C.HEAL]: 5 }),
	smallranged: () => createBody({ [C.TOUGH]: 2, [C.RANGED_ATTACK]: 3 }),
	smallmelee: () => createBody({ [C.TOUGH]: 2, [C.RANGED_ATTACK]: 1, [C.WORK]: 1, [C.ATTACK]: 1 }),
};

export function create(pos: RoomPosition, role: Role, strength: Strength, ageTime: number) {
	const body = createBodyFor(role, strength);
	const creep = Creep.create(pos, body, `Invader_${pos.roomName}_${Math.floor(Math.random() * 1000)}`, kInvaderUserId);
	creep['#ageTime'] = ageTime;
	return creep;
}

export function createBodyFor(role: Role, strength: Strength) {
	return bodies[`${strength}${role}`]();
}

function createBody(parts: Partial<Record<Creep.PartType, number>>) {
	const size = Fn.accumulate(Object.values(parts));
	return [
		...Fn.map(Fn.range(parts[C.TOUGH] ?? 0), () => C.TOUGH),
		...Fn.map(Fn.range(size - 1), () => C.MOVE),
		...Fn.transform(Object.entries(parts), ([ type, count ]) => type === C.TOUGH ? [] : Fn.map(Fn.range(count), () => type as Creep.PartType)),
		C.MOVE,
	];
}
