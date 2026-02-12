import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from '../src/index';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('cf-umami worker', () => {
	it('increments views when Origin host matches', async () => {
		const pathname = `/t-${crypto.randomUUID()}`;
		const ctx = createExecutionContext();
		const response = await worker.fetch(
			new IncomingRequest('http://example.com/send', {
				method: 'POST',
				headers: {
					Origin: 'https://2x.nz',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ pathname }),
			}),
			env,
			ctx,
		);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		expect(response.headers.get('access-control-allow-origin')).toBe('https://2x.nz');
		expect(await response.json()).toEqual({ ok: true });

		const shareResponse = await worker.fetch(
			new IncomingRequest(`http://example.com/share?pathname=${encodeURIComponent(pathname)}`),
			env,
			createExecutionContext(),
		);
		expect(await shareResponse.json()).toEqual({ pathname, views: 1 });
	});

	it('does not count when Origin host mismatches', async () => {
		const pathname = `/t-${crypto.randomUUID()}`;
		const ctx = createExecutionContext();
		const response = await worker.fetch(
			new IncomingRequest('http://example.com/send', {
				method: 'POST',
				headers: {
					Origin: 'https://evil.example',
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ pathname }),
			}),
			env,
			ctx,
		);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(204);

		const shareResponse = await worker.fetch(
			new IncomingRequest(`http://example.com/share?pathname=${encodeURIComponent(pathname)}`),
			env,
			createExecutionContext(),
		);
		expect(await shareResponse.json()).toEqual({ pathname, views: 0 });
	});

	it('serves tracker.js', async () => {
		const response = await worker.fetch(
			new IncomingRequest('http://example.com/tracker.js'),
			env,
			createExecutionContext(),
		);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('application/javascript');
		const body = await response.text();
		expect(body).toContain('/send');
		expect(body).toContain('pushState');
	});
});
