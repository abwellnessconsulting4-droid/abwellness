import { describe, expect, it } from "vitest";
import { ACTIONS, can, PERMISSIONS, RESOURCES, ROLES, scopeFor, sessionPolicyFor } from "@/lib/rbac";

describe("permission matrix", () => {
  it("only references known resources and actions", () => {
    for (const role of ROLES) {
      for (const [resource, grants] of Object.entries(PERMISSIONS[role])) {
        expect(RESOURCES).toContain(resource);
        for (const action of Object.keys(grants ?? {})) expect(ACTIONS).toContain(action);
      }
    }
  });

  it("keeps billing staff away from clinical and psychotherapy notes (Use Case 6)", () => {
    for (const action of ACTIONS) {
      expect(can("BILLING_STAFF", "clinicalNote", action)).toBe(false);
      expect(can("BILLING_STAFF", "psychotherapyNote", action)).toBe(false);
    }
    expect(can("BILLING_STAFF", "claim", "update")).toBe(true);
    expect(can("BILLING_STAFF", "diagnosis", "read")).toBe(true); // codes on claims
  });

  it("gives no standing psychotherapy-note access to anyone but the author", () => {
    expect(scopeFor("PROVIDER", "psychotherapyNote", "read")).toBe("author");
    for (const role of ["SUPER_ADMIN", "BILLING_STAFF", "FRONT_DESK", "PATIENT"] as const) {
      expect(can(role, "psychotherapyNote", "read")).toBe(false);
    }
  });

  it("limits patients to their own records", () => {
    for (const [resource, grants] of Object.entries(PERMISSIONS.PATIENT)) {
      for (const scope of Object.values(grants ?? {})) {
        if (resource === "consentTemplate") expect(scope).toBe("all"); // public templates
        else expect(scope).toBe("own");
      }
    }
  });

  it("limits providers to assigned patients (or their own authored work)", () => {
    for (const [resource, grants] of Object.entries(PERMISSIONS.PROVIDER)) {
      for (const scope of Object.values(grants ?? {})) {
        if (["medicalCode", "consentTemplate", "waitlist"].includes(resource)) expect(scope).toBe("all");
        else expect(["assigned", "author", "own"]).toContain(scope);
      }
    }
  });

  it("only providers sign clinical notes; only patients sign consents", () => {
    for (const role of ROLES) {
      expect(can(role, "clinicalNote", "sign")).toBe(role === "PROVIDER");
      expect(can(role, "signedConsent", "sign")).toBe(role === "PATIENT");
    }
  });

  it("restricts the audit trail and compliance registry to SUPER_ADMIN", () => {
    for (const role of ROLES) {
      expect(can(role, "auditLog", "read")).toBe(role === "SUPER_ADMIN");
      expect(can(role, "compliance", "read")).toBe(role === "SUPER_ADMIN");
    }
  });

  it("applies 15-minute staff and 30-minute patient inactivity timeouts", () => {
    expect(sessionPolicyFor("PROVIDER").idleMinutes).toBe(15);
    expect(sessionPolicyFor("FRONT_DESK").idleMinutes).toBe(15);
    expect(sessionPolicyFor("PATIENT").idleMinutes).toBe(30);
  });
});
