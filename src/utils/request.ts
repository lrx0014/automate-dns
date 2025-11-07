import type { ParsedJsonBody } from "../types";
import { jsonError } from "./http";

export async function readJsonBody(request: Request): Promise<ParsedJsonBody> {
	const raw = await request.text();

	if (!raw.trim()) {
		return { data: null, error: jsonError("Request body is required", 400) };
	}

	try {
		const data = JSON.parse(raw);

		if (!data || typeof data !== "object" || Array.isArray(data)) {
			return { data: null, error: jsonError("Body must be a JSON object", 400) };
		}

		return { data: data as Record<string, unknown>, error: null };
	} catch {
		return { data: null, error: jsonError("Invalid JSON payload", 400) };
	}
}

export function parseBoolean(value: string | null) {
	if (value === null) {
		return false;
	}

	const normalized = value.trim().toLowerCase();
	return ["1", "true", "yes", "on"].includes(normalized);
}

export function optionalString(value: string | null) {
	if (value === null) {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length ? trimmed : undefined;
}

export function parseLimit(value: string | null, fallback: number, max: number) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}
	return Math.min(Math.floor(parsed), max);
}

export function parseOffset(value: string | null) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return 0;
	}
	return Math.floor(parsed);
}

export function parseResolverIdParam(value: string | undefined) {
	if (typeof value !== "string") {
		return null;
	}

	const id = Number(value);
	if (!Number.isInteger(id) || id < 1) {
		return null;
	}

	return id;
}
