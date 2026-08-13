import type { RouteGetResponse } from '@uniformdev/canvas';
import type { ManifestV2 } from '@uniformdev/context';
import {
	processComposition,
	resolvePostVisitorBody,
	quirksFromHeaderRecord,
	extractUniformCookies,
	createCookieTransitionStore,
} from '@uniformdev/context-engine';
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

		const postResult = resolvePostVisitorBody(
			request.method,
			typeof request.text === 'function' ? await request.text() : '',
		);
		if (!postResult.ok) {
			return createResponse(
				postResult.status,
				{ 'Content-Type': 'application/json' },
				JSON.stringify({ error: postResult.message }),
			);
		}

		const headers = request.getHeaders();
		const cookieHeader = request.getHeader('Cookie')?.[0] || '';
		const { ufvdCookieValue, quirkCookieValue } = extractUniformCookies(cookieHeader);

		let quirks = quirksFromHeaderRecord(headers);
		let cookieValue = ufvdCookieValue;
		let quirkCookie = quirkCookieValue;
		let enrichments = undefined;
		let events = undefined;
		let visitorSource: 'client-body' | 'cookies' = 'cookies';

		if (postResult.identity) {
			visitorSource = 'client-body';
			quirks = postResult.identity.quirks;
			cookieValue = postResult.identity.cookieValue;
			quirkCookie = postResult.identity.quirkCookieValue;
			enrichments = postResult.identity.enrichments;
			events = postResult.identity.events;
		} else {
			const cookies = cookieHeader.split(';').map((cookie) => cookie.trim());
			for (const cookie of cookies) {
				logger.log('individual cookie', cookie);
			}
		}

		const originalUrl = request.url;
		const [path, search] = originalUrl.split('?');
		const uniformUrl = `https://uniform.global${path}?${search}`;

		// Outbound fetch stays GET so Property Manager can cache the Uniform composition.
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
					enrichments,
					events,
					manifest: manifest as ManifestV2,
					contextOptions: {
						transitionStore: createCookieTransitionStore({
							cookieValue,
							quirkCookieValue: quirkCookie,
						}),
					},
				});

				return createResponse(
					200,
					{
						'Content-Type': 'application/json',
						'x-uniform-visitor-source': visitorSource,
					},
					JSON.stringify(route),
				);
			}
		}

		return createResponse(fetchResponse.status, { 'Content-Type': 'application/json' }, responseText);
	} catch (error) {
		return createResponse(500, { 'Content-Type': 'text/html' }, `<html><body><h1>Internal Server Error: ${error}</h1></body></html>`);
	}
}
