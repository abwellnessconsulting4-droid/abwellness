import type { IconName } from "@/resources/icons";
import { can, type Action, type Resource, type Role } from "@/lib/rbac";

/**
 * Signed-in navigation. An item shows only when the role holds the permission
 * (same matrix the server enforces). `ready: false` items render as "Soon"
 * until their module ships.
 */
export interface NavItem {
  label: string;
  href: string;
  icon: IconName;
  requires?: { resource: Resource; action: Action };
  ready: boolean;
}

export const STAFF_NAV: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: "home", ready: true },
  { label: "Clients", href: "/dashboard/patients", icon: "users", requires: { resource: "patient", action: "read" }, ready: true },
  { label: "Schedule", href: "/dashboard/schedule", icon: "calendar", requires: { resource: "appointment", action: "read" }, ready: true },
  { label: "Telehealth", href: "/dashboard/telehealth", icon: "chat", requires: { resource: "telehealth", action: "read" }, ready: true },
  { label: "Billing & claims", href: "/dashboard/billing", icon: "building", requires: { resource: "claim", action: "read" }, ready: true },
  { label: "Messages", href: "/dashboard/messages", icon: "mail", requires: { resource: "message", action: "read" }, ready: false },
  { label: "Analytics", href: "/dashboard/analytics", icon: "sparkles", requires: { resource: "analytics", action: "read" }, ready: false },
  { label: "Users", href: "/dashboard/users", icon: "people", requires: { resource: "user", action: "update" }, ready: true },
  { label: "Audit trail", href: "/dashboard/audit", icon: "shield", requires: { resource: "auditLog", action: "read" }, ready: true },
  { label: "Compliance", href: "/dashboard/compliance", icon: "lock", requires: { resource: "compliance", action: "read" }, ready: false },
];

export const PATIENT_NAV: NavItem[] = [
  { label: "Overview", href: "/portal", icon: "home", ready: true },
  { label: "Appointments", href: "/portal/appointments", icon: "calendar", ready: false },
  { label: "Forms & intake", href: "/portal/intake", icon: "checkCircle", ready: false },
  { label: "Documents", href: "/portal/documents", icon: "book", ready: false },
  { label: "Consents", href: "/portal/consents", icon: "shield", ready: false },
  { label: "Billing", href: "/portal/billing", icon: "building", ready: false },
  { label: "Messages", href: "/portal/messages", icon: "mail", ready: false },
];

export function navFor(role: Role, items: NavItem[]) {
  return items.filter((item) => !item.requires || can(role, item.requires.resource, item.requires.action));
}

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Administrator",
  PROVIDER: "Provider",
  BILLING_STAFF: "Billing",
  FRONT_DESK: "Front desk",
  PATIENT: "Client",
};
