import type { Bindings } from "../types";

type CloudflareDnsRecord = {
	id: string;
	type: string;
	name: string;
	content: string;
	ttl?: number;
	proxied?: boolean;
};

type CloudflareApiResponse<T> = {
	success: boolean;
	errors?: { code?: number; message?: string }[];
	result?: T;
};

export async function syncDnsRecord(
	env: Bindings,
	hostname: string,
	ipv4: string,
) {
	if (!ipv4) {
		return;
	}

	const token = env.CLOUDFLARE_API_TOKEN;
	const zoneId = env.CLOUDFLARE_ZONE_ID;

	if (!token || !zoneId) {
		console.warn(
			`Skipping DNS sync for ${hostname} because CLOUDFLARE_API_TOKEN or CLOUDFLARE_ZONE_ID is not set.`,
		);
		return;
	}

	const baseUrl = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`;
	const headers = {
		Authorization: `Bearer ${token}`,
		"content-type": "application/json",
	};

	const existing = await fetchDnsRecord(baseUrl, headers, hostname);

	if (existing && existing.content === ipv4) {
		return;
	}

	const payload = {
		type: "A",
		name: hostname,
		content: ipv4,
		ttl: existing?.ttl ?? 1,
		proxied: existing?.proxied ?? false,
	};

	const endpoint = existing ? `${baseUrl}/${existing.id}` : baseUrl;
	const method = existing ? "PUT" : "POST";

	const response = await fetch(endpoint, {
		method,
		headers,
		body: JSON.stringify(payload),
	});

	const data = await response.json().catch(() => null);

	const success =
		response.ok && (!isCloudflareResponse(data) || data.success !== false);

	if (!success) {
		const message = extractCloudflareError(data);
		throw new Error(
			`Failed to ${existing ? "update" : "create"} DNS record for ${hostname}${
				message ? `: ${message}` : ""
			}`,
		);
	}
}

async function fetchDnsRecord(
	baseUrl: string,
	headers: Record<string, string>,
	hostname: string,
) {
	const url = `${baseUrl}?type=A&name=${encodeURIComponent(hostname)}`;
	const response = await fetch(url, {
		method: "GET",
		headers,
	});

	const data = await response.json().catch(() => null);

	if (!response.ok || (isCloudflareResponse(data) && data.success === false)) {
		const message = extractCloudflareError(data);
		throw new Error(
			`Failed to fetch DNS record for ${hostname}${
				message ? `: ${message}` : ""
			}`,
		);
	}

	if (
		isCloudflareResponse<CloudflareDnsRecord[]>(data) &&
		Array.isArray(data.result)
	) {
		const [record] = data.result;
		return record;
	}

	return undefined;
}

function extractCloudflareError(payload: unknown) {
	if (!isCloudflareResponse(payload) || !payload.errors?.length) {
		return "";
	}

	return payload.errors
		.map((err) => err?.message ?? JSON.stringify(err))
		.join("; ");
}

function isCloudflareResponse<T>(
	payload: unknown,
): payload is CloudflareApiResponse<T> {
	return Boolean(
		payload && typeof payload === "object" && "success" in payload,
	);
}
