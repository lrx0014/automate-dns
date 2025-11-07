import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { resolvers, type ResolverRow } from "./db/schema";

type ResolverDto = {
	id: number;
	provider: string;
	hostname: string;
	alias: string;
	ipv4: string;
	isDeleted: boolean;
	mtime: string;
	ctime: string;
};

type ResolverPayload = Partial<
	Pick<ResolverDto, "provider" | "hostname" | "alias" | "ipv4">
>;

type ParsedJsonBody =
	| { data: Record<string, unknown>; error: null }
	| { data: null; error: Response };

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const IPV4_REGEX =
	/^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

const app = new Hono<{ Bindings: Env }>();

app.get("/", () =>
	jsonResponse({
		service: "automate-dns",
		endpoints: [
			"GET    /resolvers",
			"POST   /resolvers",
			"GET    /resolvers/:id",
			"PUT    /resolvers/:id",
			"PATCH  /resolvers/:id",
			"DELETE /resolvers/:id",
		],
	}),
);

app.get("/health", () => jsonResponse({ ok: true }));

app.get("/resolvers", (c) => {
	const params = new URL(c.req.url).searchParams;
	return handleListResolvers(c.env, params);
});

app.post("/resolvers", (c) => handleCreateResolver(c.req.raw, c.env));

app.get("/resolvers/:id", (c) => {
	const id = parseResolverIdParam(c.req.param("id"));
	if (!id) {
		return jsonError("Resolver id must be a positive integer", 400);
	}

	const params = new URL(c.req.url).searchParams;
	return handleGetResolver(c.env, id, params);
});

app.put("/resolvers/:id", (c) => {
	const id = parseResolverIdParam(c.req.param("id"));
	if (!id) {
		return jsonError("Resolver id must be a positive integer", 400);
	}
	return handleUpdateResolver(c.req.raw, c.env, id);
});

app.patch("/resolvers/:id", (c) => {
	const id = parseResolverIdParam(c.req.param("id"));
	if (!id) {
		return jsonError("Resolver id must be a positive integer", 400);
	}
	return handleUpdateResolver(c.req.raw, c.env, id);
});

app.delete("/resolvers/:id", (c) => {
	const id = parseResolverIdParam(c.req.param("id"));
	if (!id) {
		return jsonError("Resolver id must be a positive integer", 400);
	}
	return handleDeleteResolver(c.env, id);
});

app.notFound(() => jsonError("Not found", 404));

app.onError((err) => {
	console.error("Request handling error", err);
	return jsonError("Internal Server Error", 500);
});

export default app;

function getDb(env: Env) {
	return drizzle(env.DB);
}

async function handleListResolvers(env: Env, params: URLSearchParams) {
	const db = getDb(env);
	const includeDeleted = parseBoolean(params.get("includeDeleted"));
	const providerFilter = optionalString(params.get("provider"));
	const hostnameFilter = optionalString(params.get("hostname"));
	const limit = parseLimit(params.get("limit"), 100, 500);
	const offset = parseOffset(params.get("offset"));

	const conditions: Condition[] = [];
	if (!includeDeleted) {
		conditions.push(eq(resolvers.isDeleted, 0));
	}
	if (providerFilter) {
		conditions.push(eq(resolvers.provider, providerFilter));
	}
	if (hostnameFilter) {
		conditions.push(eq(resolvers.hostname, hostnameFilter));
	}

	let whereClause: Condition | undefined;
	if (!conditions.length) {
		whereClause = undefined;
	} else if (conditions.length === 1) {
		whereClause = conditions[0];
	} else {
		whereClause = and(...conditions) ?? undefined;
	}

	const rows = whereClause
		? await db
				.select()
				.from(resolvers)
				.where(whereClause)
				.orderBy(desc(resolvers.id))
				.limit(limit)
				.offset(offset)
		: await db
				.select()
				.from(resolvers)
				.orderBy(desc(resolvers.id))
				.limit(limit)
				.offset(offset);

	return jsonResponse({
		items: rows.map(toResolverDto),
		limit,
		offset,
		count: rows.length,
	});
}

async function handleGetResolver(
	env: Env,
	id: number,
	params: URLSearchParams,
) {
	const includeDeleted = parseBoolean(params.get("includeDeleted"));
	const row = await findResolverById(env, id, includeDeleted);

	if (!row) {
		return jsonError("Resolver not found", 404);
	}

	return jsonResponse(toResolverDto(row));
}

