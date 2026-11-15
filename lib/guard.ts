import "server-only";

import { forbidden } from "next/navigation";
import { AuditedDenial } from "@/lib/audit";

/** Await a service call in a page; an audited RBAC denial becomes a real 403 page. */
export async function orForbidden<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof AuditedDenial) forbidden();
    throw error;
  }
}
