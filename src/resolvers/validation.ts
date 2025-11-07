import type { ResolverPayload } from "../types";

const IPV4_REGEX =
	/^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function validateResolverPayload(
	body: Record<string, unknown>,
	options: {
		requireProvider?: boolean;
		requireHostname?: boolean;
		requireAnyField?: boolean;
	} = {},
) {
	const fields: ResolverPayload = {};
	const errors: string[] = [];
	const {
		requireProvider = false,
		requireHostname = false,
		requireAnyField = false,
	} = options;

	if ("provider" in body) {
		const provider = typeof body.provider === "string" ? body.provider.trim() : "";
		if (!provider) {
			errors.push("provider cannot be empty");
		} else {
			fields.provider = provider;
		}
	} else if (requireProvider) {
		errors.push("provider is required");
	}

	if ("hostname" in body) {
		const hostname = typeof body.hostname === "string" ? body.hostname.trim() : "";
		if (!hostname) {
			errors.push("hostname cannot be empty");
		} else {
			fields.hostname = hostname;
		}
	} else if (requireHostname) {
		errors.push("hostname is required");
	}

	if ("alias" in body) {
		fields.alias = typeof body.alias === "string" ? body.alias.trim() : "";
	}

	if ("ipv4" in body) {
		const ipv4 = typeof body.ipv4 === "string" ? body.ipv4.trim() : "";
		if (ipv4 && !IPV4_REGEX.test(ipv4)) {
			errors.push("ipv4 must be a valid IPv4 address");
		} else {
			fields.ipv4 = ipv4;
		}
	}

	if (requireAnyField && !Object.keys(fields).length) {
		errors.push(
			"At least one updatable field (provider, hostname, alias, ipv4) is required",
		);
	}

	return { fields, errors };
}
