import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { createToken } from '../../src/lib/security/tokens';
import { quote, selectionSchema } from '../../src/lib/pricing/quote';

// Explicit opt-in; missing database is a failing prerequisite, never a skipped success.
test('Local Supabase transaction, capacity, expiry and RLS integration', async (t) => {
  const connectionString = process.env.LOCAL_DATABASE_URL;
  assert.ok(connectionString, 'Set LOCAL_DATABASE_URL after starting the local Supabase stack.');
  const url = new URL(connectionString);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Cloud database forbidden');
  assert.equal(url.port, '54322', 'Tests are restricted to the local Supabase DB port');
  const pool = new Pool({ connectionString, max: 4, connectionTimeoutMillis: 5000 });
  const slots: string[] = [];
  const orders: string[] = [];
  const users: string[] = [];
  const settings = (
    await pool.query("select * from public.booking_settings where branch='strizkov'")
  ).rows[0];
  assert.equal(settings?.fixture_only, true, 'Tests require explicit fictitious configuration');
  await pool.query("update public.booking_settings set enabled=true where branch='strizkov'");
  const selection = selectionSchema.parse({ course: 'b', branch: 'strizkov' });
  const price = quote(selection);
  assert.equal(price.ok, true);
  const consent = {
    version: 'LOCAL-TEST-ONLY',
    wording: 'Fiktivní test. Nejde o právní dokument.',
    accepted: true,
  };
  async function slot() {
    const id = randomUUID();
    const start = new Date(Date.now() + 180 * 86400000 + slots.length * 3600000);
    await pool.query(
      'insert into public.appointment_slots(id,branch,starts_at,ends_at,capacity) values($1,$2,$3,$4,1)',
      [id, 'strizkov', start, new Date(start.getTime() + 900000)],
    );
    slots.push(id);
    return id;
  }
  async function create(slotId: string, marketing: unknown = { ...consent, accepted: false }) {
    const token = createToken();
    const result = await pool.query(
      'select public.bubu_create_provisional($1,$2,$3,$4,$5,$6,$7) as result',
      [
        slotId,
        {
          firstName: 'Fiktivní',
          lastName: 'Test',
          email: 'fixture@example.invalid',
          phone: '+420000000000',
        },
        selection,
        price,
        consent,
        marketing,
        token.hash,
      ],
    );
    const data = result.rows[0].result as {
      orderId: string;
      appointmentId: string;
      expiresAt: string;
    };
    orders.push(data.orderId);
    return { ...data, token };
  }
  try {
    await t.test('Two simultaneous requests for last seat: exactly one commits', async () => {
      const id = await slot();
      const results = await Promise.allSettled([create(id), create(id)]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(
        (await pool.query('select count(*)::int n from public.appointments where slot_id=$1', [id]))
          .rows[0].n,
        1,
      );
    });
    await t.test('Failure in consent insert rolls back order and appointment', async () => {
      const id = await slot();
      const before = (await pool.query('select count(*)::int n from public.orders')).rows[0].n;
      await assert.rejects(() => create(id, { accepted: false }));
      assert.equal(
        (await pool.query('select count(*)::int n from public.orders')).rows[0].n,
        before,
      );
      assert.equal(
        (await pool.query('select count(*)::int n from public.appointments where slot_id=$1', [id]))
          .rows[0].n,
        0,
      );
    });
    await t.test('Expired hold is reclaimed and old token cannot confirm it', async () => {
      const id = await slot();
      const old = await create(id);
      await pool.query(
        "update public.appointments set hold_expires_at=clock_timestamp()-interval '1 second' where order_id=$1",
        [old.orderId],
      );
      const next = await create(id);
      assert.notEqual(next.orderId, old.orderId);
      const result = await pool.query('select public.bubu_verify_email($1) result', [
        old.token.hash,
      ]);
      assert.equal(result.rows[0].result.ok, false);
      assert.equal(
        (await pool.query('select status from public.orders where id=$1', [old.orderId])).rows[0]
          .status,
        'expired',
      );
    });
    await t.test('Verification consumes token once and creates unique reminders', async () => {
      const order = await create(await slot());
      const results = await Promise.all([
        pool.query('select public.bubu_verify_email($1) result', [order.token.hash]),
        pool.query('select public.bubu_verify_email($1) result', [order.token.hash]),
      ]);
      assert.equal(results.filter((r) => r.rows[0].result.ok).length, 1);
      const jobs = await pool.query(
        'select kind,idempotency_key from public.notification_jobs where order_id=$1',
        [order.orderId],
      );
      assert.equal(jobs.rowCount, 3);
      assert.equal(new Set(jobs.rows.map((r) => r.idempotency_key)).size, 3);
    });
    await t.test('Anon denied, authenticated non-staff sees zero records', async () => {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query('set local role anon');
        await assert.rejects(() => client.query('select * from public.orders'));
        await client.query('rollback');
        await client.query('begin');
        await client.query('set local role authenticated');
        assert.equal((await client.query('select * from public.orders')).rowCount, 0);
        await client.query('rollback');
      } finally {
        await client.query('rollback');
        client.release();
      }
    });
    await t.test('Individual active staff needs aal2; revocation is immediate', async () => {
      const user = randomUUID();
      users.push(user);
      await pool.query('insert into auth.users(id,email) values($1,$2)', [
        user,
        `fixture-${user}@example.invalid`,
      ]);
      await pool.query("insert into public.staff_members(user_id,role) values($1,'operations')", [
        user,
      ]);
      const client = await pool.connect();
      try {
        for (const [aal, expected] of [
          ['aal1', false],
          ['aal2', true],
        ] as const) {
          await client.query('begin');
          await client.query('set local role authenticated');
          await client.query("select set_config('request.jwt.claims',$1,true)", [
            JSON.stringify({ sub: user, aal, role: 'authenticated' }),
          ]);
          assert.equal((await client.query('select * from public.orders')).rowCount! > 0, expected);
          await client.query('rollback');
        }
        await pool.query('update public.staff_members set active=false where user_id=$1', [user]);
        await client.query('begin');
        await client.query('set local role authenticated');
        await client.query("select set_config('request.jwt.claims',$1,true)", [
          JSON.stringify({ sub: user, aal: 'aal2', role: 'authenticated' }),
        ]);
        assert.equal((await client.query('select * from public.orders')).rowCount, 0);
        await client.query('rollback');
      } finally {
        await client.query('rollback');
        client.release();
      }
    });
  } finally {
    // Only this run's generated fixture IDs; no blanket reset or production data.
    for (const table of [
      'notification_jobs',
      'verification_tokens',
      'consent_records',
      'order_items',
    ])
      await pool.query(`delete from public.${table} where order_id=any($1::uuid[])`, [orders]);
    await pool.query('delete from public.audit_log where target_id=any($1::uuid[])', [orders]);
    await pool.query('delete from public.appointments where order_id=any($1::uuid[])', [orders]);
    await pool.query('delete from public.orders where id=any($1::uuid[])', [orders]);
    await pool.query('delete from public.appointment_slots where id=any($1::uuid[])', [slots]);
    await pool.query('delete from auth.users where id=any($1::uuid[])', [users]);
    await pool.query("update public.booking_settings set enabled=$1 where branch='strizkov'", [
      settings.enabled,
    ]);
    await pool.end();
  }
});
