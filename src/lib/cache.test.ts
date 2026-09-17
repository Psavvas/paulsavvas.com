import { test, expect } from 'bun:test';
import { createSnapshotCache } from './cache';

test('shares concurrent reads and reuses the snapshot', async () => {
  let calls = 0;
  const cache = createSnapshotCache(async () => ++calls);
  expect(await Promise.all([cache.read(), cache.read()])).toEqual([1, 1]);
  expect(await cache.read()).toBe(1);
  expect(calls).toBe(1);
});

test('refreshes expired content and retains good content on failure', async () => {
  let fail = false;
  const cache = createSnapshotCache(async () => {
    if (fail) throw new Error('offline');
    return 'good';
  }, 0);
  expect(await cache.read()).toBe('good');
  fail = true;
  expect(await cache.read()).toBe('good');
  cache.invalidate();
  await expect(cache.read()).rejects.toThrow('offline');
});

test('an invalidated in-flight read cannot overwrite a newer snapshot', async () => {
  let resolve!: (n: number) => void;
  let calls = 0;
  const cache = createSnapshotCache(() =>
    ++calls === 1
      ? new Promise<number>((r) => {
          resolve = r;
        })
      : Promise.resolve(2)
  );
  const old = cache.read();
  await Promise.resolve();
  cache.invalidate();
  expect(await cache.read()).toBe(2);
  resolve(1);
  await old;
  expect(await cache.read()).toBe(2);
});
