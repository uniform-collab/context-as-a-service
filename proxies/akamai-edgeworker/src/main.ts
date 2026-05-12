import type { RouteGetResponse } from '@uniformdev/canvas';
import type { ManifestV2 } from '@uniformdev/context';
import { CookieTransitionDataStore } from '@uniformdev/context';
import { processComposition } from '@uniformdev/context-engine';
import manifest from './context-manifest.json';
import { httpRequest } from 'http-request';
import { logger } from 'log';
import { createResponse } from 'create-response';

export async function responseProvider(request: EW.ResponseProviderRequest) {
	try {
		const projectId = request.getVariable('PMUSER_UNIFORM_PROJECTID');
		const apiKey = request.getVariable('PMUSER_UNIFORM_API_KEY');

		if (!projectId) {
			return createResponse(500, { 'Content-Type': 'text/html' }, '<html><body><h1>ProjectId is undefined</h1></body></html>');
		}
		if (!apiKey) {
			return createResponse(500, { 'Content-Type': 'text/html' }, '<html><body><h1>ApiKey is undefined</h1></body></html>');
		}

		const originalUrl = request.url;
		const [path, search] = originalUrl.split('?');

		const uniformUrl = `https://uniform.global${path}?${search}`;

		// Extract quirks from headers
		const quirks: Record<string, string> = {};
		const headers = request.getHeaders();
		for (const headerName in headers) {
			if (headerName.startsWith('x-quirk-')) {
				const headerValue = headers[headerName];
				if (headerValue && headerValue.length > 0) {
					quirks[headerName.replace('x-quirk-', '')] = headerValue[0];
				}
			}
		}

		// Extract cookie values for transition data store
		const cookieHeader = request.getHeader('Cookie')?.[0] || '';
		let ufvdCookieValue = '';
		let quirkCookieValue = '';

		const cookies = cookieHeader.split(';').map((cookie) => cookie.trim());
		for (const cookie of cookies) {
			logger.log('individual cookie', cookie);
			if (cookie.startsWith('ufvd=')) {
				ufvdCookieValue = cookie.substring(5);
			} else if (cookie.startsWith('ufvdqk=')) {
				quirkCookieValue = cookie.substring(7);
			}
		}

		const requestOptions = {
			headers: {
				'x-api-key': apiKey,
				Accept: 'application/json',
				'Content-Type': 'application/json',
				'User-Agent': 'Akamai-EdgeWorkers',
				Host: 'uniform.global',
			},
			method: 'GET',
			timeout: 5000,
		};

		const fetchResponse = await httpRequest(uniformUrl, {
			...requestOptions,
		});

		const responseText = await fetchResponse.text();

		if (fetchResponse.ok && path.toLowerCase() === '/api/v1/route') {
			const route: RouteGetResponse = JSON.parse(responseText);

			if (route.type === 'composition') {
				await processComposition({
					composition: route.compositionApiResponse.composition,
					quirks,
					manifest: manifest as ManifestV2,
					contextOptions: {
						transitionStore: new CookieTransitionDataStore({
							cookieName: 'ufvd',
							serverCookieValue: ufvdCookieValue,
							quirkCookieName: 'ufvdqk',
							quirkCookieValue: quirkCookieValue,
							experimental_quirksEnabled: true,
						}),
					},
				});

				return createResponse(200, { 'Content-Type': 'application/json' }, JSON.stringify(route));
			}
		}

		return createResponse(fetchResponse.status, { 'Content-Type': 'application/json' }, responseText);
	} catch (error) {
		return createResponse(500, { 'Content-Type': 'text/html' }, `<html><body><h1>Internal Server Error: ${error}</h1></body></html>`);
	}
}
