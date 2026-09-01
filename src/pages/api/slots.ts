import type { APIRoute } from 'astro';
import { z } from 'zod';
import { branchId } from '../../lib/catalog';
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

    const slots = await requireLiveRepository(process.env).listAvailableSlots(parsed.data);
    return Response.json({ ok: true, slots }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json(
      { ok: false, message: 'Termíny zápisu se teď nepodařilo načíst.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
};
