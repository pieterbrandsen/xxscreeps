import { Database, Shard } from 'xxscreeps/engine/db/index.js';
import { loadMemorySegmentBlob, loadUserMemoryString } from 'xxscreeps/mods/meta/memory/model.js';
import { typedArrayToString } from 'xxscreeps/utility/string.js';

const userId = process.argv.at(-1);
if (userId == null) {
	throw new Error('Expected a user id');
}
await using db = await Database.connect();
await using shard = await Shard.connect(db, 'shard0');
const memory = JSON.parse((await loadUserMemoryString(shard, userId)) ?? '{}');
const segment = await loadMemorySegmentBlob(shard, userId, 42);
console.log(JSON.stringify({
	memory: memory.segmentProbeCount,
	prior: memory.segmentProbePrior,
	segment: segment == null ? undefined : typedArrayToString(new Uint16Array(segment.buffer, segment.byteOffset, segment.byteLength >>> 1)),
}));
