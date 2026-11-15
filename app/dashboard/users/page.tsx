import Link from "next/link";
import { Button, Column, Heading, Input, Row, Tag, Text } from "@once-ui-system/core";
import { listUsers } from "@/lib/admin/users";
import { requireSession } from "@/lib/dal";
import { ROLE_LABELS } from "@/lib/navigation";
import { ROLES } from "@/lib/rbac";
import { formatDateTime } from "@/lib/time";

export const metadata = { title: "Users" };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() || undefined;

export default async function UsersPage({ searchParams }: PageProps<"/dashboard/users">) {
  const ctx = await requireSession({ roles: ["SUPER_ADMIN"] });
  const params = await searchParams;
  const filters = { role: first(params.role), status: first(params.status), q: first(params.q) };
  const rows = await listUsers(ctx, filters);

  return (
    <Column gap="24">
      <Row horizontal="between" vertical="end" gap="16" wrap>
        <Column gap="8">
          <Heading as="h1" variant="display-strong-xs">
            Users
          </Heading>
          <Text variant="body-default-m" onBackground="neutral-medium">
            Staff and client accounts, their roles, and sign-in security.
          </Text>
        </Column>
        <Button href="/dashboard/users/new" variant="primary" label="Invite staff member" prefixIcon="plus" />
      </Row>

      <form method="get" className="fill-width">
        <Row gap="12" vertical="end" wrap padding="16" radius="l" border="neutral-alpha-weak" background="surface" s={{ direction: "column" }}>
          <Input id="q" name="q" label="Name or email" defaultValue={filters.q} />
          <label className="native-field">
            <span>Role</span>
            <select name="role" defaultValue={filters.role ?? ""}>
              <option value="">All roles</option>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </label>
          <label className="native-field">
            <span>Status</span>
            <select name="status" defaultValue={filters.status ?? ""}>
              <option value="">Any status</option>
              <option value="ACTIVE">Active</option>
              <option value="DEACTIVATED">Deactivated</option>
            </select>
          </label>
          <Button type="submit" variant="secondary" label="Filter" />
        </Row>
      </form>

      <Text variant="label-default-s" onBackground="neutral-weak">
        {rows.length} {rows.length === 1 ? "account" : "accounts"}
      </Text>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
              <th scope="col">Two-step</th>
              <th scope="col">Last sign-in (ET)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((user) => (
              <tr key={user.id}>
                <td>
                  <Link href={`/dashboard/users/${user.id}`} className="table-link">
                    {user.name}
                    {user.credentials ? `, ${user.credentials}` : ""}
                  </Link>
                  <br />
                  <Text variant="label-default-xs" onBackground="neutral-weak">
                    {user.email}
                    {user.id === ctx.userId ? " (you)" : ""}
                  </Text>
                </td>
                <td>{ROLE_LABELS[user.role] ?? user.role}</td>
                <td>
                  <Tag size="s" variant={user.status === "ACTIVE" ? "success" : "neutral"} label={user.status === "ACTIVE" ? "Active" : "Deactivated"} />
                </td>
                <td>{user.twoFactorEnabled ? <Tag size="s" variant="brand" label="On" /> : <Tag size="s" variant="warning" label="Not set up" />}</td>
                <td style={{ whiteSpace: "nowrap" }}>{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Column>
  );
}
