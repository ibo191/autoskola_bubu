import { createHash } from 'node:crypto';
import type { APIRoute } from 'astro';
import { z } from 'zod';
import { branchId, branches } from '../../lib/catalog';
import { generateSlots } from '../../lib/booking/slots';
import { assertSameOrigin, requireLiveRepository } from '../../lib/server/live-order';

export const prerender = false;

const querySchema = z.object({
  branch: branchId,
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function isoDateAfter(days: number) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function stableSlotId(branch: string, start: string) {
  const hash = createHash('sha256').update(`${branch}:${start}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function previewSlots(branch: string, from: string, to: string) {
  const windows: Record<string, { weekday: number; open: string; close: string }[]> = {
    strizkov: [
      { weekday: 1, open: '15:00', close: '18:00' },
      { weekday: 4, open: '15:00', close: '18:00' },
    ],
    statenice: [{ weekday: 3, open: '15:00', close: '18:00' }],
    kladno: [],
  };
  const end = Date.parse(`${to}T00:00:00Z`);
  const output: {
    id: string;
    branch: string;
    startsAt: string;
    endsAt: string;
    remaining: number;
  }[] = [];
  for (let cursor = Date.parse(`${from}T00:00:00Z`); cursor <= end; cursor += 86400000) {
    const date = new Date(cursor).toISOString().slice(0, 10);
    const weekday = new Date(cursor).getUTCDay() || 7;
    for (const window of windows[branch] ?? []) {
      if (window.weekday !== weekday) continue;
      for (const slot of generateSlots({
        date,
        open: window.open,
        close: window.close,
        durationMinutes: 20,
        capacity: 1,
      }).slice(0, 9)) {
        output.push({
          id: stableSlotId(branch, slot.start),
          branch,
          startsAt: slot.start,
          endsAt: slot.end,
          remaining: slot.capacity,
        });
      }
    }
  }
  return output.slice(0, 120);
}

export const GET: APIRoute = async ({ request }) => {
  try {
    assertSameOrigin(request);
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      branch: url.searchParams.get('branch'),
      from: url.searchParams.get('from') ?? isoDateAfter(0),
      to: url.searchParams.get('to') ?? isoDateAfter(31),
    });
    if (!parsed.success)
      return Response.json({ message: 'Neplatný výběr termínů.' }, { status: 400 });

    const branch = branches.find((item) => item.id === parsed.data.branch);
    if (!branch?.hours) {
      return Response.json(
        { ok: true, slots: [], message: 'Pro tuto pobočku zatím nejsou vypsané zápisové hodiny.' },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const slots =
      process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
        ? await requireLiveRepository(process.env).listAvailableSlots(parsed.data)
        : previewSlots(parsed.data.branch, parsed.data.from, parsed.data.to);
    return Response.json({ ok: true, slots }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json(
      { ok: false, message: 'Termíny zápisu se teď nepodařilo načíst.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
};