async function handleCreateResolver(request: Request, env: Env) {
	const parsed = await readJsonBody(request);
	if (parsed.error) {
		return parsed.error;
	}

	const { fields, errors } = validateResolverPayload(parsed.data, {
		requireProvider: true,
		requireHostname: true,
	});

	if (errors.length) {
		return jsonError("Validation failed", 422, { errors });
	}

	const db = getDb(env);

	try {
		const [row] = await db
			.insert(resolvers)
			.values({
				provider: fields.provider!,
				hostname: fields.hostname!,
				alias: fields.alias ?? "",
				ipv4: fields.ipv4 ?? "",
			})
			.returning();

		return jsonResponse(toResolverDto(row!), 201);
	} catch (dbError) {
		if (
			dbError instanceof Error &&
			dbError.message.includes("UNIQUE constraint failed")
		) {
			return jsonError(
				"A resolver with the same provider and hostname already exists",
				409,
			);
		}

		console.error("Failed to create resolver", dbError);
		return jsonError("Failed to create resolver", 500);
	}
}

async function handleUpdateResolver(
	request: Request,
	env: Env,
	id: number,
) {
	const parsed = await readJsonBody(request);
	if (parsed.error) {
		return parsed.error;
	}

	const { fields, errors } = validateResolverPayload(parsed.data, {
		requireAnyField: true,
	});

	if (errors.length) {
		return jsonError("Validation failed", 422, { errors });
	}

	const updateValues: Partial<
		Pick<ResolverRow, "provider" | "hostname" | "alias" | "ipv4">
	> = {};

	if (fields.provider !== undefined) {
		updateValues.provider = fields.provider;
	}

	if (fields.hostname !== undefined) {
		updateValues.hostname = fields.hostname;
	}

	if (fields.alias !== undefined) {
		updateValues.alias = fields.alias;
	}

	if (fields.ipv4 !== undefined) {
		updateValues.ipv4 = fields.ipv4;
	}

	if (!Object.keys(updateValues).length) {
		return jsonError(
			"At least one updatable field (provider, hostname, alias, ipv4) is required",
			422,
		);
	}

	const db = getDb(env);

	try {
		const [row] = await db
			.update(resolvers)
			.set({
				...updateValues,
				mtime: sql`CURRENT_TIMESTAMP`,
			})
			.where(and(eq(resolvers.id, id), eq(resolvers.isDeleted, 0)))
			.returning();

		if (!row) {
			return jsonError("Resolver not found or already deleted", 404);
		}

		return jsonResponse(toResolverDto(row));
	} catch (dbError) {
		if (
			dbError instanceof Error &&
			dbError.message.includes("UNIQUE constraint failed")
		) {
			return jsonError(
				"Another resolver already uses this provider and hostname",
				409,
			);
		}

		console.error("Failed to update resolver", dbError);
		return jsonError("Failed to update resolver", 500);
	}
}

async function handleDeleteResolver(env: Env, id: number) {
	const db = getDb(env);
	const [row] = await db
		.update(resolvers)
		.set({
			isDeleted: 1,
			mtime: sql`CURRENT_TIMESTAMP`,
		})
		.where(and(eq(resolvers.id, id), eq(resolvers.isDeleted, 0)))
		.returning();

	if (!row) {
		return jsonError("Resolver not found or already deleted", 404);
	}

	return jsonResponse(toResolverDto(row));
}

async function readJsonBody(request: Request): Promise<ParsedJsonBody> {
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

function validateResolverPayload(
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

async function findResolverById(
	env: Env,
	id: number,
	includeDeleted: boolean,
) {
	const db = getDb(env);
	const whereClause = includeDeleted
		? eq(resolvers.id, id)
		: and(eq(resolvers.id, id), eq(resolvers.isDeleted, 0));

	const rows = await db.select().from(resolvers).where(whereClause).limit(1);
	return rows[0] ?? null;
}

function toResolverDto(row: ResolverRow): ResolverDto {
	return {
		id: row.id,
		provider: row.provider,
		hostname: row.hostname,
		alias: row.alias,
		ipv4: row.ipv4,
		isDeleted: row.isDeleted === 1,
		mtime: row.mtime,
		ctime: row.ctime,
	};
}

function parseBoolean(value: string | null) {
	if (value === null) {
		return false;
	}

	const normalized = value.trim().toLowerCase();
	return ["1", "true", "yes", "on"].includes(normalized);
}

function optionalString(value: string | null) {
	if (value === null) {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length ? trimmed : undefined;
}

function parseLimit(value: string | null, fallback: number, max: number) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}
	return Math.min(Math.floor(parsed), max);
}

function parseOffset(value: string | null) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return 0;
	}
	return Math.floor(parsed);
}

function parseResolverIdParam(value: string | undefined) {
	if (typeof value !== "string") {
		return null;
	}

	const id = Number(value);
	if (!Number.isInteger(id) || id < 1) {
		return null;
	}

	return id;
}

type Condition = SQL<unknown>;

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body, null, 2), {
		status,
		headers: JSON_HEADERS,
	});
}

function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
	return jsonResponse(
		{
			error: message,
			...(extra ?? {}),
		},
		status,
	);
}
