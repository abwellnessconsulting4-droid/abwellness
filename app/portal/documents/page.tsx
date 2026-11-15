import { Column, Heading, Row, Text } from "@once-ui-system/core";
import { uploadAction } from "@/app/portal/records-actions";
import { UploadForm } from "@/components/portal/records-forms";
import { requireSession } from "@/lib/dal";
import { connectToDatabase } from "@/lib/mongodb";
import { CATEGORY_LABELS, listDocuments, PATIENT_UPLOAD_CATEGORIES } from "@/lib/services/documents";
import { formatDate } from "@/lib/time";

export const metadata = { title: "Documents" };

const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export default async function PortalDocumentsPage() {
  const ctx = await requireSession({ roles: ["PATIENT"] });
  await connectToDatabase();
  if (!ctx.patientId) return <Text variant="body-default-m">Your account isn&apos;t linked to a client record yet.</Text>;
  const documents = await listDocuments(ctx, ctx.patientId);

  return (
    <Column gap="32" fillWidth maxWidth="m">
      <Column gap="8">
        <Heading as="h1" variant="display-strong-xs">Documents</Heading>
        <Text variant="body-default-m" onBackground="neutral-medium">
          Share your insurance card, ID, referrals, or records with your care team. Files are encrypted and only people involved in your care can open them.
        </Text>
      </Column>

      <Column gap="12" padding="20" radius="l" background="surface" border="neutral-alpha-weak">
        <Heading as="h2" variant="heading-strong-m">Upload a document</Heading>
        <UploadForm action={uploadAction} categories={PATIENT_UPLOAD_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))} />
      </Column>

      <Column gap="12">
        <Heading as="h2" variant="heading-strong-l">Your documents</Heading>
        {documents.length === 0 ? (
          <Text variant="body-default-s" onBackground="neutral-weak">Nothing here yet.</Text>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Type</th>
                  <th scope="col">File</th>
                  <th scope="col">Added</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {documents.map((d) => (
                  <tr key={d.id}>
                    <td>{d.label}</td>
                    <td>
                      <Row gap="8" vertical="center" wrap>
                        <span className="notranslate">{d.fileName}</span>
                        <Text variant="label-default-s" onBackground="neutral-weak">{size(d.byteSize)}</Text>
                      </Row>
                    </td>
                    <td>{d.uploadedAt ? formatDate(d.uploadedAt) : "—"}{d.uploadedByClient ? "" : " · from your care team"}</td>
                    <td>
                      <Row gap="12">
                        <a href={`/documents/${d.id}?view=1`} target="_blank" rel="noopener">View</a>
                        <a href={`/documents/${d.id}`}>Download</a>
                      </Row>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Column>
    </Column>
  );
}
