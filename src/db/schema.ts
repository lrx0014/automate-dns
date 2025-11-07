import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const resolvers = sqliteTable("resolvers", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	provider: text("provider").notNull(),
	hostname: text("hostname").notNull(),
	alias: text("alias").notNull().default(""),
	ipv4: text("ipv4").notNull().default(""),
	isDeleted: integer("is_deleted").notNull().default(0),
	mtime: text("mtime")
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`),
	ctime: text("ctime")
		.notNull()
		.default(sql`CURRENT_TIMESTAMP`),
});

export type ResolverRow = typeof resolvers.$inferSelect;
export type ResolverInsert = typeof resolvers.$inferInsert;
