import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.mjs';

const content = new TextEncoder().encode('0123456789');
function fetchVideo(headers = {}, method = 'GET') {
  const request = new Request('https://media.example/introduction.mp4', { method, headers });
  return worker.fetch(request, { ASSETS: { fetch: async () => {
    const body = method === 'HEAD' ? null : new ReadableStream({ start(controller) {
      controller.enqueue(content.slice(0, 3));
      controller.enqueue(content.slice(3, 7));
      controller.enqueue(content.slice(7));
      controller.close();
    }});
    return new Response(body, { headers: { 'Content-Length': '10', 'Content-Type': 'video/mp4', ETag: '"v1"' } });
  }}});
}

test('full playback response and HEAD advertise seeking', async () => {
  const full = await fetchVideo();
  assert.equal(full.status, 200);
  assert.equal(full.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(await full.text(), '0123456789');
  const head = await fetchVideo({ Range: 'bytes=0-2' }, 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('Content-Length'), '10');
  assert.equal(await head.text(), '');
});

for (const [range, result, contentRange] of [
  ['bytes=2-8', '2345678', 'bytes 2-8/10'],
  ['bytes=7-', '789', 'bytes 7-9/10'],
  ['bytes=-4', '6789', 'bytes 6-9/10'],
  ['bytes=-20', '0123456789', 'bytes 0-9/10'],
  ['bytes=0-100', '0123456789', 'bytes 0-9/10'],
  ['bytes=0-0', '0', 'bytes 0-0/10'],
]) test(`seeking ${range} returns exactly the requested bytes across chunks`, async () => {
  const response = await fetchVideo({ Range: range });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('Content-Range'), contentRange);
  assert.equal(response.headers.get('Content-Length'), String(result.length));
  assert.equal(await response.text(), result);
});

test('unsatisfiable ranges return 416', async () => {
  for (const Range of ['bytes=10-', 'bytes=7-3', 'bytes=-0']) {
    const response = await fetchVideo({ Range });
    assert.equal(response.status, 416);
    assert.equal(response.headers.get('Content-Range'), 'bytes */10');
    assert.equal(await response.text(), '');
  }
});

test('ranges also work when Assets omits its internal Content-Length', async () => {
  const request = new Request('https://media.example/introduction.mp4', { headers: { Range: 'bytes=0-2' } });
  const response = await worker.fetch(request, { ASSETS: { fetch: async () => new Response(content) } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('Content-Length'), '3');
  assert.equal(await response.text(), '012');
});

test('unsupported or stale ranges fall back to the complete video', async () => {
  for (const headers of [{ Range: 'bytes=0-1,7-9' }, { Range: 'invalid' }, { Range: 'bytes=0-1', 'If-Range': '"old"' }]) {
    const response = await fetchVideo(headers);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '0123456789');
  }
  const fresh = await fetchVideo({ Range: 'bytes=0-1', 'If-Range': '"v1"' });
  assert.equal(fresh.status, 206);
  await fresh.body.cancel();
});
