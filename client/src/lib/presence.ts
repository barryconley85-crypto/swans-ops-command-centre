export const PRESENCE_WINDOW_MS = 2 * 60 * 1_000;

export function isActiveNow(record: any, now = Date.now()) { return Boolean(record?.lastActiveAt && now - record.lastActiveAt >= 0 && now - record.lastActiveAt < PRESENCE_WINDOW_MS); }

export function activePresence(records: any[], now = Date.now()) { return (records || []).filter(record => isActiveNow(record, now)).sort((a, b) => b.lastActiveAt - a.lastActiveAt); }
