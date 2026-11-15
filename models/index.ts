/**
 * EMR/EHR models. Import from here rather than individual files so every model
 * (and its indexes and guards) is registered before use.
 *
 * Models with the phiGuard plugin refuse unscoped queries and saves; go through
 * lib/authz.ts (scopeFilter + token) or use systemToken() for jobs.
 */
export * from "./people";
export * from "./clinical";
export * from "./billing";
export * from "./compliance";
export * from "./scheduling";
export * from "./communication";
export * from "./system";
export { EmailSubscriber } from "./EmailSubscriber";
