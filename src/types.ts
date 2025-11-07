import type { SQL } from "drizzle-orm";

export type Bindings = Env & {
	CLOUDFLARE_API_TOKEN?: string;
	CLOUDFLARE_ZONE_ID?: string;
};

export type ResolverDto = {
	id: number;
	provider: string;
	hostname: string;
	alias: string;
	ipv4: string;
	isDeleted: boolean;
	mtime: string;
	ctime: string;
};

export type ResolverPayload = Partial<
	Pick<ResolverDto, "provider" | "hostname" | "alias" | "ipv4">
>;

export type ParsedJsonBody =
	| { data: Record<string, unknown>; error: null }
	| { data: null; error: Response };

export type Condition = SQL<unknown>;
