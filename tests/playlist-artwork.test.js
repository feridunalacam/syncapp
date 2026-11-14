import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { musicArtworkUrls } from '../src/domain/musicArtwork.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const source = readFileSync(new URL('../src/hooks/usePlaylistArtwork.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace('export default function', 'function');
const script = new Script(`${source}\nglobalThis.hook = usePlaylistArtwork;`);
const listItem = (id, image) => ({ id, type: 'playlist', name: 'Same name', image });
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
async function mount(t, items, overrides = {}) {
  const requests = [];
  const timers = new Map();
  let nextTimer = 0;
  const scope = {
    ...React,
    musicArtworkUrls,
    setTimeout(callback) {
      timers.set(++nextTimer, callback);
      return nextTimer;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };
  script.runInNewContext(scope);
  let props = {
    active: true,
    enabled: true,
    items,
    source: {},
    request(ids) {
      const pending = deferred();
      requests.push({ ids: Array.from(ids), ...pending });
      return pending.promise;
    },
    ...overrides,
  };
  let value;
  function Harness() {
    value = scope.hook(props);
    React.useLayoutEffect(() => {
      if (props.reportOnCommit)
        value.onViewableItemsChanged({
          viewableItems: props.items.map((item) => ({ item, isViewable: true })),
        });
    }, [props.items, props.reportOnCommit]);
    return null;
  }
  let root;
  await act(async () => {
    root = create(React.createElement(Harness));
  });
  let mounted = true;
  const unmount = async () => {
    if (!mounted) return;
    mounted = false;
    await act(async () => root.unmount());
  };
  t.after(unmount);
  return {
    requests,
    timers,
    unmount,
    get value() {
      return value;
    },
    get items() {
      return props.items;
    },
    artwork(index) {
      return value.artworkFor(props.items[index]);
    },
    async visible(...indices) {
      await act(async () =>
        value.onViewableItemsChanged({
          viewableItems: indices.map((index) => ({ item: props.items[index], isViewable: true })),
        }),
      );
    },
    async fail(index) {
      await act(async () => value.onUnavailable(props.items[index]));
    },
    async tick() {
      const jobs = [...timers.entries()];
      await act(async () => {
        for (const [id, callback] of jobs) if (timers.delete(id)) callback();
      });
    },
    async resolve(index, result) {
      await act(async () => requests[index].resolve(result));
    },
    async reject(index) {
      await act(async () => requests[index].reject(new Error('Optional lookup unavailable')));
    },
    async update(values) {
      props = { ...props, ...values };
      await act(async () => root.update(React.createElement(Harness)));
    },
  };
}

test('only visible missing library IDs are requested and HTTPS results merge by exact ID without changing rows', async (t) => {
  const items = [listItem('p.one'), listItem('p.two'), listItem('catalog'), listItem('purchased')];
  const h = await mount(t, items);
  await h.visible(0, 2, 3);
  await h.tick();
  assert.deepEqual(h.requests[0].ids, ['p.one']);
  await h.resolve(0, [
    { id: 'p.two', image: 'https://example.test/wrong-same-name.jpg' },
    {
      id: 'p.one',
      name: 'Replacement name',
      image: 'https://example.test/exact.jpg',
      tracks: ['changed'],
      artworkSource: 'catalog',
    },
  ]);
  assert.equal(h.artwork(0).image, 'https://example.test/exact.jpg');
  assert.equal(h.artwork(1), null);
  assert.deepEqual(Object.keys(h.artwork(0)), ['image']);
  assert.equal(h.items, items);
  assert.deepEqual(
    items.map((item) => item.id),
    ['p.one', 'p.two', 'catalog', 'purchased'],
  );
  assert.ok(items.every((item) => item.name === 'Same name' && !item.image));
});

test('an existing cover is enriched only after exhaustion, once per original candidate set', async (t) => {
  const h = await mount(t, [listItem('p.broken', 'https://example.test/broken.jpg')]);
  await h.visible(0);
  await h.tick();
  assert.equal(h.requests.length, 0);
  await h.fail(0);
  await h.tick();
  assert.deepEqual(h.requests[0].ids, ['p.broken']);
  await h.resolve(0, [{ id: 'p.broken', image: 'https://example.test/found.jpg' }]);
  await h.fail(0);
  await h.visible(0);
  await h.tick();
  assert.equal(h.requests.length, 1, 'a failed replacement cannot create an automatic lookup loop');
  await h.update({ items: [listItem('p.broken', 'https://example.test/changed.jpg')] });
  assert.equal(h.artwork(0), null, 'old artwork does not apply to a changed original source');
  await h.visible(0);
  await h.fail(0);
  await h.tick();
  assert.equal(h.requests.length, 2);
});

test('a viewability event requests at most eight IDs with one flight and no result-driven next batch', async (t) => {
  const h = await mount(
    t,
    Array.from({ length: 1000 }, (_, index) => listItem(`p.${index}`)),
  );
  await h.visible(...Array.from({ length: 12 }, (_, index) => index));
  await h.tick();
  assert.deepEqual(
    h.requests[0].ids,
    Array.from({ length: 8 }, (_, index) => `p.${index}`),
  );
  await h.resolve(0, []);
  await h.tick();
  assert.equal(h.requests.length, 1, 'completion never scans or fetches the remaining library');
  await h.visible(8, 9, 10, 11);
  await h.tick();
  assert.deepEqual(h.requests[1].ids, ['p.8', 'p.9', 'p.10', 'p.11']);
});

test('a slow flight drains only the latest explicitly visible or failed items and honors close/source/list retirement', async (t) => {
  for (const boundary of ['view', 'exhaustion', 'list', 'source', 'close']) {
    const rows = [
      listItem('p.a'),
      listItem('p.b', boundary === 'exhaustion' ? 'https://example.test/broken.jpg' : undefined),
      listItem('p.c'),
    ];
    const h = await mount(t, rows);
    await h.visible(...(boundary === 'exhaustion' ? [0, 1] : [0]));
    await h.tick();
    assert.deepEqual(h.requests[0].ids, ['p.a']);
    let expected = 'p.b';
    if (boundary === 'list' || boundary === 'source') {
      await h.update({
        items: [listItem('p.new-a'), listItem('p.new-b')],
        ...(boundary === 'source' ? { source: {} } : {}),
      });
      expected = 'p.new-b';
      await h.visible(1);
    } else if (boundary === 'exhaustion') await h.fail(1);
    else {
      await h.visible(1);
      if (boundary === 'view') {
        await h.visible(2);
        expected = 'p.c';
      } else {
        h.value.invalidate();
        await h.update({ active: false, enabled: false });
      }
    }
    await h.tick();
    assert.equal(h.requests.length, 1, 'there is still only one native flight');
    await h.resolve(0, [{ id: 'p.a', image: 'https://example.test/old-flight.jpg' }]);
    await h.tick();
    if (boundary === 'close') {
      assert.equal(h.requests.length, 1);
      assert.equal(h.artwork(0), null);
      continue;
    }
    assert.deepEqual(h.requests[1].ids, [expected], `latest explicit ${boundary} is not dropped`);
    if (boundary === 'list' || boundary === 'source') assert.equal(h.artwork(0), null);
    await h.resolve(1, []);
    await h.tick();
    assert.equal(h.requests.length, 2, 'a result alone never starts a third batch');
  }
});

test('cover memory is capped at 128 while evicted items retain weak once-per-list attempt marks', async (t) => {
  const h = await mount(
    t,
    Array.from({ length: 129 }, (_, index) => listItem(`p.${index}`)),
  );
  for (let from = 0; from < 129; from += 8) {
    const indices = Array.from({ length: Math.min(8, 129 - from) }, (_, offset) => from + offset);
    await h.visible(...indices);
    await h.tick();
    const request = h.requests.at(-1);
    await h.resolve(
      h.requests.length - 1,
      request.ids.map((id) => ({ id, image: `https://example.test/${id}.jpg` })),
    );
  }
  assert.equal(h.artwork(0), null);
  assert.equal(h.artwork(1).image, 'https://example.test/p.1.jpg');
  assert.equal(h.artwork(128).image, 'https://example.test/p.128.jpg');
  const attempts = h.requests.length;
  await h.visible(0);
  await h.fail(0);
  await h.tick();
  assert.equal(
    h.requests.length,
    attempts,
    'cover eviction cannot create an automatic or scroll retry',
  );
});

test('local-only/no-artwork and older-binary empty results remain placeholders without automatic retries', async (t) => {
  const h = await mount(t, [listItem('p.local-only')]);
  await h.visible(0);
  await h.tick();
  await h.resolve(0, []);
  await h.visible(0);
  await h.fail(0);
  await h.tick();
  assert.equal(h.artwork(0), null);
  assert.equal(h.requests.length, 1);
  assert.equal(h.items[0].id, 'p.local-only');
  const oldBinary = await mount(t, [listItem('p.old')], { request: undefined });
  await oldBinary.visible(0);
  await oldBinary.fail(0);
  await oldBinary.tick();
  assert.equal(oldBinary.requests.length, 0);
  assert.equal(oldBinary.timers.size, 0);
});

test('unsafe images and optional lookup failure never retry or fill another same-name playlist', async (t) => {
  const h = await mount(t, [listItem('p.one'), listItem('p.two')]);
  await h.visible(0);
  await h.tick();
  await h.resolve(0, [
    { id: 'p.one', image: 'file:///private-cover.jpg' },
    { id: 'p.two', image: 'https://example.test/other.jpg' },
  ]);
  assert.equal(h.artwork(0), null);
  assert.equal(h.artwork(1), null);
  await h.visible(1);
  await h.tick();
  await h.reject(1);
  await h.visible(0, 1);
  await h.tick();
  assert.equal(h.requests.length, 2);
});

test('close, disconnect and unmount retire pending artwork results and cancel queued batches', async (t) => {
  for (const boundary of ['close', 'disconnect', 'unmount']) {
    const h = await mount(t, [listItem('p.one')]);
    await h.visible(0);
    await h.tick();
    if (boundary === 'unmount') await h.unmount();
    else {
      h.value.invalidate();
      await h.update({ active: false, enabled: false });
    }
    await h.resolve(0, [{ id: 'p.one', image: 'https://example.test/stale.jpg' }]);
    assert.equal(h.artwork(0), null);
    assert.equal(h.timers.size, 0);
  }
  const queued = await mount(t, [listItem('p.queued')]);
  await queued.visible(0);
  queued.value.invalidate();
  await queued.tick();
  assert.equal(queued.requests.length, 0);
});

test('late results and view tokens from an old account or list cannot update the new source', async (t) => {
  const h = await mount(t, [listItem('p.same')]);
  const oldItem = h.items[0];
  await h.visible(0);
  await h.tick();
  await h.update({ source: {}, items: [listItem('p.same')] });
  await h.resolve(0, [{ id: 'p.same', image: 'https://example.test/old-account.jpg' }]);
  assert.equal(h.artwork(0), null);
  await act(async () =>
    h.value.onViewableItemsChanged({ viewableItems: [{ item: oldItem, isViewable: true }] }),
  );
  await h.tick();
  assert.equal(h.requests.length, 1);
  await h.visible(0);
  await h.tick();
  await h.resolve(1, [{ id: 'p.same', image: 'https://example.test/new-account.jpg' }]);
  assert.equal(h.artwork(0).image, 'https://example.test/new-account.jpg');
});

test('viewability and unavailable callbacks stay stable through artwork and player rerenders', async (t) => {
  const h = await mount(t, [listItem('p.one')]);
  const callbacks = [h.value.onViewableItemsChanged, h.value.onUnavailable];
  await h.visible(0);
  await h.tick();
  await h.resolve(0, [{ id: 'p.one', image: 'https://example.test/one.jpg' }]);
  await h.update({});
  assert.deepEqual([h.value.onViewableItemsChanged, h.value.onUnavailable], callbacks);
});

test('the first native viewability report during a list commit is not lost before passive effects', async (t) => {
  const h = await mount(t, [], { reportOnCommit: true });
  await h.tick();
  assert.equal(h.requests.length, 0);
  await h.update({ items: [listItem('p.visible')] });
  await h.tick();
  assert.deepEqual(h.requests[0].ids, ['p.visible']);
});

test('a replaced list generation rejects its old in-flight response even when the account method is unchanged', async (t) => {
  const h = await mount(t, [listItem('p.list')]);
  const oldItem = h.items[0];
  await h.visible(0);
  await h.tick();
  await h.update({ items: [listItem('p.list')] });
  await h.resolve(0, [{ id: 'p.list', image: 'https://example.test/old-list.jpg' }]);
  assert.equal(h.artwork(0), null);
  await act(async () =>
    h.value.onViewableItemsChanged({ viewableItems: [{ item: oldItem, isViewable: true }] }),
  );
  await h.tick();
  assert.equal(h.requests.length, 1);
  await h.visible(0);
  await h.tick();
  await h.resolve(1, [{ id: 'p.list', image: 'https://example.test/new-list.jpg' }]);
  assert.equal(h.artwork(0).image, 'https://example.test/new-list.jpg');
});
