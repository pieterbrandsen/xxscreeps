import { assert, describe, test } from 'xxscreeps/test/index.js';
import { config } from 'xxscreeps/config/index.js';
import { cpuLimitForPlayer } from './instance.js';

function restoreUserLimits(previous: Readonly<Record<string, number>> | undefined) {
	if (previous === undefined) delete config.runner.cpu.userLimits;
	else config.runner.cpu.userLimits = previous;
}

describe('per-user runner CPU limits', () => {
	test('overrides only the named user and leaves the configured default intact', () => {
		const previous = config.runner.cpu.userLimits;
		try {
			config.runner.cpu.userLimits = { opponent: 30 };
			assert.strictEqual(cpuLimitForPlayer('opponent', 0), 30);
			assert.strictEqual(cpuLimitForPlayer('ours', 0), config.runner.cpu.limit ?? config.runner.cpu.baseLimit);
		} finally {
			restoreUserLimits(previous);
		}
	});

	test('refuses an invalid named allocation rather than silently changing Game.cpu.limit', () => {
		const previous = config.runner.cpu.userLimits;
		try {
			config.runner.cpu.userLimits = { opponent: 0 };
			assert.throws(() => cpuLimitForPlayer('opponent', 0), /positive integer/);
		} finally {
			restoreUserLimits(previous);
		}
	});
});
