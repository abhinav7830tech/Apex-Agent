import { relations } from "drizzle-orm/relations";
import { user, account, session, agents, meetings, notifications } from "./schema";

export const accountRelations = relations(account, ({one}) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id]
	}),
}));

export const userRelations = relations(user, ({many}) => ({
	accounts: many(account),
	sessions: many(session),
	agents: many(agents),
	meetings: many(meetings),
	notifications: many(notifications),
}));

export const sessionRelations = relations(session, ({one}) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	}),
}));

export const agentsRelations = relations(agents, ({one, many}) => ({
	user: one(user, {
		fields: [agents.userId],
		references: [user.id]
	}),
	meetings: many(meetings),
}));

export const meetingsRelations = relations(meetings, ({one}) => ({
	user: one(user, {
		fields: [meetings.userId],
		references: [user.id]
	}),
	agent: one(agents, {
		fields: [meetings.agentId],
		references: [agents.id]
	}),
}));

export const notificationsRelations = relations(notifications, ({one}) => ({
	user: one(user, {
		fields: [notifications.userId],
		references: [user.id]
	}),
}));