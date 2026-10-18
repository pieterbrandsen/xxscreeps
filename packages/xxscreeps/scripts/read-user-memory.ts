import { readFile } from 'node:fs/promises';
import Path from 'node:path';
import { config } from 'xxscreeps/config/index.js';

const userId = process.argv.at(-1);
if (userId == null) {
	throw new Error('Expected a user id');
}
const dataPath = config.shards[0]!.data.split('?')[0]!;
const directory = Path.join(dataPath, 'user', userId);
const read = async (path: string) => {
	try {
		return await readFile(path, 'utf16le');
	} catch (error: any) {
		if (error.code === 'ENOENT') {
			return undefined;
		}
		throw error;
	}
};
const memory = JSON.parse((await read(Path.join(directory, 'memory'))) ?? '{}');
console.log(JSON.stringify({
	memory: memory.segmentProbeCount, cpu: memory.segmentProbeCpu,
	prior: memory.segmentProbePrior,
	consoleProbe: memory.consoleProbe,
	segment: await read(Path.join(directory, 'segments', '42')),
}));
