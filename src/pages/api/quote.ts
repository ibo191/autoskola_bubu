import type { APIRoute } from 'astro';
import { quote } from '../../lib/pricing/quote';
export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ message: 'Neplatný původ požadavku.' }, { status: 403 });
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return new Response(null, { status: 415 });
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) {
      await reader.cancel();
      return new Response(null, { status: 413 });
    }
    chunks.push(value);
  }
  try {
    const data = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
    const result = quote(data);
    return Response.json(result, {
      status: result.ok ? 200 : 422,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json({ message: 'Neplatný požadavek.' }, { status: 400 });
  }
};
