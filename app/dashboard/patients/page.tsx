import Link from "next/link";
import { Button, Column, Heading, Input, Row, Tag, Text } from "@once-ui-system/core";
import { requireSession } from "@/lib/dal";
import { orForbidden } from "@/lib/guard";
import { connectToDatabase } from "@/lib/mongodb";
import { STAFF_ROLES } from "@/lib/rbac";
import { searchPatients } from "@/lib/services/patients";
import { ageOn, formatDate } from "@/lib/time";

export const metadata = { title: "Clients" };

export default async function PatientsPage({ searchParams }: PageProps<"/dashboard/patients">) {
  const ctx = await requireSession({ roles: STAFF_ROLES });
  await connectToDatabase();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.slice(0, 80) : "";
  const rows = await orForbidden(searchPatients(ctx, q));

  return (
    <Column gap="24">
      <Column gap="8">
        <Heading as="h1" variant="display-strong-xs">
          Clients
        </Heading>
        <Text variant="body-default-m" onBackground="neutral-medium">
          {ctx.role === "PROVIDER" ? "Clients assigned to you." : "All clients."} Search by last name, first name, MRN, or date of birth (YYYY-MM-DD).
        </Text>
      </Column>
      <form method="get" className="fill-width">
        <Row gap="12" vertical="end" s={{ direction: "column" }}>
          <Input id="q" name="q" label="Search clients" defaultValue={q} placeholder="Vance, ABW-2026-0001, or 1989-04-18" />
          <Button type="submit" variant="secondary" label="Search" />
        </Row>
      </form>
      <Text variant="label-default-s" onBackground="neutral-weak">
        {rows.length} {rows.length === 1 ? "client" : "clients"}
      </Text>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">MRN</th>
              <th scope="col">Date of birth</th>
              <th scope="col">Provider</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/dashboard/patients/${p.id}`} className="table-link">
                    {p.name}
                  </Link>
                </td>
                <td className="notranslate">{p.mrn}</td>
                <td>
                  {formatDate(p.dob)} ({ageOn(p.dob)})
                </td>
                <td>{p.provider ?? "Unassigned"}</td>
                <td>
                  <Tag size="s" variant={p.status === "ACTIVE" ? "success" : "neutral"} label={p.status.toLowerCase()} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Column>
  );
}
