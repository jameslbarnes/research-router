import { configFromEnv, createApp } from './app.mjs';
import letter from './generated-letter.json' with { type: 'json' };

export function d1Adapter(database) {
  return { prepare(sql) {
    return {
      get: (...args) => database.prepare(sql).bind(...args).first(),
      run: (...args) => database.prepare(sql).bind(...args).run(),
      all: async (...args) => (await database.prepare(sql).bind(...args).all()).results,
    };
  } };
}

export default {
  async fetch(request, env) {
    try {
      const config = configFromEnv(env);
      const path = new URL(request.url).pathname;
      if (!path.startsWith('/letter/api/')) {
        if (!env.ASSETS || !['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404 });
        const asset = await env.ASSETS.fetch(request);
        if (asset.headers.get('content-type')?.includes('text/html') && asset.ok) {
          const response = new HTMLRewriter()
            .on('[data-letter-link]', { element: e => e.setAttribute('href', config.publicLetterUrl) })
            .on('[data-audit-link]', { element: e => e.setAttribute('href', config.publicAuditUrl) })
            .transform(asset);
          response.headers.set('Cache-Control', 'no-store');
          response.headers.set('Referrer-Policy', 'same-origin');
          return response;
        }
        return asset;
      }
      const handler = createApp({ config, db: d1Adapter(env.DB), letter });
      return await handler(request, request.headers.get('CF-Connecting-IP') || 'local');
    } catch {
      // Never log OAuth callbacks, tokens, emails or request bodies.
      console.error('Letter signing request failed. Check bindings, migrations and configuration.');
      return Response.json({ error: 'The signing service is temporarily unavailable. Please try again later.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
  },
};
