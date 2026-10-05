// Static Assets currently returns the whole MP4 for Range requests. Serve byte
// ranges explicitly so mobile browsers can seek without downloading it again.
import media from './media.json' with { type: 'json' };

export default {
  async fetch(request, env) {
    const asset = await env.ASSETS.fetch(request);
    if (new URL(request.url).pathname !== '/introduction.mp4' || asset.status !== 200) return asset;

    const headers = new Headers(asset.headers);
    headers.set('Accept-Ranges', 'bytes');
    const complete = () => new Response(asset.body, { status: asset.status, headers });
    const value = request.headers.get('Range');
    if (request.method !== 'GET' || !value) return complete();
    const ifRange = request.headers.get('If-Range');
    if (ifRange && ifRange !== headers.get('ETag')) return complete();
    // Multiple or malformed ranges may be ignored, returning the full resource.
    const match = /^bytes=(\d*)-(\d*)$/.exec(value);
    // The Assets binding can omit Content-Length even though the public response
    // includes it. The build records the uploaded file's exact byte length.
    const size = Number(headers.get('Content-Length') ?? media.bytes);
    if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(size) || size <= 0) return complete();

    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) {
      await asset.body?.cancel();
      headers.set('Content-Range', `bytes */${size}`);
      headers.set('Content-Length', '0');
      return new Response(null, { status: 416, headers });
    }

    headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    headers.set('Content-Length', String(end - start + 1));
    const reader = asset.body.getReader();
    let offset = 0;
    const body = new ReadableStream({
      async pull(controller) {
        try {
          while (true) {
            const { value: chunk, done } = await reader.read();
            if (done) { controller.close(); return; }
            const from = Math.max(0, start - offset);
            const to = Math.min(chunk.byteLength, end + 1 - offset);
            offset += chunk.byteLength;
            if (to > from) controller.enqueue(chunk.slice(from, to));
            if (offset > end) { controller.close(); await reader.cancel(); return; }
            if (to > from) return;
          }
        } catch (error) { controller.error(error); }
      },
      cancel(reason) { return reader.cancel(reason); },
    });
    return new Response(body, { status: 206, headers });
  },
};
