import { describe, expect, it } from "vitest";
import { buildApprovalPlan, manifestSha256, normalizeApprovalManifest } from "@/lib/content-approvals.mjs";

const hashA = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const hashB = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function validManifest() {
  return {
    batch_id: "review-2026-08-26-001",
    approval_record: {
      release_owner_role: "Content release owner",
      approved_at: "2026-08-26T20:00:00-04:00",
      legal_approval_record_id: null,
    },
    questions: [{
      qid: 12345,
      expected: { distribution_rights_status: "unverified", editorial_status: "pending" },
      rights: {
        status: "original",
        note: "Original work record reviewed.",
        content_author: "Original author",
        license_or_permission: "Company-owned original work",
        permission_evidence_uri: "vault://rights/question-12345",
        reviewed_at: "2026-08-26",
        reviewer_role: "Rights reviewer",
        transformations: [{ date: "2026-08-26", responsible_role: "Content editor", action: "Recorded final artifact.", artifact_hash: hashA }],
      },
      editorial: {
        status: "reviewed",
        last_reviewed_at: "2026-08-26",
        reviewer_role: "Canadian-licensed physician",
        references_text: "Canadian clinical guideline",
        reference_exception: null,
      },
    }],
    images: [{
      qid: 12345,
      image_index: 0,
      expected: { distribution_rights_status: "unverified" },
      rights: {
        status: "licensed",
        note: "Written image license reviewed.",
        content_author: "Image author",
        license_or_permission: "Paid digital distribution license",
        permission_evidence_uri: "vault://rights/question-12345-image-0",
        reviewed_at: "2026-08-26",
        reviewer_role: "Rights reviewer",
        transformations: [{ date: "2026-08-26", responsible_role: "Image editor", action: "Recorded final artifact.", artifact_hash: hashB }],
      },
    }],
  };
}

const currentQuestion = {
  qid: 12345,
  source: "canadaqbank",
  distribution_rights_status: "unverified",
  distribution_rights_note: null,
  content_author: null,
  license_or_permission: null,
  permission_evidence_uri: null,
  transformation_history: [],
  provenance_reviewed_at: null,
  provenance_reviewer_role: null,
  editorial_status: "pending",
  last_reviewed_at: null,
  reviewer_role: null,
  references_text: null,
  reference_exception: null,
  needs_review: true,
};

const currentImage = {
  qid: 12345,
  image_index: 0,
  distribution_rights_status: "unverified",
  distribution_rights_note: null,
  content_author: null,
  license_or_permission: null,
  permission_evidence_uri: null,
  transformation_history: [],
  provenance_reviewed_at: null,
  provenance_reviewer_role: null,
};

describe("content approval manifests", () => {
  it("normalizes a complete batch and plans an eligible question with its approved image", () => {
    const manifest = normalizeApprovalManifest(validManifest());
    const plan = buildApprovalPlan(manifest, [currentQuestion], [currentImage]);
    expect(plan.summary).toEqual({
      questions: 1,
      images: 1,
      rightsApprovedQuestions: 1,
      editoriallyReviewedQuestions: 1,
      rightsApprovedImages: 1,
      publiclyEligibleQuestions: 1,
    });
    expect(plan.questionPatches[0].transformation_history).toHaveLength(1);
    expect(plan.imagePatches[0].transformation_history).toHaveLength(1);
    expect(manifestSha256(manifest)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects approved rights without protected evidence metadata", () => {
    const input = validManifest();
    delete (input.questions[0].rights as { permission_evidence_uri?: string }).permission_evidence_uri;
    expect(() => normalizeApprovalManifest(input)).toThrow(/permission_evidence_uri is required/);
  });

  it("rejects impossible calendar dates", () => {
    const input = validManifest();
    input.questions[0].rights.reviewed_at = "2026-02-31";
    expect(() => normalizeApprovalManifest(input)).toThrow(/valid YYYY-MM-DD date/);
  });

  it("rejects duplicate targets before any database lookup", () => {
    const input = validManifest();
    input.questions.push(structuredClone(input.questions[0]));
    expect(() => normalizeApprovalManifest(input)).toThrow(/duplicate targets/);
  });

  it("rejects a reviewed question without a reference or documented exception", () => {
    const input = validManifest();
    (input.questions[0].editorial as { references_text: string | null }).references_text = null;
    const manifest = normalizeApprovalManifest(input);
    expect(() => buildApprovalPlan(manifest, [currentQuestion], [currentImage])).toThrow(/approved reference or documented exception/);
  });

  it("rejects public eligibility while any attached image remains unapproved", () => {
    const input = validManifest();
    input.images = [];
    const manifest = normalizeApprovalManifest(input);
    expect(() => buildApprovalPlan(manifest, [currentQuestion], [currentImage])).toThrow(/image without approved rights/);
  });

  it("rejects a manifest prepared against stale database state", () => {
    const manifest = normalizeApprovalManifest(validManifest());
    expect(() => buildApprovalPlan(manifest, [{ ...currentQuestion, editorial_status: "stale" }], [currentImage])).toThrow(/changed after the manifest was prepared/);
  });

  it("rejects image approval for personal content", () => {
    const input = validManifest();
    input.questions = [];
    const manifest = normalizeApprovalManifest(input);
    expect(() => buildApprovalPlan(manifest, [{ ...currentQuestion, source: "user" }], [currentImage])).toThrow(/not attached to bank content/);
  });
});
