import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Optional offline PostgreSQL execution, with tooling installed outside this repo:
// SYNCAPP_REVIEW_PGLITE_MODULE=/private/tmp/.../node_modules/@electric-sql/pglite/dist/index.js node --test tests/backend-review-sql.test.js
// No hosted credentials, Supabase services, listeners or persisted database are used.
const modulePath = process.env.SYNCAPP_REVIEW_PGLITE_MODULE;
test(
  'actual review migration, RLS and RPCs in ephemeral PostgreSQL',
  {
    skip: modulePath
      ? false
      : 'Set SYNCAPP_REVIEW_PGLITE_MODULE to an isolated pinned PGlite installation.',
  },
  async (t) => {
    const { PGlite } = await import(pathToFileURL(modulePath).href);
    const db = new PGlite();
    const PROD = '10101010-1010-4010-8010-101010101010';
    const A = '20202020-2020-4020-8020-202020202020';
    const B = '30303030-3030-4030-8030-303030303030';
    const FRESH = '40404040-4040-4040-8040-404040404040';
    const DURING_BACKFILL = '50505050-5050-4050-8050-505050505050';
    const ns = (id) => `review:1:${id}`;
    const query = async (sql, values = []) => (await db.query(sql, values)).rows;
    const scalar = async (sql, values = []) => Object.values((await query(sql, values))[0])[0];
    const role = async (name, id = null) => {
      await db.exec('reset role');
      await query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ sub: id, role: name, user_metadata: { lane: 'review', active: true } }),
      ]);
      if (name !== 'postgres') await db.exec(`set local role ${name}`);
    };
    const denied = async (sql, values = [], codes = ['42501', '23503', '23514']) => {
      await db.exec('savepoint denied_probe');
      try {
        await assert.rejects(db.query(sql, values), (error) => codes.includes(error.code));
      } finally {
        await db.exec('rollback to savepoint denied_probe; release savepoint denied_probe');
      }
    };
    const reserve = (id) =>
      scalar("select public.reserve_review_account($1,now()+interval '1 hour')", [id]);
    const begin = (id, event = null) =>
      scalar('select public.begin_review_subscription_sync($1,$2,1,$3)', [id, ns(id), event]);
    const apply = (
      id,
      generation,
      event = null,
      store = 'app_store',
      environment = 'SANDBOX',
      product = 'com.feridun.syncapp.pro.monthly',
      namespace = ns(id),
      epoch = 1,
    ) =>
      scalar(
        "select public.apply_review_subscription_sync($1,$2,$3,$4,now()+interval '1 hour',now()+interval '2 hours',$5,$6,$7,$8)",
        [id, namespace, epoch, generation, store, environment, product, event],
      );
    const grant = async (id) => {
      const generation = await begin(id);
      assert.equal(await apply(id, generation), true);
    };
    const save = (id, namespace = ns(id), epoch = 1, revision = 0) =>
      query('select * from public.save_review_account_backup($1,$2::jsonb,$3,$4,$5)', [
        revision,
        '{"version":1,"data":{"routines":[]}}',
        id,
        namespace,
        epoch,
      ]);
    const fixture = async () => {
      await db.exec('begin');
      await query('insert into auth.users(id) values($1),($2),($3)', [A, B, FRESH]);
      await role('service_role');
      await reserve(A);
      await reserve(B);
    };
    const subtest = (name, body) =>
      t.test(name, async () => {
        await fixture();
        try {
          await body();
        } finally {
          await db.exec('rollback');
        }
      });
    try {
      // Only Supabase platform schemas/roles/Auth JWT parsing are fixture boundaries.
      await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
      $$;
      grant usage on schema auth,public,storage to anon,authenticated,service_role;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      grant select,insert,update,delete on storage.objects to authenticated,service_role;
      create function storage.foldername(text) returns text[] language sql immutable as $$
        select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]
      $$;
    `);
      try {
        await db.exec('select pg_catalog.pg_advisory_xact_lock(1)');
        t.diagnostic(
          'Native advisory-lock function executed; single-connection WASM cannot establish cross-connection concurrency.',
        );
      } catch (error) {
        if (!/single.user|advisory|not supported/i.test(error.message)) throw error;
        await db.exec(
          "create or replace function pg_catalog.pg_advisory_xact_lock(bigint) returns void language sql as 'select 1'",
        );
        t.diagnostic(
          'Advisory lock stubbed only in the ephemeral fixture; real database concurrency remains unverified.',
        );
      }
      for (const migration of [
        '20261111153826_membership_subscriptions.sql',
        '20261111154405_bind_backup_account.sql',
      ])
        await db.exec(
          await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), 'utf8'),
        );
      await query('insert into auth.users(id) values($1)', [PROD]);
      const reviewMigration = await readFile(
        new URL(
          '../supabase/migrations/20261112152101_isolated_review_billing.sql',
          import.meta.url,
        ),
        'utf8',
      );
      const registryBackfill =
        "insert into public.account_billing_scope_registry(user_id, lane) select id, 'production' from auth.users;";
      const phases = reviewMigration.split(registryBackfill);
      assert.equal(
        phases.length,
        2,
        'Identify the actual registry-backfill boundary exactly once.',
      );
      await db.exec('begin');
      await db.exec(phases[0] + registryBackfill);
      // Deterministically model the row visible to a later READ COMMITTED
      // statement, without claiming a second connection or real concurrent run.
      await query('insert into auth.users(id) values($1)', [DURING_BACKFILL]);
      await db.exec(phases[1]);
      await db.exec('commit');
      t.diagnostic(
        'A synthetic Auth row was inserted between the actual backfill statements; cross-connection concurrency remains unverified.',
      );

      await subtest(
        'an Auth user arriving between backfill statements is skipped safely and resolved normally later',
        async () => {
          await role('authenticated', DURING_BACKFILL);
          assert.equal(
            await scalar(
              'select count(*) from public.account_billing_scope_registry where user_id=$1',
              [DURING_BACKFILL],
            ),
            0,
          );
          assert.equal(
            await scalar('select count(*) from public.account_billing_scopes where user_id=$1', [
              DURING_BACKFILL,
            ]),
            0,
          );
          const resolved = await scalar('select public.get_account_billing_scope()');
          assert.equal(resolved.lane, 'production');
          assert.equal(resolved.namespace, DURING_BACKFILL);
          assert.equal(
            await scalar(
              'select count(*) from public.account_billing_scope_registry where user_id=$1',
              [DURING_BACKFILL],
            ),
            1,
          );
          assert.equal(
            await scalar('select count(*) from public.account_billing_scopes where user_id=$1', [
              DURING_BACKFILL,
            ]),
            1,
          );
        },
      );

      await subtest(
        'existing Auth accounts remain production; client JWT metadata cannot choose or mutate a lane',
        async () => {
          await role('authenticated', PROD);
          const result = await scalar('select public.get_account_billing_scope()');
          assert.deepEqual(result, {
            user_id: PROD,
            lane: 'production',
            namespace: PROD,
            epoch: 0,
            active: true,
            expires_at: null,
          });
          await denied("update public.account_billing_scopes set lane='review' where user_id=$1", [
            PROD,
          ]);
          await denied(
            "insert into public.account_billing_scope_registry(user_id,lane) values($1,'review')",
            [FRESH],
          );
          await denied("select public.reserve_review_account($1,now()+interval '1 day')", [FRESH]);
          await denied('select public.get_account_billing_scope_for_user($1,false)', [A]);
          await role('anon');
          await denied('select public.get_account_billing_scope()');
        },
      );

      await subtest(
        'first production resolution wins permanently over later review enrollment',
        async () => {
          await role('authenticated', FRESH);
          assert.equal(
            (await scalar('select public.get_account_billing_scope()')).namespace,
            FRESH,
          );
          await role('service_role');
          await denied("select public.reserve_review_account($1,now()+interval '1 day')", [FRESH]);
          await denied("select public.reserve_review_account($1,now()+interval '1 day')", [PROD]);
          await denied(
            "update public.account_billing_scope_registry set lane='review' where user_id=$1",
            [PROD],
          );
          await denied('delete from public.account_billing_scope_registry where user_id=$1', [
            PROD,
          ]);
        },
      );

      await subtest(
        'production UUID classification survives Auth deletion and prevents later review reuse',
        async () => {
          await role('postgres');
          await query('delete from auth.users where id=$1', [PROD]);
          assert.equal(
            await scalar('select count(*) from public.account_billing_scopes where user_id=$1', [
              PROD,
            ]),
            0,
          );
          await query('insert into auth.users(id) values($1)', [PROD]);
          await role('service_role');
          await denied("select public.reserve_review_account($1,now()+interval '1 day')", [PROD]);
          await role('authenticated', PROD);
          assert.equal((await scalar('select public.get_account_billing_scope()')).namespace, PROD);
        },
      );

      await subtest(
        'clients cannot call service billing/grant RPCs or insert review entitlements directly',
        async () => {
          await role('authenticated', A);
          for (const signature of [
            'public.get_account_billing_scope_for_user(uuid,boolean)',
            'public.reserve_review_account(uuid,timestamptz)',
            'public.revoke_review_account(uuid)',
            'public.begin_subscription_sync(uuid,text)',
            'public.apply_subscription_sync(uuid,bigint,timestamptz,text,text,text)',
            'public.begin_review_subscription_sync(uuid,text,integer,text)',
            'public.apply_review_subscription_sync(uuid,text,integer,bigint,timestamptz,timestamptz,text,text,text,text)',
          ]) {
            assert.equal(
              await scalar("select has_function_privilege('authenticated',$1,'EXECUTE')", [
                signature,
              ]),
              false,
            );
            assert.equal(
              await scalar("select has_function_privilege('anon',$1,'EXECUTE')", [signature]),
              false,
            );
          }
          assert.equal(
            await scalar(
              "select has_table_privilege('authenticated','public.review_entitlements','INSERT')",
            ),
            false,
          );
          assert.equal(
            await scalar(
              "select has_table_privilege('authenticated','public.review_entitlements','UPDATE')",
            ),
            false,
          );
          await denied('select public.begin_review_subscription_sync($1,$2,1,null)', [A, ns(A)]);
        },
      );

      await subtest(
        'production entitlement/backup writes fence reserved review UUIDs even for service callers',
        async () => {
          await denied('select public.begin_subscription_sync($1,null)', [A]);
          await denied(
            "insert into public.entitlements(user_id,entitlement_id,expires_at,environment) values($1,'pro',now()+interval '1 day','PRODUCTION')",
            [A],
          );
          await denied("insert into public.account_backups(user_id,payload) values($1,'{}')", [A]);
          await role('authenticated', A);
          assert.equal(await scalar('select count(*) from public.entitlements'), 0);
          await denied("select * from public.save_account_backup(0,'{}'::jsonb,$1)", [A]);
          await denied('insert into public.profiles(id) values($1)', [A]);
          assert.equal(await scalar('select count(*) from public.account_backups'), 0);
        },
      );

      await subtest(
        'legacy profile insert and update claim production before scope resolution and survive only as a deletion fence',
        async () => {
          await role('authenticated', FRESH);
          await query('insert into public.profiles(id,bio) values($1,$2)', [
            FRESH,
            'Legacy profile',
          ]);
          assert.equal(
            await scalar(
              'select count(*) from public.account_billing_scope_registry where user_id=$1',
              [FRESH],
            ),
            1,
          );
          assert.equal(
            await scalar(
              'select lane from public.account_billing_scope_registry where user_id=$1',
              [FRESH],
            ),
            'production',
          );
          assert.equal(
            await scalar('select count(*) from public.account_billing_scopes where user_id=$1', [
              FRESH,
            ]),
            0,
          );
          await query('update public.profiles set bio=$2 where id=$1', [FRESH, 'Updated profile']);
          assert.equal(
            await scalar('select bio from public.profiles where id=$1', [FRESH]),
            'Updated profile',
          );
          await role('service_role');
          await denied("select public.reserve_review_account($1,now()+interval '1 hour')", [FRESH]);
          await role('postgres');
          await query('delete from auth.users where id=$1', [FRESH]);
          assert.equal(
            await scalar('select count(*) from public.profiles where id=$1', [FRESH]),
            0,
          );
          assert.equal(
            await scalar(
              'select lane from public.account_billing_scope_registry where user_id=$1',
              [FRESH],
            ),
            'production',
          );
        },
      );

      await subtest(
        'reserved review UUIDs reject raw profile inserts and reassignment even for a service caller',
        async () => {
          await role('authenticated', A);
          await denied('insert into public.profiles(id,bio) values($1,$2)', [
            A,
            'Forbidden review profile',
          ]);
          await role('service_role');
          await denied('insert into public.profiles(id,bio) values($1,$2)', [
            A,
            'Forbidden admin profile',
          ]);
          await query('insert into public.profiles(id,bio) values($1,$2)', [
            FRESH,
            'Production profile',
          ]);
          await denied('update public.profiles set id=$2 where id=$1', [FRESH, A]);
          assert.equal(await scalar('select count(*) from public.profiles where id=$1', [A]), 0);
          assert.equal(
            await scalar('select bio from public.profiles where id=$1', [FRESH]),
            'Production profile',
          );
          await role('authenticated', A);
          assert.equal(
            (
              await query('update public.profiles set bio=$2 where id=$1 returning id', [
                A,
                'No access',
              ])
            ).length,
            0,
          );
        },
      );

      await subtest(
        'review backup requires a live lease, exact caller/namespace/epoch and matching revision',
        async () => {
          await role('authenticated', A);
          await denied('select * from public.save_review_account_backup(0,$1::jsonb,$2,$3,1)', [
            '{}',
            A,
            ns(A),
          ]);
          await role('service_role');
          await grant(A);
          await role('authenticated', A);
          assert.equal((await save(A))[0].revision, 1);
          await denied(
            'select * from public.save_review_account_backup(0,$1::jsonb,$2,$3,1)',
            ['{}', A, ns(A)],
            ['40001'],
          );
          assert.equal((await save(A, ns(A), 1, 1))[0].revision, 2);
          await denied('select * from public.save_review_account_backup(0,$1::jsonb,$2,$3,1)', [
            '{}',
            B,
            ns(B),
          ]);
          await denied('select * from public.save_review_account_backup(0,$1::jsonb,$2,$3,0)', [
            '{}',
            A,
            A,
          ]);
          await denied('select * from public.save_review_account_backup(0,$1::jsonb,$2,$3,2)', [
            '{}',
            A,
            ns(A),
          ]);
          await role('authenticated', B);
          assert.equal(await scalar('select count(*) from public.review_backups'), 0);
          await role('authenticated', PROD);
          assert.equal(await scalar('select count(*) from public.review_backups'), 0);
        },
      );

      await subtest(
        'revocation immediately denies stale JWT reads/writes and every earlier canonical completion',
        async () => {
          await grant(A);
          await role('authenticated', A);
          await save(A);
          await role('service_role');
          const held = await begin(A);
          await query('select public.revoke_review_account($1)', [A]);
          assert.equal(await apply(A, held), false);
          await denied('update public.account_billing_scopes set active=true where user_id=$1', [
            A,
          ]);
          await denied(
            "update public.account_billing_scopes set expires_at=now()+interval '1 year' where user_id=$1",
            [A],
          );
          await role('authenticated', A);
          const current = await scalar('select public.get_account_billing_scope()');
          assert.equal(current.lane, 'review');
          assert.equal(current.active, false);
          assert.equal(await scalar('select count(*) from public.review_entitlements'), 0);
          assert.equal(await scalar('select count(*) from public.review_backups'), 0);
          await denied('select * from public.save_review_account_backup(1,$1::jsonb,$2,$3,1)', [
            '{}',
            A,
            ns(A),
          ]);
          assert.equal(await scalar('select count(*) from public.account_backups'), 0);
        },
      );

      await subtest(
        'expired review classification never falls through to production or reopens',
        async () => {
          // Fixture represents a previously enrolled account after wall-clock expiry.
          await query(
            "insert into public.account_billing_scope_registry(user_id,lane) values($1,'review')",
            [FRESH],
          );
          await query(
            "insert into public.account_billing_scopes values($1,'review',$2,1,true,now()-interval '1 second')",
            [FRESH, ns(FRESH)],
          );
          await denied('select public.begin_review_subscription_sync($1,$2,1,null)', [
            FRESH,
            ns(FRESH),
          ]);
          assert.equal(await apply(FRESH, 1), false);
          await denied("select public.reserve_review_account($1,now()+interval '1 day')", [FRESH]);
          await role('authenticated', FRESH);
          const current = await scalar('select public.get_account_billing_scope()');
          assert.equal(current.active, false);
          assert.equal(current.lane, 'review');
          await denied('select * from public.save_review_account_backup(0,$1::jsonb,$2,$3,1)', [
            '{}',
            FRESH,
            ns(FRESH),
          ]);
        },
      );

      await subtest(
        'null, nonpositive and missing-state generations cannot bypass begin on either lane',
        async () => {
          for (const generation of [null, 0, -1, 1]) {
            assert.equal(await apply(A, generation), false);
            assert.equal(
              await scalar(
                "select public.apply_subscription_sync($1,$2,now()+interval '1 hour','app_store','PRODUCTION',null)",
                [PROD, generation],
              ),
              false,
            );
          }
          assert.equal(await scalar('select count(*) from public.review_entitlements'), 0);
        },
      );

      await subtest(
        'stale/duplicate review events, wrong scope and ineligible store/product cannot apply',
        async () => {
          const older = await begin(A, 'same-event');
          const newer = await begin(A, 'same-event');
          assert.equal(await apply(A, older, 'same-event'), false);
          assert.equal(
            await apply(
              A,
              newer,
              'same-event',
              'app_store',
              'SANDBOX',
              'com.feridun.syncapp.pro.monthly',
              ns(B),
            ),
            false,
          );
          assert.equal(
            await apply(
              A,
              newer,
              'same-event',
              'app_store',
              'SANDBOX',
              'com.feridun.syncapp.pro.monthly',
              ns(A),
              2,
            ),
            false,
          );
          for (const [store, environment, product] of [
            ['test_store', 'SANDBOX', 'com.feridun.syncapp.pro.monthly'],
            ['app_store', 'PRODUCTION', 'com.feridun.syncapp.pro.monthly'],
            ['app_store', 'SANDBOX', 'lifetime'],
          ]) {
            await denied(
              "select public.apply_review_subscription_sync($1,$2,1,$3,now()+interval '1 hour',now()+interval '1 hour',$4,$5,$6,null)",
              [A, ns(A), newer, store, environment, product],
            );
          }
          assert.equal(await apply(A, newer, 'same-event'), true);
          assert.equal(await begin(A, 'same-event'), null);
          const entitlement = (
            await query('select * from public.review_entitlements where user_id=$1', [A])
          )[0];
          assert.ok(new Date(entitlement.expires_at) - new Date(entitlement.updated_at) <= 300000);
          const prodGeneration = await scalar('select public.begin_subscription_sync($1,$2)', [
            PROD,
            'same-event',
          ]);
          assert.equal(
            await scalar(
              "select public.apply_subscription_sync($1,$2,now()+interval '1 hour','app_store','PRODUCTION',$3)",
              [PROD, prodGeneration, 'same-event'],
            ),
            true,
          );
          assert.equal(await scalar('select count(*) from private.subscription_webhook_events'), 1);
          assert.equal(
            await scalar('select count(*) from private.review_subscription_webhook_events'),
            1,
          );
        },
      );

      await subtest(
        'database lease independently clamps canonical expiry and the immutable reservation window',
        async () => {
          const first = await begin(A);
          assert.equal(
            await scalar(
              "select public.apply_review_subscription_sync($1,$2,1,$3,now()+interval '1 hour',now()+interval '4 seconds','app_store','SANDBOX','com.feridun.syncapp.pro.monthly',null)",
              [A, ns(A), first],
            ),
            true,
          );
          assert.equal(
            await scalar(
              "select expires_at=now()+interval '4 seconds' from public.review_entitlements where user_id=$1",
              [A],
            ),
            true,
          );
          await scalar("select public.reserve_review_account($1,now()+interval '2 seconds')", [
            FRESH,
          ]);
          const second = await begin(FRESH);
          assert.equal(await apply(FRESH, second), true);
          assert.equal(
            await scalar(
              "select expires_at=now()+interval '2 seconds' from public.review_entitlements where user_id=$1",
              [FRESH],
            ),
            true,
          );
        },
      );

      await subtest(
        'Auth deletion cascades all review artifacts and leaves only immutable UUID/lane fence',
        async () => {
          const generation = await begin(A, 'delete-event');
          assert.equal(await apply(A, generation, 'delete-event'), true);
          await role('authenticated', A);
          await save(A);
          await role('postgres');
          await query('delete from auth.users where id=$1', [A]);
          for (const table of ['account_billing_scopes', 'review_entitlements', 'review_backups'])
            assert.equal(
              await scalar(`select count(*) from public.${table} where user_id=$1`, [A]),
              0,
            );
          for (const table of [
            'review_subscription_sync_state',
            'review_subscription_webhook_events',
          ])
            assert.equal(
              await scalar(`select count(*) from private.${table} where user_id=$1`, [A]),
              0,
            );
          assert.deepEqual(
            (
              await query('select * from public.account_billing_scope_registry where user_id=$1', [
                A,
              ])
            )[0],
            { user_id: A, lane: 'review' },
          );
          await role('authenticated', A);
          await denied('select public.get_account_billing_scope()');
          await denied('select * from public.save_review_account_backup(0,$1::jsonb,$2,$3,1)', [
            '{}',
            A,
            ns(A),
          ]);
          await role('service_role');
          assert.equal(await apply(A, generation, 'delete-event'), false);
          await denied('select public.begin_subscription_sync($1,null)', [A]);
        },
      );

      await t.test(
        'existing production membership SQL still passes without source changes',
        async () => {
          await db.exec(
            await readFile(new URL('../supabase/verify-membership.sql', import.meta.url), 'utf8'),
          );
        },
      );
    } finally {
      await db.close();
    }
  },
);
