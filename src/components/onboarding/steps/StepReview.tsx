"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  AlertTriangle,
  Building2,
  FileText,
  Landmark,
  ShieldCheck,
} from "lucide-react";
import { useOnboardingStore } from "@/store/onboardingStore";
import { createClient } from "@/lib/supabase/client";

function ReviewCard({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-[#E3E8EF] bg-white shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-[#E3E8EF] px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            {icon ? <span className="text-[#1F5C8F]">{icon}</span> : null}
            <h3 className="text-lg font-semibold text-[#173F63]">{title}</h3>
          </div>
          {subtitle ? (
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          ) : null}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#E3E8EF] bg-[#FAFBFC] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-slate-800">{value || "—"}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string | undefined }) {
  const safeStatus = (status || "not_generated").toLowerCase();

  const map: Record<string, string> = {
    not_generated: "bg-slate-100 text-slate-700 border-slate-200",
    draft_ready: "bg-slate-100 text-slate-700 border-slate-200",
    sent_for_signature: "bg-indigo-100 text-indigo-700 border-indigo-200",
    viewed: "bg-amber-100 text-amber-700 border-amber-200",
    partially_signed: "bg-blue-100 text-blue-700 border-blue-200",
    completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
    failed: "bg-red-100 text-red-700 border-red-200",
    expired: "bg-orange-100 text-orange-700 border-orange-200",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${map[safeStatus] || map.not_generated
        }`}
    >
      {safeStatus.replaceAll("_", " ")}
    </span>
  );
}

type UploadItemLike = {
  file?: File | null;
  uploadedUrl?: string | null;
  storagePath?: string | null;
  bucketName?: string | null;
} | null | undefined;

type DealerDocumentPayload = {
  documentType: string;
  bucketName: string;
  storagePath: string;
  fileName: string;
  fileUrl: string | null;
  mimeType: string | null;
  fileSize: number | null;
};

function buildDocument(
  documentType: string,
  item: UploadItemLike
): DealerDocumentPayload | null {
  if (!item?.file || !item?.storagePath) {
    return null;
  }

  return {
    documentType,
    bucketName: item.bucketName || "dealer-documents",
    storagePath: item.storagePath,
    fileName: item.file.name,
    fileUrl: item.uploadedUrl || null,
    mimeType: item.file.type || null,
    fileSize: typeof item.file.size === "number" ? item.file.size : null,
  };
}

function getPrimaryContact(state: ReturnType<typeof useOnboardingStore.getState>) {
  const companyType = state.company?.companyType;

  if (companyType === "sole_proprietorship") {
    return {
      ownerName: state.ownership?.ownerName || "",
      ownerPhone: state.ownership?.ownerPhone || "",
      ownerEmail: state.ownership?.ownerEmail || "",
    };
  }

  if (companyType === "partnership_firm") {
    const firstPartner = state.ownership?.partners?.[0];
    return {
      ownerName: firstPartner?.name || "",
      ownerPhone: firstPartner?.phone || "",
      ownerEmail: firstPartner?.email || "",
    };
  }

  if (companyType === "private_limited_firm") {
    const firstDirector = state.ownership?.directors?.[0];
    return {
      ownerName: firstDirector?.name || "",
      ownerPhone: firstDirector?.phone || "",
      ownerEmail: firstDirector?.email || "",
    };
  }

  return {
    ownerName: state.ownership?.ownerName || "",
    ownerPhone: state.ownership?.ownerPhone || "",
    ownerEmail: state.ownership?.ownerEmail || "",
  };
}

export default function StepReview() {
  const router = useRouter();
  const supabase = createClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const state = useOnboardingStore();
  const prevStep = useOnboardingStore((s) => s.prevStep);
  const setField = useOnboardingStore((s) => s.setField);
  const errors = useOnboardingStore((s) => s.errors);
  const setErrors = useOnboardingStore((s) => s.setErrors);
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);

  const primaryContact = getPrimaryContact(state);

  const agreementRequired = state.finance?.enableFinance === "yes";
  const agreementAlreadyCompleted =
    !agreementRequired || state.agreement?.agreementStatus === "completed";
  const signerFlow = useMemo(
    () => [
      {
        order: 1,
        title: "Dealer Signatory",
        name: state.agreement?.dealerSignerName || "Pending",
      },
      {
        order: 2,
        title: "Financier Signatory",
        name: state.agreement?.financierSignatory?.name || "Pending",
      },
      {
        order: 3,
        title: "iTarang Signatory 1",
        name: state.agreement?.itarangSignatory1?.name || "Pending",
      },
      {
        order: 4,
        title: "iTarang Signatory 2",
        name: state.agreement?.itarangSignatory2?.name || "Pending",
      },
    ],
    [state.agreement]
  );

  const handleSubmitApplication = async () => {
    const submitErrors: Record<string, string> = {};

    if (!state.reviewChecks.confirmInfo) {
      submitErrors.confirmInfo = "Please confirm all information is correct";
    }

    if (!state.reviewChecks.confirmDocs) {
      submitErrors.confirmDocs = "Please confirm uploaded documents are valid";
    }

    if (!state.reviewChecks.agreeTerms) {
      submitErrors.agreeTerms =
        "Please agree to iTarang onboarding and dealer terms";
    }

    const documents = [
      buildDocument("itr_3_years", state.compliance?.itr3Years),
      buildDocument(
        "bank_statement_3_months",
        state.compliance?.bankStatement3Months
      ),
      buildDocument("undated_cheques", state.compliance?.undatedCheques),
      buildDocument("passport_photo", state.compliance?.passportPhoto),
      buildDocument("udyam_certificate", state.compliance?.udyamCertificate),
      buildDocument("gst_certificate", state.company?.gstCertificate),
      buildDocument("pan_card", state.company?.companyPanFile),
    ].filter((doc): doc is DealerDocumentPayload => doc !== null);

    if (documents.length === 0) {
      submitErrors.documents =
        "Please upload at least one valid document before submitting";
    }

    if (!primaryContact.ownerName) {
      submitErrors.ownerName =
        "Primary contact name is required before submission";
    }

    if (!primaryContact.ownerPhone) {
      submitErrors.ownerPhone =
        "Primary contact phone is required before submission";
    }

    if (!primaryContact.ownerEmail) {
      submitErrors.ownerEmail =
        "Primary contact email is required before submission";
    }

    if (Object.keys(submitErrors).length > 0) {
      setErrors(submitErrors);
      return;
    }

    try {
      setIsSubmitting(true);

      const payload = {
        // dealerUserId: state.dealerId || null,
        companyName: state.company?.companyName || "",
        companyType: state.company?.companyType || "",
        gstNumber: state.company?.gstNumber || "",
        panNumber: state.company?.companyPanNumber || "",
        businessAddress: {
          address: state.company?.companyAddress || "",
        },
        registeredAddress: {
          address: state.company?.companyAddress || "",
        },
        financeEnabled: state.finance?.enableFinance === "yes",
        onboardingStatus: "submitted",
        reviewStatus: "pending_admin_review",

        ownerName: primaryContact.ownerName,
        ownerPhone: primaryContact.ownerPhone,
        ownerEmail: primaryContact.ownerEmail,

        bankName: state.ownership?.bankName || "",
        accountNumber: state.ownership?.accountNumber || "",
        beneficiaryName: state.ownership?.beneficiaryName || "",
        ifscCode: state.ownership?.ifsc || "",
        documents,

        agreement: agreementRequired
          ? {
            provider: state.agreement?.provider || "Digio",
            agreementName: state.agreement?.agreementName || "",
            agreementVersion: state.agreement?.agreementVersion || "",
            agreementStatus: state.agreement?.agreementStatus || "not_generated", requestId: state.agreement?.requestId || "",
            providerDocumentId: state.agreement?.providerDocumentId || "",
            providerSigningUrl: state.agreement?.providerSigningUrl || "",
            generatedDate: state.agreement?.generatedDate || "",
            signedAt: state.agreement?.signedAt || "",
            completionStatus: state.agreement?.completionStatus || "",
            stampStatus: state.agreement?.stampStatus || "",
            dateOfSigning: state.agreement?.dateOfSigning || "",
            mouDate: state.agreement?.mouDate || "",
            financierName: state.agreement?.financierName || "",
            isOemFinancing: !!state.agreement?.isOemFinancing,
            vehicleType: state.agreement?.vehicleType || "",
            manufacturer: state.agreement?.manufacturer || "",
            brand: state.agreement?.brand || "",
            statePresence: state.agreement?.statePresence || "",
            dealerSignerName: state.agreement?.dealerSignerName || "",
            dealerSignerDesignation:
              state.agreement?.dealerSignerDesignation || "",
            dealerSignerEmail: state.agreement?.dealerSignerEmail || "",
            dealerSignerPhone: state.agreement?.dealerSignerPhone || "",
            dealerSigningMethod: state.agreement?.dealerSigningMethod || "",
            financierSignatory: state.agreement?.financierSignatory || null,
            itarangSignatory1: state.agreement?.itarangSignatory1 || null,
            itarangSignatory2: state.agreement?.itarangSignatory2 || null,
            signingOrder: state.agreement?.signingOrder || [
              "dealer",
              "financier",
              "itarang_1",
              "itarang_2",
            ],
          }
          : null,
      };

      console.log("FINAL SUBMIT PAYLOAD", payload);

      const response = await fetch("/api/dealer-onboarding/save", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        setErrors({
          api: result.message || "Failed to submit dealer onboarding application",
        });
        return;
      }

      const generatedDealerId = completeOnboarding();

      console.log("Dealer onboarding saved in DB:", result.application);
      console.log("Dealer onboarding completed with ID:", generatedDealerId);

      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();

      return;
    } catch (error) {
      console.error("Dealer onboarding submission error:", error);
      setErrors({
        api:
          error instanceof Error
            ? error.message
            : "Something went wrong while submitting",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-[#E3E8EF] bg-gradient-to-br from-white to-[#F7FAFD] p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-[#1F5C8F]">
              Final Review
            </p>
            <h2 className="mt-2 text-2xl font-bold text-[#173F63] md:text-3xl">
              Review Dealer Application
            </h2>
            <p className="mt-2 text-sm text-slate-500 md:text-base">
              Review company, documents, finance enablement, and agreement
              details before final submission to admin.
            </p>
          </div>

          <div className="rounded-2xl border border-[#E3E8EF] bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-800">
                Agreement Required:
              </span>{" "}
              {agreementRequired ? "Yes" : "No"}
            </p>
            <div className="mt-2">
              <StatusBadge
                status={
                  agreementRequired
                    ? state.agreement?.agreementStatus
                    : "completed"
                }
              />
            </div>
          </div>
        </div>
      </div>

      {agreementRequired && !agreementAlreadyCompleted && (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Agreement will be generated by the iTarang team after review.
              You will receive a notification once the agreement is ready for signing.
            </p>
          </div>
        </div>
      )}

      <ReviewCard
        title="Company Details"
        subtitle="Business identity and registration details"
        icon={<Building2 className="h-5 w-5" />}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <InfoRow label="Company Name" value={state.company?.companyName} />
          <InfoRow label="Company Type" value={state.company?.companyType} />
          <InfoRow label="GST Number" value={state.company?.gstNumber} />
          <InfoRow label="PAN Number" value={state.company?.companyPanNumber} />
          <div className="md:col-span-2">
            <InfoRow label="Address" value={state.company?.companyAddress} />
          </div>
        </div>
      </ReviewCard>

      <ReviewCard
        title="Primary Contact Details"
        subtitle="Main person mapped from ownership details"
        icon={<ShieldCheck className="h-5 w-5" />}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <InfoRow label="Name" value={primaryContact.ownerName} />
          <InfoRow label="Phone" value={primaryContact.ownerPhone} />
          <InfoRow label="Email" value={primaryContact.ownerEmail} />
        </div>
      </ReviewCard>

      <ReviewCard
        title="Compliance Documents"
        subtitle="Uploaded files available for admin verification"
        icon={<FileText className="h-5 w-5" />}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <InfoRow
            label="ITR"
            value={state.compliance?.itr3Years?.file?.name || "Not uploaded"}
          />
          <InfoRow
            label="Bank Statement"
            value={
              state.compliance?.bankStatement3Months?.file?.name ||
              "Not uploaded"
            }
          />
          <InfoRow
            label="Undated Cheques"
            value={
              state.compliance?.undatedCheques?.file?.name || "Not uploaded"
            }
          />
          <InfoRow
            label="Passport Photo"
            value={
              state.compliance?.passportPhoto?.file?.name || "Not uploaded"
            }
          />
          <InfoRow
            label="Udyam Certificate"
            value={
              state.compliance?.udyamCertificate?.file?.name || "Not uploaded"
            }
          />
          <InfoRow
            label="GST Certificate"
            value={state.company?.gstCertificate?.file?.name || "Not uploaded"}
          />
          <InfoRow
            label="Company PAN File"
            value={state.company?.companyPanFile?.file?.name || "Not uploaded"}
          />
        </div>
      </ReviewCard>

      <ReviewCard
        title="Ownership & Banking"
        subtitle="Bank account and beneficiary details"
        icon={<Landmark className="h-5 w-5" />}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <InfoRow label="Bank Name" value={state.ownership?.bankName} />
          <InfoRow
            label="Account Number"
            value={state.ownership?.accountNumber}
          />
          <InfoRow label="IFSC" value={state.ownership?.ifsc} />
          <InfoRow
            label="Beneficiary Name"
            value={state.ownership?.beneficiaryName}
          />
        </div>
      </ReviewCard>

      <ReviewCard
        title="Finance Enablement"
        subtitle="Final finance selection from Step 4"
        icon={<CheckCircle2 className="h-5 w-5" />}
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <InfoRow
            label="Finance Enabled"
            value={state.finance?.enableFinance === "yes" ? "Yes" : "No"}
          />
          <InfoRow
            label="Finance Contact Person"
            value={state.finance?.financeContactPerson || "—"}
          />
          <InfoRow
            label="Finance Contact Phone"
            value={state.finance?.financeContactPhone || "—"}
          />
          <InfoRow
            label="Finance Contact Email"
            value={state.finance?.financeContactEmail || "—"}
          />
        </div>
      </ReviewCard>

      {agreementRequired && (
        <>
          <ReviewCard
            title="Agreement Summary"
            subtitle="Digio-managed agreement details collected in Step 5"
            icon={<FileText className="h-5 w-5" />}
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <InfoRow
                label="Agreement Name"
                value={state.agreement?.agreementName}
              />
              <InfoRow
                label="Provider"
                value={state.agreement?.provider || "Digio"}
              />
              <InfoRow
                label="Agreement Status"
                value={
                  <StatusBadge status={state.agreement?.agreementStatus} />
                }
              />
              <InfoRow
                label="Completion Status"
                value={state.agreement?.completionStatus || "Pending"}
              />
              <InfoRow
                label="Date Of Signing"
                value={state.agreement?.dateOfSigning}
              />
              <InfoRow label="MoU Date" value={state.agreement?.mouDate} />
              <InfoRow
                label="Financier Name"
                value={state.agreement?.financierName}
              />
              <InfoRow
                label="Stamp Status"
                value={state.agreement?.stampStatus || "Pending"}
              />
              <InfoRow
                label="Request ID"
                value={state.agreement?.requestId || "Pending"}
              />
              <InfoRow
                label="Provider Document ID"
                value={state.agreement?.providerDocumentId || "Pending"}
              />
            </div>
          </ReviewCard>

          <ReviewCard
            title="Signer Details"
            subtitle="Participants involved in sequential signing"
            icon={<ShieldCheck className="h-5 w-5" />}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-[#E3E8EF] bg-[#FAFBFC] p-4">
                <h4 className="text-sm font-semibold text-[#173F63]">
                  Dealer Signatory
                </h4>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <p>Name: {state.agreement?.dealerSignerName || "—"}</p>
                  <p>
                    Designation: {state.agreement?.dealerSignerDesignation || "—"}
                  </p>
                  <p>Email: {state.agreement?.dealerSignerEmail || "—"}</p>
                  <p>Phone: {state.agreement?.dealerSignerPhone || "—"}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-[#E3E8EF] bg-[#FAFBFC] p-4">
                <h4 className="text-sm font-semibold text-[#173F63]">
                  Financier Signatory
                </h4>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <p>Name: {state.agreement?.financierSignatory?.name || "—"}</p>
                  <p>
                    Designation:{" "}
                    {state.agreement?.financierSignatory?.designation || "—"}
                  </p>
                  <p>Email: {state.agreement?.financierSignatory?.email || "—"}</p>
                  <p>
                    Phone: {state.agreement?.financierSignatory?.mobile || "—"}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-[#E3E8EF] bg-[#FAFBFC] p-4">
                <h4 className="text-sm font-semibold text-[#173F63]">
                  iTarang Signatory 1
                </h4>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <p>Name: {state.agreement?.itarangSignatory1?.name || "—"}</p>
                  <p>
                    Designation:{" "}
                    {state.agreement?.itarangSignatory1?.designation || "—"}
                  </p>
                  <p>Email: {state.agreement?.itarangSignatory1?.email || "—"}</p>
                  <p>
                    Phone: {state.agreement?.itarangSignatory1?.mobile || "—"}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-[#E3E8EF] bg-[#FAFBFC] p-4">
                <h4 className="text-sm font-semibold text-[#173F63]">
                  iTarang Signatory 2
                </h4>
                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <p>Name: {state.agreement?.itarangSignatory2?.name || "—"}</p>
                  <p>
                    Designation:{" "}
                    {state.agreement?.itarangSignatory2?.designation || "—"}
                  </p>
                  <p>Email: {state.agreement?.itarangSignatory2?.email || "—"}</p>
                  <p>
                    Phone: {state.agreement?.itarangSignatory2?.mobile || "—"}
                  </p>
                </div>
              </div>
            </div>
          </ReviewCard>

          <ReviewCard
            title="Signing Order"
            subtitle="Fixed sequential order used for Digio workflow"
            icon={<CheckCircle2 className="h-5 w-5" />}
          >
            <div className="space-y-3">
              {signerFlow.map((item) => (
                <div
                  key={item.order}
                  className="flex items-center justify-between rounded-2xl border border-[#E3E8EF] bg-[#FAFBFC] px-4 py-3"
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Step {item.order}
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-800">
                      {item.title}
                    </p>
                  </div>
                  <p className="text-sm text-slate-600">{item.name}</p>
                </div>
              ))}
            </div>
          </ReviewCard>

          <ReviewCard
            title="OEM Financing"
            subtitle="Shown only when OEM financing is enabled"
            icon={<Building2 className="h-5 w-5" />}
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <InfoRow
                label="OEM Financing"
                value={state.agreement?.isOemFinancing ? "Yes" : "No"}
              />
              <InfoRow
                label="Vehicle Type"
                value={state.agreement?.vehicleType || "—"}
              />
              <InfoRow
                label="Manufacturer"
                value={state.agreement?.manufacturer || "—"}
              />
              <InfoRow label="Brand" value={state.agreement?.brand || "—"} />
              <InfoRow
                label="State Presence"
                value={state.agreement?.statePresence || "—"}
              />
            </div>
          </ReviewCard>
        </>
      )}

      <div className="rounded-3xl border border-[#E3E8EF] bg-white p-6 shadow-sm space-y-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={state.reviewChecks.confirmInfo}
            onChange={(e) =>
              setField("reviewChecks", "confirmInfo", e.target.checked)
            }
            className="mt-1"
          />
          <span>I confirm all information submitted is correct</span>
        </label>
        {errors.confirmInfo && (
          <p className="text-sm text-red-600">{errors.confirmInfo}</p>
        )}

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={state.reviewChecks.confirmDocs}
            onChange={(e) =>
              setField("reviewChecks", "confirmDocs", e.target.checked)
            }
            className="mt-1"
          />
          <span>I confirm the uploaded documents are valid</span>
        </label>
        {errors.confirmDocs && (
          <p className="text-sm text-red-600">{errors.confirmDocs}</p>
        )}

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={state.reviewChecks.agreeTerms}
            onChange={(e) =>
              setField("reviewChecks", "agreeTerms", e.target.checked)
            }
            className="mt-1"
          />
          <span>I agree to iTarang onboarding and dealer terms</span>
        </label>
        {errors.agreeTerms && (
          <p className="text-sm text-red-600">{errors.agreeTerms}</p>
        )}

        {errors.agreementStatus && (
          <p className="text-sm text-red-600">{errors.agreementStatus}</p>
        )}

        {errors.documents && (
          <p className="text-sm text-red-600">{errors.documents}</p>
        )}

        {errors.ownerName && (
          <p className="text-sm text-red-600">{errors.ownerName}</p>
        )}

        {errors.ownerPhone && (
          <p className="text-sm text-red-600">{errors.ownerPhone}</p>
        )}

        {errors.ownerEmail && (
          <p className="text-sm text-red-600">{errors.ownerEmail}</p>
        )}

        {errors.api && <p className="text-sm text-red-600">{errors.api}</p>}

        {Object.entries(errors)
          .filter(
            ([key]) =>
              ![
                "confirmInfo",
                "confirmDocs",
                "agreeTerms",
                "agreementStatus",
                "documents",
                "ownerName",
                "ownerPhone",
                "ownerEmail",
                "api",
              ].includes(key)
          )
          .map(([key, error]) => (
            <p key={key} className="text-sm text-red-600">
              {error}
            </p>
          ))}
      </div>

      <div className="flex justify-between">
        <button
          type="button"
          onClick={prevStep}
          disabled={isSubmitting}
          className="rounded-2xl border border-[#E3E8EF] px-6 py-3 font-semibold text-slate-700 disabled:opacity-50"
        >
          ← Back
        </button>

        <button
          type="button"
          onClick={handleSubmitApplication}
          disabled={isSubmitting}
          className="rounded-2xl bg-[#1F5C8F] px-6 py-3 font-semibold text-white hover:bg-[#173F63] disabled:opacity-50"
        >
          {isSubmitting ? "Submitting..." : "Submit for Admin Review"}
        </button>
      </div>
    </div>
  );
}