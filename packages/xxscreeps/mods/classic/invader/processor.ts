import { registerIntentProcessor, registerRoomTickProcessor } from 'xxscreeps/engine/processor/index.js';
import { mappedNumericComparator } from 'xxscreeps/functional/comparator.js';
import { Fn } from 'xxscreeps/functional/fn.js';
import { Game } from 'xxscreeps/game/index.js';
import { RoomPosition } from 'xxscreeps/game/position.js';
import { Room } from 'xxscreeps/game/room/index.js';
import { activateNPC, registerNPC } from 'xxscreeps/mods/npc/processor.js';
import * as C from 'xxscreeps:mods/constants';
import { kInvaderUserId } from './game.js';
import { loop } from './loop/index.js';
import { create, type Role, type Strength } from './model.js';

export { create } from './model.js';

// Register invader NPC
registerNPC(kInvaderUserId, loop);


// Register invader generator
registerRoomTickProcessor((room, context) => {
	const target = room['#invaderEnergyTarget'] || C.INVADERS_ENERGY_GOAL;
	const totalEnergy = room['#cumulativeEnergyHarvested'];
	const energy = totalEnergy - room['#invaderEnergyTarget'];
	if (energy > target) {
		// Reset energy goal for next invasion
		let invaderGoal = Math.floor(C.INVADERS_ENERGY_GOAL * (Math.random() * 0.6 + 0.7));
		if (Math.random() < 0.1) {
			invaderGoal *= Math.floor(Math.random() > 0.5 ? 2 : 0.5);
		}
		// Check neighbor rooms to filter exits leading to owned/reserved rooms
		const exitDirections = Game.map.describeExits(room.name);
		if (!exitDirections) {
			return;
		}
		const entries = Object.entries(exitDirections);
		// Load neighbor rooms; #user: string = owned/reserved, null = unowned, undefined = no controller
		context.task(async function() {
			const results = await Promise.all(
				Fn.map(entries, async ([ dir, neighborName ]) => {
					const neighbor = await context.shard.loadRoom(neighborName, undefined, true).catch(() => null);
					const user = neighbor?.['#user'];
					return user === null || user === undefined ? Number(dir) : undefined;
				}));
			return new Set(Fn.filter(results, (dir): dir is number => dir !== undefined));
		}(), (allowedDirs: Set<number>) => {
			// Filter exit positions to allowed directions only
			const validExits = [ ...Fn.filter(room.find(C.FIND_EXIT), pos => {
				if (pos.x === 0) return allowedDirs.has(C.LEFT);
				if (pos.x === 49) return allowedDirs.has(C.RIGHT);
				if (pos.y === 0) return allowedDirs.has(C.TOP);
				if (pos.y === 49) return allowedDirs.has(C.BOTTOM);
				return false;
			}) ];
			if (validExits.length === 0) {
				return;
			}

			// Only consume the energy budget when invaders actually spawn
			room['#invaderEnergyTarget'] = totalEnergy + invaderGoal;

			// Find raid origin from valid exits
			const origin = validExits[Math.floor(validExits.length * Math.random())]!;
			validExits.sort(mappedNumericComparator(pos => origin.getRangeTo(pos)));

			// Send the boys
			activateNPC(room, kInvaderUserId);
			for (let ii = 0; ii < 3; ++ii) {
				const role = ([ 'melee', 'healer', 'ranged' ] as const)[ii % 3]!;
				const exit = validExits[ii];
				if (exit) {
					room['#insertObject'](create(exit, role, 'small', Game.time + C.CREEP_LIFE_TIME));
				} else {
					break;
				}
			}
		});
	}
});

export type InvaderIntents = typeof intents;
// The backend-only `requestInvader` intent behind `/api/game/create-invader`.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const intents = [
	registerIntentProcessor(Room, 'requestInvader', { internal: true }, (room, context, xx: number, yy: number, role: Role, strength: Strength) => {
		const pos = new RoomPosition(xx, yy, room.name);
		room['#insertObject'](create(pos, role, strength, Game.time + C.CREEP_LIFE_TIME));
		activateNPC(room, kInvaderUserId);
		context.setActive();
	}),
];

// Creep factory for invaders
