import {
	CookieTransitionDataStore,
	emptyVisitorData,
	serializeCookie,
	type EnrichmentData,
	type EventData,
	type Quirks,
	type ScoreVector,
	type Tests,
} from '@uniformdev/context';

/**
 * Akamai solution parser: maps this EdgeWorker's POST body onto Uniform Context.
 * Replace this module with your own contract — it is not part of context-engine.
 */
export const CLIENT_VISITOR_BODY_MAX_CHARS = 2000;

export type ClientVisitorPayload = {
	quirks?: Quirks;
	device?: Record<string, string | number | boolean>;
	scores?: ScoreVector;
	sessionScores?: ScoreVector;
	tests?: Tests;
	enrichments?: EnrichmentData[];
	events?: EventData[];
};

export type ResolvedVisitorIdentity = {
	source: 'client-body';
	quirks: Quirks;
	cookieValue: string;
	quirkCookieValue: string;
	enrichments?: EnrichmentData[];
	events?: EventData[];
};

export type ResolvePostVisitorResult =
	| { ok: true; identity: ResolvedVisitorIdentity }
	| { ok: true; identity: null }
	| { ok: false; status: 400; message: string };

export function resolvePostVisitorBody(method: string | undefined, raw: string | undefined | null): ResolvePostVisitorResult {
	if ((method || 'GET').toUpperCase() !== 'POST') {
		return { ok: true, identity: null };
	}

	const trimmed = raw?.trim() ?? '';
	if (!trimmed) {
		return { ok: true, identity: null };
	}
	if (trimmed.length > CLIENT_VISITOR_BODY_MAX_CHARS) {
		return { ok: false, status: 400, message: `Visitor body exceeds ${CLIENT_VISITOR_BODY_MAX_CHARS} characters` };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return { ok: false, status: 400, message: 'Visitor body must be a JSON object' };
	}
	if (!isPlainObject(parsed)) {
		return { ok: false, status: 400, message: 'Visitor body must be a JSON object' };
	}

	return { ok: true, identity: visitorFromClientPayload(normalize(parsed)) };
}

export function visitorFromClientPayload(payload: ClientVisitorPayload): ResolvedVisitorIdentity {
	const quirks: Quirks = { ...(payload.quirks ?? {}) };
	if (payload.device) {
		for (const [key, value] of Object.entries(payload.device)) {
			if (value == null || quirks[key] !== undefined) continue;
			quirks[key] = String(value);
		}
	}

	return {
		source: 'client-body',
		quirks,
		cookieValue: serializeCookie({
			...emptyVisitorData(),
			quirks: {},
			scores: payload.scores ?? {},
			sessionScores: payload.sessionScores ?? {},
			tests: payload.tests ?? {},
			controlGroup: false,
		}),
		quirkCookieValue: '',
		enrichments: payload.enrichments,
		events: payload.events,
	};
}

export function createCookieTransitionStore(identity: { cookieValue?: string; quirkCookieValue?: string }) {
	return new CookieTransitionDataStore({
		cookieName: 'ufvd',
		serverCookieValue: identity.cookieValue,
		quirkCookieName: 'ufvdqk',
		quirkCookieValue: identity.quirkCookieValue,
		experimental_quirksEnabled: true,
	});
}

export function quirksFromHeaderRecord(headers: Record<string, string | string[] | undefined>): Quirks {
	const quirks: Quirks = {};
	for (const [name, value] of Object.entries(headers)) {
		if (!name.toLowerCase().startsWith('x-quirk-')) continue;
		const key = name.slice('x-quirk-'.length);
		const headerValue = Array.isArray(value) ? value[0] : value;
		if (key && headerValue) quirks[key] = headerValue;
	}
	return quirks;
}

export function extractUniformCookies(cookieHeader: string) {
	let ufvdCookieValue = '';
	let quirkCookieValue = '';
	for (const cookie of cookieHeader.split(';').map((part) => part.trim())) {
		if (cookie.startsWith('ufvd=')) ufvdCookieValue = cookie.substring(5);
		else if (cookie.startsWith('ufvdqk=')) quirkCookieValue = cookie.substring(7);
	}
	return { ufvdCookieValue, quirkCookieValue };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
	if (!isPlainObject(value)) return undefined;
	const result: Record<string, string> = {};
	for (const [key, entry] of Object.entries(value)) {
		if (entry != null) result[key] = String(entry);
	}
	return result;
}

function asNumberRecord(value: unknown): ScoreVector | undefined {
	if (!isPlainObject(value)) return undefined;
	const result: ScoreVector = {};
	for (const [key, entry] of Object.entries(value)) {
		const numeric = typeof entry === 'number' ? entry : Number(entry);
		if (Number.isFinite(numeric)) result[key] = numeric;
	}
	return result;
}

function normalize(value: Record<string, unknown>): ClientVisitorPayload {
	return {
		quirks: asStringRecord(value.quirks),
		device: isPlainObject(value.device)
			? Object.fromEntries(
					Object.entries(value.device).filter(
						([, entry]) => typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean',
					),
				)
			: undefined,
		scores: asNumberRecord(value.scores),
		sessionScores: asNumberRecord(value.sessionScores),
		tests: asStringRecord(value.tests),
		enrichments: Array.isArray(value.enrichments)
			? value.enrichments.flatMap((item) => {
					if (!isPlainObject(item) || typeof item.cat !== 'string' || typeof item.key !== 'string') return [];
					const str = typeof item.str === 'number' ? item.str : Number(item.str);
					return Number.isFinite(str) ? [{ cat: item.cat, key: item.key, str }] : [];
				})
			: undefined,
		events: Array.isArray(value.events)
			? value.events.flatMap((item) =>
					isPlainObject(item) && typeof item.event === 'string' ? [{ event: item.event }] : [],
				)
			: undefined,
	};
}
