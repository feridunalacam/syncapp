import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.SYNCAPP_REVIEW_PGLITE_MODULE;
test(
  'actual Apple token migration keeps ciphertext service-only, identity-bound and cascading',
  {
    skip: modulePath ? false : 'Set SYNCAPP_REVIEW_PGLITE_MODULE to isolated pinned PGlite.',
  },
  async () => {
    const { PGlite } = await import(pathToFileURL(modulePath).href);
    const db = new PGlite();
    const A = '10101010-1010-4010-8010-101010101010';
    const B = '20202020-2020-4020-8020-202020202020';
    const sealed = { version: 1, iv: 'a'.repeat(16), ciphertext: 'b'.repeat(30) };
    const store = (id, subject = 'apple-subject', envelope = sealed) =>
      db.query('select public.store_apple_revocation_token($1,$2,$3,$4::jsonb)', [
        id,
        subject,
        'com.feridun.syncapp',
        JSON.stringify(envelope),
      ]);
    const denied = async (fn, code = '42501') => {
      await db.exec('savepoint denied');
      try {
        await assert.rejects(fn(), (error) => error.code === code);
      } finally {
        await db.exec('rollback to savepoint denied; release savepoint denied');
      }
    };
    try {
      await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create table auth.identities(user_id uuid references auth.users(id) on delete cascade, provider text, identity_data jsonb);
      grant usage on schema public to anon,authenticated,service_role;`);
      await db.exec(
        await readFile(
          new URL(
            '../supabase/migrations/20261113091118_private_apple_revocation_tokens.sql',
            import.meta.url,
          ),
          'utf8',
        ),
      );
      await db.query('insert into auth.users(id) values($1),($2)', [A, B]);
      await db.query(
        'insert into auth.identities values($1,\'apple\',\'{"sub":"apple-subject"}\')',
        [A],
      );
      await db.exec('begin');
      for (const role of ['anon', 'authenticated']) {
        await db.exec(`set local role ${role}`);
        await denied(() => store(A));
        await denied(() => db.query('select public.get_apple_revocation_token($1)', [A]));
        await denied(() => db.query('select * from private.apple_revocation_tokens'));
        await db.exec('reset role');
      }
      await db.exec('set local role service_role');
      await store(A);
      const result = (await db.query('select public.get_apple_revocation_token($1) as value', [A]))
        .rows[0].value;
      assert.deepEqual(result, {
        apple_subject: 'apple-subject',
        client_id: 'com.feridun.syncapp',
        sealed_token: sealed,
      });
      await denied(() => store(B));
      await denied(() => store(A, 'wrong-subject'));
      await denied(() => store(A, 'apple-subject', {}), '23514');
      await denied(
        () => store(A, 'apple-subject', { ...sealed, refresh_token: 'must-not-store' }),
        '23514',
      );
      await denied(() => db.query('select * from private.apple_revocation_tokens'));
      await db.exec('reset role');
      await db.query('delete from auth.users where id=$1', [A]);
      assert.equal(
        (await db.query('select count(*)::int as count from private.apple_revocation_tokens'))
          .rows[0].count,
        0,
      );
      await db.exec('set local role service_role');
      await denied(() => store(A));
      await db.exec('rollback');
    } finally {
      await db.close();
    }
  },
);
