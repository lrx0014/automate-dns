import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { resolvers, type ResolverRow } from "../db/schema";
import { syncDnsRecord } from "../dns/updater";
import type { Bindings, Condition, ResolverDto } from "../types";
import { jsonError, jsonResponse } from "../utils/http";
import {
	optionalString,
	parseBoolean,
	parseLimit,
	parseOffset,
	readJsonBody,
} from "../utils/request";
import { validateResolverPayload } from "./validation";

export async function listResolversHandler(
	env: Bindings,
	params: URLSearchParams,
) {
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

export async function getResolverHandler(
	env: Bindings,
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

export async function createResolverHandler(
	request: Request,
	env: Bindings,
) {
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
	let created: ResolverRow | undefined;

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

		created = row;
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

	if (!created) {
		return jsonError("Failed to create resolver", 500);
	}

	if (created.ipv4) {
		try {
			await syncDnsRecord(env, created.hostname, created.ipv4);
		} catch (syncError) {
			console.error("Failed to sync DNS after create", syncError);
			return jsonError("Resolver created but DNS sync failed", 502);
		}
	}

	return jsonResponse(toResolverDto(created), 201);
}

export async function updateResolverHandler(
	request: Request,
	env: Bindings,
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
	const current = await findResolverById(env, id, false);

	if (!current) {
		return jsonError("Resolver not found or already deleted", 404);
	}

	let updated: ResolverRow | undefined;

	try {
		const [row] = await db
			.update(resolvers)
			.set({
				...updateValues,
				mtime: sql`CURRENT_TIMESTAMP`,
			})
			.where(and(eq(resolvers.id, id), eq(resolvers.isDeleted, 0)))
			.returning();

		updated = row;
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

	if (!updated) {
		return jsonError("Resolver not found or already deleted", 404);
	}

	const ipv4Changed =
		fields.ipv4 !== undefined && fields.ipv4 !== current.ipv4;

	if (ipv4Changed && updated.ipv4) {
		try {
			await syncDnsRecord(env, updated.hostname, updated.ipv4);
		} catch (syncError) {
			console.error("Failed to sync DNS after update", syncError);
			return jsonError("Resolver updated but DNS sync failed", 502);
		}
	}

	return jsonResponse(toResolverDto(updated));
}

export async function deleteResolverHandler(env: Bindings, id: number) {
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

async function findResolverById(
	env: Bindings,
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
