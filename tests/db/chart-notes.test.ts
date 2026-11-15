import { describe, expect, it } from "vitest";
import { AuditedDenial } from "@/lib/audit";
import { systemToken } from "@/lib/db/phi-guard";
import { addAllergy, addDiagnosis, ClinicalError } from "@/lib/services/clinical";
import { addAddendum, createNote, getNote, NoteError, signNote, updateDraft } from "@/lib/services/notes";
import { getChart, searchPatients } from "@/lib/services/patients";
import { IDS } from "@/scripts/seed/emr";
import { AuditLog, Claim } from "@/models";
import { EMAIL, setupSeededDatabase } from "./seeded";

const { as } = setupSeededDatabase("chart_notes");
const SYS = { authz: systemToken("test") };
const elena = String(IDS.patients.elena);
const evidence = { ipAddress: "198.51.100.12", userAgent: "vitest" };

describe("client directory", () => {
  it("limits providers to assigned clients; front desk and billing see everyone", async () => {
    const names = async (email: string) => (await searchPatients(await as(email), "")).map((p) => p.mrn).sort();
    expect(await names(EMAIL.thorne)).toEqual(["ABW-2026-0001", "ABW-2026-0002"]);
    expect(await names(EMAIL.ellis)).toEqual(["ABW-2026-0003"]);
    expect(await names(EMAIL.frontDesk)).toHaveLength(3);
    expect(await names(EMAIL.billing)).toHaveLength(3);
  });

  it("searches by MRN, name prefix, and date of birth", async () => {
    const fd = await as(EMAIL.frontDesk);
    expect((await searchPatients(fd, "ABW-2026-0002"))[0]?.name).toBe("Morales, David");
    expect((await searchPatients(fd, "van")).map((p) => p.mrn)).toEqual(["ABW-2026-0001"]);
    expect((await searchPatients(fd, "1994-07-09")).map((p) => p.mrn)).toEqual(["ABW-2026-0003"]);
  });
});

describe("chart sections follow the role", () => {
  it("provider sees clinical sections; front desk and billing don't see notes", async () => {
    const provider = await getChart(await as(EMAIL.thorne), elena);
    expect(provider?.notes?.length).toBeGreaterThan(0);
    expect(provider?.diagnoses?.map((d) => d.icd10Code).sort()).toEqual(["F41.1", "Z73.0"]);
    expect(provider?.allergies?.[0]?.allergen).toBe("Penicillin");

    const frontDesk = await getChart(await as(EMAIL.frontDesk), elena);
    expect(frontDesk?.notes).toBeNull();
    expect(frontDesk?.diagnoses).toBeNull();
    expect(frontDesk?.insurance?.[0]?.memberIdLast4).toBe("7102");
    expect(frontDesk?.patient).not.toHaveProperty("ssnEnc");

    const billing = await getChart(await as(EMAIL.billing), elena);
    expect(billing?.notes).toBeNull();
    expect(billing?.allergies).toBeNull();
    expect(billing?.claims?.length).toBe(1);
  });

  it("an unassigned provider is refused and the attempt is audited", async () => {
    const ellis = await as(EMAIL.ellis);
    await expect(getChart(ellis, elena)).rejects.toBeInstanceOf(AuditedDenial);
    expect(await AuditLog.countDocuments({ actorId: ellis.userId, action: "UNAUTHORIZED_ACCESS_ATTEMPT", patientId: elena }).setOptions(SYS)).toBe(1);
  });

  it("opening a chart is audited as a VIEW of that client", async () => {
    const thorne = await as(EMAIL.thorne);
    await getChart(thorne, elena);
    const entry = await AuditLog.findOne({ actorId: thorne.userId, action: "VIEW", resourceType: "Patient" }).sort({ seq: -1 }).setOptions(SYS).lean();
    expect(entry?.patientId).toBe(elena);
    expect((entry?.metadata as { sections: string[] }).sections).toContain("notes");
  });
});

describe("Use Case 6: billing opens a SOAP note directly", () => {
  it("is refused (403) and recorded", async () => {
    const billing = await as(EMAIL.billing);
    await expect(getNote(billing, String(IDS.notes.elenaSoap))).rejects.toBeInstanceOf(AuditedDenial);
    const entry = await AuditLog.findOne({ actorId: billing.userId, action: "UNAUTHORIZED_ACCESS_ATTEMPT", resourceId: String(IDS.notes.elenaSoap) }).setOptions(SYS).lean();
    expect(entry).toMatchObject({ outcome: "DENIED", actorRole: "BILLING_STAFF", patientId: elena });
  });
});

