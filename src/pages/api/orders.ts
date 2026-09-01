import type { APIRoute } from 'astro';
import {
  createLiveOrderService,
  fingerprintRequest,
  assertSameOrigin,
} from '../../lib/server/live-order';

export const prerender = false;

async function readJson(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new Response(null, { status: 415 });
  const reader = request.body?.getReader();
  if (!reader) throw new Response(null, { status: 400 });
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) {
      await reader.cancel();
      throw new Response(null, { status: 413 });
    }
    chunks.push(value);
  }
  return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
}

export const POST: APIRoute = async ({ request }) => {
  try {
    assertSameOrigin(request);
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return Response.json(
        {
          ok: false,
          code: 'BOOKING_NOT_CONFIGURED',
          message: 'Supabase database is not configured.',
        },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const body = await readJson(request);
    const url = new URL(request.url);
    const result = await createLiveOrderService(process.env).execute({
      body: { ...body, captchaToken: 'preview-order-submission' },
      hostname: url.hostname,
      clientFingerprint: fingerprintRequest(request, process.env),
      now: new Date(),
    });
    return Response.json(result, {
      status: result.ok ? 200 : result.code === 'RATE_LIMITED' ? 429 : 422,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json(
      { ok: false, code: 'ORDER_FAILED', message: 'Objednávku se nepodařilo uložit.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
};
