import { notFound } from "next/navigation";
import { Column, Feedback, Grid, Heading, Row, SmartLink, Tag, Text } from "@once-ui-system/core";
import { UserActions } from "@/components/admin/user-actions";
import { getUser } from "@/lib/admin/users";
import { requireSession } from "@/lib/dal";
import { ROLE_LABELS } from "@/lib/navigation";
import { formatDateTime } from "@/lib/time";

export const metadata = { title: "User" };

export default async function UserDetailPage({ params, searchParams }: PageProps<"/dashboard/users/[id]">) {
  const ctx = await requireSession({ roles: ["SUPER_ADMIN"] });
  const { id } = await params;
  const query = await searchParams;
  const data = await getUser(ctx, id);
  if (!data) notFound();
  const { user, profile, activeSessions, recent } = data;

  const facts: [string, string][] = [
    ["Role", ROLE_LABELS[user.role] ?? user.role],
    ["Status", user.status === "ACTIVE" ? "Active" : "Deactivated"],
    ["Two-step verification", user.twoFactorEnabled ? "On" : "Not set up"],
    ["Signed in on", `${activeSessions} ${activeSessions === 1 ? "device" : "devices"}`],
    ["Last sign-in", user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Never"],
    ["Account created", formatDateTime(user.createdAt)],
    ...(profile?.credentials ? ([["Credentials", profile.credentials]] as [string, string][]) : []),
    ...(profile?.npi ? ([["NPI", profile.npi]] as [string, string][]) : []),
    ...(profile?.specialty ? ([["Specialty", profile.specialty]] as [string, string][]) : []),
  ];

  return (
    <Column gap="24">
      <Column gap="8">
        <SmartLink href="/dashboard/users">← Users</SmartLink>
        <Row gap="12" vertical="center" wrap>
          <Heading as="h1" variant="display-strong-xs">
            {profile?.displayName ?? user.name}
          </Heading>
          {user.status !== "ACTIVE" && <Tag variant="neutral" label="Deactivated" />}
        </Row>
        <Text variant="body-default-m" onBackground="neutral-medium">
          {user.email}
        </Text>
      </Column>

      {query.invited && <Feedback variant="success" title="Invitation sent" description={`${user.email} will receive a link to set their password.`} />}

      <Grid columns="2" gap="24" m={{ columns: 1 }}>
        <Column gap="12" padding="24" radius="l" background="surface" border="neutral-alpha-weak">
          <Heading as="h2" variant="heading-strong-m">
            Account
          </Heading>
          <dl className="fact-list">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </Column>
        <Column gap="12" padding="24" radius="l" background="surface" border="neutral-alpha-weak">
          <Heading as="h2" variant="heading-strong-m">
            Actions
          </Heading>
          <UserActions
            userId={user.id}
            email={user.email}
            role={user.role}
            status={user.status}
            twoFactorEnabled={user.twoFactorEnabled}
            isSelf={user.id === ctx.userId}
            isClient={user.role === "PATIENT"}
          />
        </Column>
      </Grid>

      <Column gap="12">
        <Heading as="h2" variant="heading-strong-m">
          Recent activity
        </Heading>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">When (ET)</th>
                <th scope="col">Action</th>
                <th scope="col">Resource</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr>
                  <td colSpan={3}>No activity yet.</td>
                </tr>
              )}
              {recent.map((e) => (
                <tr key={e.seq}>
                  <td style={{ whiteSpace: "nowrap" }}>{formatDateTime(e.timestamp)}</td>
                  <td>
                    {e.action.replaceAll("_", " ").toLowerCase()}
                    {e.outcome !== "SUCCESS" && <Tag size="s" variant="danger" label={e.outcome.toLowerCase()} />}
                  </td>
                  <td>{e.resource}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <SmartLink href={`/dashboard/audit?actor=${encodeURIComponent(user.email)}`}>Full history in the audit trail →</SmartLink>
      </Column>
    </Column>
  );
}
