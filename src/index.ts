/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

const MAX_PATHNAME_LENGTH = 512;

function getRequestSourceHost(request: Request): string | null {
	const origin = request.headers.get('Origin');
	if (origin) {
		try {
			return new URL(origin).host;
		} catch {}
	}

	const referer = request.headers.get('Referer');
	if (referer) {
		try {
			return new URL(referer).host;
		} catch {}
	}

	return null;
}

function normalizePathname(input: unknown): string | null {
	if (typeof input !== 'string') return null;
	const pathname = input.trim();
	if (!pathname.startsWith('/')) return null;
	if (pathname.length === 0 || pathname.length > MAX_PATHNAME_LENGTH) return null;
	return pathname;
}

function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
	const headers = new Headers(init.headers);
	if (!headers.has('content-type')) {
		headers.set('content-type', 'application/json; charset=UTF-8');
	}
	return new Response(JSON.stringify(data), { ...init, headers });
}

function buildCorsHeaders(origin: string | null): Headers {
	const headers = new Headers();
	if (origin) {
		headers.set('access-control-allow-origin', origin);
		headers.set('vary', 'Origin');
	}
	headers.set('access-control-allow-methods', 'POST, OPTIONS');
	headers.set('access-control-allow-headers', 'content-type');
	headers.set('access-control-max-age', '86400');
	return headers;
}

function trackerJsResponse(request: Request): Response {
	const script = `(()=>{const s=document.currentScript;let o=\"\";try{o=new URL((s&&s.src)||\"\",location.href).origin;}catch{try{o=new URL(location.href).origin;}catch{o=\"\";}}const e=o?o+\"/send\":\"/send\";let l=null;function p(){try{const n=location.pathname||\"/\";if(l===n)return;l=n;const t=JSON.stringify({pathname:n});if(navigator.sendBeacon){try{navigator.sendBeacon(e,new Blob([t],{type:\"application/json\"}));return;}catch{}}fetch(e,{method:\"POST\",headers:{\"content-type\":\"application/json\"},body:t,keepalive:true,mode:\"cors\",credentials:\"omit\"}).catch(()=>{});}catch{}}const u=history.pushState;const r=history.replaceState;history.pushState=function(){const a=u.apply(this,arguments);p();return a;};history.replaceState=function(){const a=r.apply(this,arguments);p();return a;};addEventListener(\"popstate\",p,true);if(document.readyState===\"loading\"){document.addEventListener(\"DOMContentLoaded\",p,{once:true});}else{p();}})();`;

	const headers = new Headers();
	headers.set('content-type', 'application/javascript; charset=UTF-8');
	headers.set('cache-control', 'public, max-age=3600');
	headers.set('x-content-type-options', 'nosniff');

	const origin = request.headers.get('Origin');
	if (origin) headers.set('access-control-allow-origin', origin);

	return new Response(script, { status: 200, headers });
}

async function ensureSchema(env: Env): Promise<void> {
	await env.cf_umami.exec(`
		CREATE TABLE IF NOT EXISTS pageviews (
			pathname TEXT PRIMARY KEY,
			views INTEGER NOT NULL
		);
	`);
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === 'GET' && url.pathname === '/tracker.js') {
			return trackerJsResponse(request);
		}

		if (request.method === 'OPTIONS' && url.pathname === '/send') {
			const origin = request.headers.get('Origin');
			let allowOrigin: string | null = null;
			if (origin) {
				try {
					const originUrl = new URL(origin);
					if (originUrl.host === env.TRACKED_SITE_HOST) allowOrigin = originUrl.origin;
				} catch {}
			}
			return new Response(null, { status: 204, headers: buildCorsHeaders(allowOrigin) });
		}

		if (request.method === 'POST' && url.pathname === '/send') {
			const sourceHost = getRequestSourceHost(request);
			if (sourceHost !== env.TRACKED_SITE_HOST) {
				return new Response(null, { status: 204 });
			}

			await ensureSchema(env);

			let body: unknown;
			try {
				body = await request.json();
			} catch {
				return jsonResponse({ ok: false, error: 'invalid_json' }, { status: 400 });
			}

			const pathname = normalizePathname((body as { pathname?: unknown })?.pathname);
			if (!pathname) {
				return jsonResponse({ ok: false, error: 'invalid_pathname' }, { status: 400 });
			}

			await env.cf_umami
				.prepare(
					'INSERT INTO pageviews(pathname, views) VALUES(?, 1) ON CONFLICT(pathname) DO UPDATE SET views = views + 1;',
				)
				.bind(pathname)
				.run();

			const origin = request.headers.get('Origin');
			let allowOrigin: string | null = null;
			if (origin) {
				try {
					const originUrl = new URL(origin);
					if (originUrl.host === env.TRACKED_SITE_HOST) allowOrigin = originUrl.origin;
				} catch {}
			}

			return jsonResponse({ ok: true }, { status: 200, headers: buildCorsHeaders(allowOrigin) });
		}

		if (request.method === 'GET' && url.pathname === '/share') {
			const pathname = normalizePathname(url.searchParams.get('pathname'));
			if (!pathname) {
				return jsonResponse({ ok: false, error: 'invalid_pathname' }, { status: 400 });
			}

			await ensureSchema(env);

			const row = await env.cf_umami
				.prepare('SELECT views FROM pageviews WHERE pathname = ?')
				.bind(pathname)
				.first<{ views: number }>();

			return jsonResponse({ pathname, views: row?.views ?? 0 });
		}

		return new Response('Not Found', { status: 404 });
	},
} satisfies ExportedHandler<Env>;