describe("Use Case 2: document, sign, and generate the claim", () => {
  let noteId: string;

  it("creates and edits a draft (codes validated)", async () => {
    const thorne = await as(EMAIL.thorne);
    await expect(createNote(thorne, elena, { noteType: "SOAP", sections: { subjective: "x" }, diagnosisCodes: ["ZZZ.9"], serviceLines: [] })).rejects.toBeInstanceOf(NoteError);
    noteId = await createNote(thorne, elena, {
      noteType: "SOAP",
      appointmentId: String(IDS.appointments.elenaFollowUp),
      sections: { subjective: "Sleep improved to 6 hours.", objective: "Calm, engaged on video.", assessment: "GAD improving.", plan: "Continue CBT biweekly." },
      diagnosisCodes: ["f41.1", "Z73.0"],
      serviceLines: [{ cptCode: "90834", units: 1, minutes: 45 }],
    });
    await updateDraft(thorne, noteId, {
      sections: { subjective: "Sleep improved to 6.5 hours.", objective: "Calm, engaged on video.", assessment: "GAD improving.", plan: "Continue CBT biweekly." },
      diagnosisCodes: ["F41.1", "Z73.0"],
      serviceLines: [{ cptCode: "90834", units: 1, minutes: 45 }],
    });
    const note = await getNote(thorne, noteId);
    expect(note.sections.subjective).toBe("Sleep improved to 6.5 hours.");
    expect(note.diagnosisCodes).toEqual(["F41.1", "Z73.0"]);
  });

  it("signing locks the note and generates a draft claim with telehealth modifier 95", async () => {
    const thorne = await as(EMAIL.thorne);
    const { claimId } = await signNote(thorne, noteId, evidence);
    expect(claimId).toBeTruthy();
    const claim = await Claim.findById(claimId).setOptions(SYS).lean();
    expect(claim).toMatchObject({ status: "DRAFT", payerName: "BlueCross BlueShield of NY", totalBilledCents: 15500 });
    expect(claim?.lines[0]).toMatchObject({ cptCode: "90834", modifiers: ["95"], placeOfService: "10", icdPointers: ["F41.1", "Z73.0"] });

    await expect(updateDraft(thorne, noteId, { sections: { subjective: "changed" }, diagnosisCodes: [], serviceLines: [] })).rejects.toThrow(/signed/);
    expect(await AuditLog.countDocuments({ action: "SIGN", resourceId: noteId }).setOptions(SYS)).toBe(1);
  });

  it("allows an addendum after signing", async () => {
    const thorne = await as(EMAIL.thorne);
    await addAddendum(thorne, noteId, "Patient called: sleep data was from a sleep tracker.", evidence);
    const note = await getNote(thorne, noteId);
    expect(note.status).toBe("SIGNED_LOCKED");
    expect(note.addenda.map((a) => a.text)).toEqual(["Patient called: sleep data was from a sleep tracker."]);
  });
});

describe("psychotherapy notes", () => {
  it("are visible only to the author and never generate a claim", async () => {
    const thorne = await as(EMAIL.thorne);
    const id = await createNote(thorne, elena, { noteType: "PSYCHOTHERAPY", sections: { body: "Process notes." }, diagnosisCodes: [], serviceLines: [] });
    await expect(getNote(await as(EMAIL.admin), id)).rejects.toBeInstanceOf(AuditedDenial);
    expect((await getNote(thorne, id)).sections.body).toBe("Process notes.");
    expect((await signNote(thorne, id, evidence)).claimId).toBeNull();
    const chart = await getChart(thorne, elena);
    expect(chart?.notes?.some((n) => String(n._id) === id)).toBe(false); // not in the regular notes list
    expect(chart?.psychNotes?.some((n) => String(n._id) === id)).toBe(true);
  });
});

describe("problem list and allergies", () => {
  it("adds a valid diagnosis once, and records allergies", async () => {
    const thorne = await as(EMAIL.thorne);
    await expect(addDiagnosis(thorne, elena, { code: "F41.1" })).rejects.toBeInstanceOf(ClinicalError);
    await addDiagnosis(thorne, elena, { code: "F51.01" });
    await addAllergy(await as(EMAIL.frontDesk), elena, { allergen: "Latex", severity: "MILD" }).catch((e) => expect(e).toBeInstanceOf(AuditedDenial));
    await addAllergy(thorne, elena, { allergen: "Latex", reaction: "Itching", severity: "MILD" });
    const chart = await getChart(thorne, elena);
    expect(chart?.diagnoses?.map((d) => d.icd10Code)).toContain("F51.01");
    expect(chart?.allergies?.map((a) => a.allergen).sort()).toEqual(["Latex", "Penicillin"]);
  });
});
