import type { Shard } from 'xxscreeps/engine/db/index.js';
import type { RunnerPlayerEvalPayload, RunnerPlayerIntent, TickUsageResult } from 'xxscreeps/engine/runner/index.js';
import { Channel } from 'xxscreeps/engine/db/channel.js';
import { tickSpeed } from 'xxscreeps/engine/service/tick.js';
import { acquireTimeout } from 'xxscreeps/utility/utility.js';

export function getConsoleChannel(shard: Shard, user: string) {
	return new Channel<string>(shard.pubsub, `user/${user}/console`, false);
}

export function getAckChannel(shard: Shard, user: string) {
	type Message = {
		id: string;
		result: { error: boolean; value: string | undefined };
	};
	return new Channel<Message>(shard.pubsub, `user/${user}/ack`);
}

export function getRunnerChannel(shard: Shard) {
	type RunnerMessage =
		{ type: 'shutdown' } |
		{ type: 'run'; time: number };
	return new Channel<RunnerMessage>(shard.pubsub, 'channel/runner');
}

// Messages sent to the runner for an individual user
/** @internal */
export type RunnerUserChannel = Channel<
	{ type: 'eval'; payload: RunnerPlayerEvalPayload } |
	{ type: 'evalAt'; time: number; payload: RunnerPlayerEvalPayload } |
	{ type: 'intent'; intent: RunnerPlayerIntent }
>;

export const runnerUserChannel =
	(shard: Shard, user: string): RunnerUserChannel => new Channel(shard.pubsub, `runner/${user}`);

export const runnerUsageChannel =
	(shard: Shard, user: string) => new Channel<TickUsageResult>(shard.pubsub, `runner/${user}/usage`);

/**
 * Sends an eval expression to the user's runner instance and waits for a reply.
 */
export async function requestRunnerEval(shard: Shard, userId: string, expr: string, echo: boolean) {
	using disposable = new DisposableStack();
	// Response timeout
	const timer = Promise.withResolvers<never>();
	using _timeout = acquireTimeout(
		Math.max(500, tickSpeed * 4),
		() => timer.reject(new Error('Runner did not respond')),
	);

	// Response promise
	const id = `${Math.random()}`;
	const [ effect, promise ] = getAckChannel(shard, userId).listenFor(message => message.id === id);
	disposable.defer(effect);

	// Send the request
	await runnerUserChannel(shard, userId).publish({ type: 'eval', payload: { ack: id, echo, expr } });
	const { result } = (await Promise.race([ timer.promise, promise ]))!;
	if (result.error) {
		throw new Error(result.value);
	} else {
		return result.value;
	}
}

export const runnerUsersSetKey = (time: number) =>
	`tick${time % 2}/runnerUsers`;

const scheduledConsoleKey = (userId: string, time: number) => `user/${userId}/scheduledConsole/${time}`;
const scheduledCpuBucketKey = (userId: string, time: number) => `user/${userId}/scheduledCpuBucket/${time}`;

export async function scheduleRunnerEval(shard: Shard, userId: string, time: number, payload: RunnerPlayerEvalPayload) {
	const key = scheduledConsoleKey(userId, time);
	const raw = await shard.data.get(key);
	const scheduled = raw === null ? [] : JSON.parse(raw) as RunnerPlayerEvalPayload[];
	scheduled.push(payload);
	await shard.data.set(key, JSON.stringify(scheduled));
}

export async function takeScheduledRunnerEval(shard: Shard, userId: string, time: number): Promise<RunnerPlayerEvalPayload[]> {
	const key = scheduledConsoleKey(userId, time);
	const raw = await shard.data.get(key);
	if (raw === null) return [];
	await shard.data.vDel(key);
	return JSON.parse(raw) as RunnerPlayerEvalPayload[];
}

/** Set one runner's bucket immediately before its scheduled tick is evaluated. */
export async function scheduleRunnerCpuBucket(shard: Shard, userId: string, time: number, bucket: number) {
	if (!Number.isSafeInteger(time) || time < 2) throw new Error('Scheduled CPU bucket time must be at least two');
	if (!Number.isSafeInteger(bucket) || bucket < 0) throw new Error('Scheduled CPU bucket must be a non-negative integer');
	const key = scheduledCpuBucketKey(userId, time);
	if (await shard.data.get(key) !== null) throw new Error(`CPU bucket is already scheduled for user ${userId} at tick ${time}`);
	await shard.data.set(key, String(bucket));
}

/** Consume the one-shot bucket control for this runner tick, if one was scheduled. */
export async function takeScheduledRunnerCpuBucket(shard: Shard, userId: string, time: number): Promise<number | undefined> {
	const key = scheduledCpuBucketKey(userId, time);
	const raw = await shard.data.get(key);
	if (raw === null) return;
	await shard.data.vDel(key);
	const bucket = Number(raw);
	if (!Number.isSafeInteger(bucket) || bucket < 0) throw new Error(`Scheduled CPU bucket is corrupt for user ${userId} at tick ${time}`);
	return bucket;
}
