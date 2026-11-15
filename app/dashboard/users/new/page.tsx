import { Column, Heading, SmartLink, Text } from "@once-ui-system/core";
import { InviteForm } from "@/components/admin/invite-form";
import { requireSession } from "@/lib/dal";

export const metadata = { title: "Invite staff member" };

export default async function InviteStaffPage() {
  await requireSession({ roles: ["SUPER_ADMIN"] });
  return (
    <Column gap="24" maxWidth="s">
      <Column gap="8">
        <SmartLink href="/dashboard/users">← Users</SmartLink>
        <Heading as="h1" variant="display-strong-xs">
          Invite a staff member
        </Heading>
        <Text variant="body-default-m" onBackground="neutral-medium">
          Client portal accounts are created from the client&apos;s record, not here.
        </Text>
      </Column>
      <Column padding="24" radius="l" background="surface" border="neutral-alpha-weak">
        <InviteForm />
      </Column>
    </Column>
  );
}
