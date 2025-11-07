import { Hono } from "hono";
import {
	createResolverHandler,
	deleteResolverHandler,
	getResolverHandler,
	listResolversHandler,
	updateResolverHandler,
} from "../resolvers/controller";
import type { Bindings } from "../types";
import { jsonError, jsonResponse } from "../utils/http";
import { parseResolverIdParam } from "../utils/request";

export function createApp() {
	const app = new Hono<{ Bindings: Bindings }>();

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
		return listResolversHandler(c.env, params);
	});

	app.post("/resolvers", (c) => createResolverHandler(c.req.raw, c.env));

	app.get("/resolvers/:id", (c) => {
		const id = parseResolverIdParam(c.req.param("id"));
		if (!id) {
			return jsonError("Resolver id must be a positive integer", 400);
		}

		const params = new URL(c.req.url).searchParams;
		return getResolverHandler(c.env, id, params);
	});

	app.put("/resolvers/:id", (c) => {
		const id = parseResolverIdParam(c.req.param("id"));
		if (!id) {
			return jsonError("Resolver id must be a positive integer", 400);
		}
		return updateResolverHandler(c.req.raw, c.env, id);
	});

	app.patch("/resolvers/:id", (c) => {
		const id = parseResolverIdParam(c.req.param("id"));
		if (!id) {
			return jsonError("Resolver id must be a positive integer", 400);
		}
		return updateResolverHandler(c.req.raw, c.env, id);
	});

	app.delete("/resolvers/:id", (c) => {
		const id = parseResolverIdParam(c.req.param("id"));
		if (!id) {
			return jsonError("Resolver id must be a positive integer", 400);
		}
		return deleteResolverHandler(c.env, id);
	});

	app.notFound(() => jsonError("Not found", 404));

	app.onError((err) => {
		console.error("Request handling error", err);
		return jsonError("Internal Server Error", 500);
	});

	return app;
}
