"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  FileCheck2,
  ShieldCheck,
  Landmark,
  CircleAlert,
  CheckCircle2,
  XCircle,
  Clock3,
  Download,
  ExternalLink,
  RefreshCw,
  FileSignature,
  FileText,
} from "lucide-react";

type DocumentItem = {
  id?: string;
  name: string;
  url?: string | null;
  status?: string;
  documentType?: string;
  verificationStatus?: string | null;
  docStatus?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  uploadedAt?: string | null;
  rejectionReason?: string | null;
  storagePath?: string | null;
  bucketName?: string | null;
};

type AgreementParty = {
  name?: string | null;
  designation?: string | null;
  email?: string | null;
  mobile?: string | null;
  address?: string | null;
  signingMethod?: string | null;
};

type AgreementData = {
  agreementId?: string | null;
  signerName?: string | null;
  signerEmail?: string | null;
  status?: string | null;
  copyUrl?: string | null;
  signedAgreementUrl?: string | null;

  agreementName?: string | null;
  agreementVersion?: string | null;
  dateOfSigning?: string | null;
  mouDate?: string | null;
  financierName?: string | null;

  dealerSignerName?: string | null;
  dealerSignerDesignation?: string | null;
  dealerSignerEmail?: string | null;
  dealerSignerPhone?: string | null;
  dealerSigningMethod?: string | null;

  financierSignatory?: AgreementParty | null;
  itarangSignatory1?: AgreementParty | null;
  itarangSignatory2?: AgreementParty | null;

  signingOrder?: string[] | null;
  isOemFinancing?: boolean;
  vehicleType?: string | null;
  manufacturer?: string | null;
  brand?: string | null;
  statePresence?: string | null;
};

type DealerReviewData = {
  id: string;
  dealerId: string;
  companyName?: string;
  companyAddress?: string;
  gstNumber?: string;
  panNumber?: string;
  cinNumber?: string;
  companyType?: string;
  ownerName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
  bankName?: string;
  accountNumber?: string;
  beneficiaryName?: string;
  ifscCode?: string;
  financeEnabled?: boolean;
  onboardingStatus?: string;
  reviewStatus?: string;
  submittedAt?: string | null;
  correctionRemarks?: string | null;
  rejectionRemarks?: string | null;
  documents?: DocumentItem[];
  agreement?: AgreementData | null;
};

type AgreementSignerRow = {
  id: string;
  signerRole: string;
  signerName: string;
  signerEmail?: string | null;
  signerMobile?: string | null;
  signingMethod?: string | null;
  signerStatus: string;
  signedAt?: string | null;
  providerSigningUrl?: string | null;
};

type AgreementTimelineItem = {
  id: string;
  eventType: string;
  signerRole?: string | null;
  eventStatus?: string | null;
  createdAt?: string | null;
};

type AgreementTrackingResponse = {
  applicationId: string;
  agreementId?: string | null;
  requestId?: string | null;
  agreementStatus?: string | null;
  reviewStatus?: string | null;
  signedAgreementUrl?: string | null;
  auditTrailUrl?: string | null;
  completionStatus?: string | null;
  stampStatus?: string | null;
  failureReason?: string | null;
  lastActionTimestamp?: string | null;
  canReInitiate?: boolean;
  signers: AgreementSignerRow[];
  timeline: AgreementTimelineItem[];
};

function SectionCard({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26 }}
      className="rounded-[28px] border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex items-start gap-4 border-b border-slate-200 px-6 py-5">
        <div className="rounded-2xl bg-slate-50 p-3 text-slate-700">{icon}</div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      <div className="p-6">{children}</div>
    </motion.section>
  );
}

function InfoField({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-medium text-slate-900">
        {value && String(value).trim() ? value : "Not available"}
      </p>
    </div>
  );
}

function StatusBadge({ value }: { value?: string | null }) {
  const status = (value || "").toLowerCase();

  const classes =
    status === "completed" || status === "approved" || status === "succeed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "submitted" ||
        status === "pending_admin_review" ||
        status === "pending_sales_head"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : status === "under_review"
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : status === "under_correction" ||
            status === "correction_requested" ||
            status === "action_needed"
            ? "border-orange-200 bg-orange-50 text-orange-700"
            : status === "rejected"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold capitalize ${classes}`}
    >
      {(value || "Unknown").replaceAll("_", " ")}
    </span>
  );
}

function AgreementBadge({ value }: { value?: string | null }) {
  const status = (value || "").toLowerCase();

  const classes =
    status === "completed" || status === "signed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "pending"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : status === "failed" || status === "expired"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : status === "viewed" ||
            status === "sign_pending" ||
            status === "sent_for_signature" ||
            status === "sent_to_external_party"
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : status === "partially_signed"
              ? "border-indigo-200 bg-indigo-50 text-indigo-700"
              : status === "not available" || status === ""
                ? "border-slate-200 bg-slate-50 text-slate-700"
                : "border-indigo-200 bg-indigo-50 text-indigo-700";

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold capitalize ${classes}`}
    >
      {(value || "Not available").replaceAll("_", " ")}
    </span>
  );
}

function SignerStatusBadge({ value }: { value?: string | null }) {
  const status = (value || "").toLowerCase();

  const classes =
    status === "signed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "viewed"
        ? "border-indigo-200 bg-indigo-50 text-indigo-700"
        : status === "sent"
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : status === "failed"
            ? "border-rose-200 bg-rose-50 text-rose-700"
            : status === "expired"
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold capitalize ${classes}`}
    >
      {(value || "pending").replaceAll("_", " ")}
    </span>
  );
}

function ActionCard({
  remarks,
  setRemarks,
  submitting,
  onApprove,
  onCorrection,
  onReject,
  onBack,
  financeEnabled,
  agreementStatus,
}: {
  remarks: string;
  setRemarks: (value: string) => void;
  submitting: boolean;
  onApprove: () => void;
  onCorrection: () => void;
  onReject: () => void;
  onBack: () => void;
  financeEnabled?: boolean;
  agreementStatus?: string | null;
}) {
  const approvalBlocked =
    !!financeEnabled && (agreementStatus || "").toLowerCase() !== "completed";

  return (
    <motion.aside
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.28 }}
      className="sticky top-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-slate-50 p-3 text-slate-700">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Review Action</h3>
          <p className="mt-1 text-sm text-slate-500">
            Approve, request corrections, or reject the application.
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-start gap-3">
          <CircleAlert className="mt-0.5 h-4 w-4 text-slate-500" />
          <p className="text-sm text-slate-600">
            Add clear review notes for corrections or rejection so the sales team can act quickly.
          </p>
        </div>
      </div>

      {approvalBlocked && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <Clock3 className="mt-0.5 h-4 w-4 text-amber-600" />
            <p className="text-sm text-amber-800">
              Approval is blocked until the finance agreement reaches completed status.
            </p>
          </div>
        </div>
      )}

      <textarea
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
        placeholder="Write correction notes or rejection reason..."
        className="mt-5 min-h-[160px] w-full rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-900 outline-none transition focus:border-blue-400"
      />

      <div className="mt-5 grid grid-cols-1 gap-3">
        <button
          onClick={onApprove}
          disabled={submitting || approvalBlocked}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CheckCircle2 className="h-4 w-4" />
          Approve & Activate
        </button>

        <button
          onClick={onCorrection}
          disabled={submitting || !remarks.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Clock3 className="h-4 w-4" />
          Request Correction
        </button>

        <button
          onClick={onReject}
          disabled={submitting || !remarks.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <XCircle className="h-4 w-4" />
          Reject Application
        </button>

        <button
          onClick={onBack}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Queue
        </button>
      </div>
    </motion.aside>
  );
}

export default function DealerReviewPage() {
  const params = useParams();
  const router = useRouter();
  const dealerId = params?.dealerId as string;

  const [data, setData] = useState<DealerReviewData | null>(null);
  const [remarks, setRemarks] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [agreementActionLoading, setAgreementActionLoading] = useState<
    "initiate" | "refresh" | "reinitiate" | "retry" | null
  >(null);
  const [tracking, setTracking] = useState<AgreementTrackingResponse | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [auditTrailLoading, setAuditTrailLoading] = useState(false);

  const DIGIO_DASHBOARD_URL = "https://ext-enterprise.digio.in/digidocs/dashboard";

  const loadAgreementTracking = async () => {
    try {
      setTrackingLoading(true);

      const res = await fetch(
        `/api/admin/dealer-verifications/${dealerId}/agreement-tracking`,
        {
          cache: "no-store",
        }
      );

      const json = await res.json();

      if (json.success) {
        setTracking(json.data);
      } else {
        setTracking(null);
      }
    } catch (error) {
      console.error("Failed to load agreement tracking", error);
      setTracking(null);
    } finally {
      setTrackingLoading(false);
    }
  };

  useEffect(() => {
    const loadDealer = async () => {
      try {
        const res = await fetch(`/api/admin/dealer-verifications/${dealerId}`);
        const json = await res.json();

        if (json.success) {
          setData(json.data);
        } else {
          setData(null);
        }

        await loadAgreementTracking();
      } catch (error) {
        console.error("Failed to load dealer review data", error);
        setData(null);
        setTracking(null);
      } finally {
        setLoading(false);
      }
    };

    if (dealerId) {
      loadDealer();
    }
  }, [dealerId]);

  const documentCountLabel = useMemo(() => {
    const count = data?.documents?.length || 0;
    return count > 0 ? `${count} uploaded` : "No documents uploaded";
  }, [data?.documents]);

  const agreementStatusForUi = tracking?.agreementStatus || data?.agreement?.status || null;

  const normalizedAgreementStatus = (agreementStatusForUi || "").toLowerCase();

  const hasInitiatedAgreement =
    !!(
      tracking?.requestId ||
      tracking?.agreementId ||
      normalizedAgreementStatus === "sent_for_signature" ||
      normalizedAgreementStatus === "sent_to_external_party" ||
      normalizedAgreementStatus === "sign_pending" ||
      normalizedAgreementStatus === "viewed" ||
      normalizedAgreementStatus === "partially_signed" ||
      normalizedAgreementStatus === "signed" ||
      normalizedAgreementStatus === "completed"
    );

  const isAgreementCompleted = normalizedAgreementStatus === "completed";

  const verificationChecklist = useMemo(() => {
    const companyReady = !!(
      data?.companyName &&
      data?.gstNumber &&
      data?.panNumber &&
      data?.companyType
    );

    const documentsReady = (data?.documents?.length || 0) > 0;

    const bankReady = !!(
      data?.bankName &&
      data?.accountNumber &&
      data?.beneficiaryName &&
      data?.ifscCode
    );

    const agreementReady = data?.financeEnabled
      ? (agreementStatusForUi || "").toLowerCase() === "completed"
      : true;

    return {
      companyReady,
      documentsReady,
      bankReady,
      agreementReady,
    };
  }, [data, agreementStatusForUi]);

  const signedAgreementReady =
    ["signed", "completed"].includes(
      (agreementStatusForUi || "").toLowerCase()
    );
  const isRejected = (data?.onboardingStatus || "").toLowerCase() === "rejected";

  const signedAgreementDownloadUrl =
    tracking?.signedAgreementUrl ||
    data?.agreement?.signedAgreementUrl ||
    `/api/admin/dealer-verifications/${dealerId}/download-signed-agreement`;

  const reloadDealer = async () => {
    try {
      const [dealerRes, trackingRes] = await Promise.all([
        fetch(`/api/admin/dealer-verifications/${dealerId}`, {
          cache: "no-store",
        }),
        fetch(`/api/admin/dealer-verifications/${dealerId}/agreement-tracking`, {
          cache: "no-store",
        }),
      ]);

      const dealerJson = await dealerRes.json();
      const trackingJson = await trackingRes.json();

      if (dealerJson.success) {
        setData(dealerJson.data);
      }

      if (trackingJson.success) {
        setTracking(trackingJson.data);
      }
    } catch (error) {
      console.error("Failed to refresh dealer review data", error);
    }
  };

  const handleAuditTrailDownload = async () => {
    try {
      if (!hasInitiatedAgreement) {
        alert("Agreement has not been initiated yet.");
        return;
      }

      if (!isAgreementCompleted) {
        alert("Audit trail available only after agreement completion.");
        return;
      }

      window.open(
        `/api/admin/dealer-verifications/${dealerId}/audit-trail`,
        "_blank"
      );
    } catch (error) {
      console.error("Audit trail error:", error);
      alert("Failed to download audit trail");
    }
  };

  const handleAgreementAction = async (
    action: "initiate" | "refresh" | "reinitiate" | "retry"
  ) => {
    if (data?.onboardingStatus === "rejected") {
      alert("This application is rejected and locked.");
      return;
    }

    setAgreementActionLoading(action);

    try {
      const payload =
        action === "initiate" || action === "reinitiate"
          ? {
            agreementConfig: {
              agreementName:
                data?.agreement?.agreementName || "Dealer Finance Enablement Agreement",
              agreementVersion: "v1.0",
              dateOfSigning: data?.agreement?.dateOfSigning || "",
              mouDate: data?.agreement?.mouDate || "",
              financierName: data?.agreement?.financierName || "",

              dealerSignerName: data?.agreement?.dealerSignerName || "",
              dealerSignerDesignation:
                data?.agreement?.dealerSignerDesignation || "",
              dealerSignerEmail: data?.agreement?.dealerSignerEmail || "",
              dealerSignerPhone: data?.agreement?.dealerSignerPhone || "",
              dealerSigningMethod: data?.agreement?.dealerSigningMethod || "",

              financierSignatory: data?.agreement?.financierSignatory || null,
              itarangSignatory1: data?.agreement?.itarangSignatory1 || null,
              itarangSignatory2: data?.agreement?.itarangSignatory2 || null,

              signingOrder: ["dealer", "financier", "itarang_1", "itarang_2"],

              isOemFinancing: !!data?.agreement?.isOemFinancing,
              vehicleType: data?.agreement?.vehicleType || "",
              manufacturer: data?.agreement?.manufacturer || "",
              brand: data?.agreement?.brand || "",
              statePresence: data?.agreement?.statePresence || "",
            },
          }
          : {};

      const res = await fetch(
        `/api/admin/dealer-verifications/${dealerId}/${action}-agreement`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body:
            action === "initiate" || action === "reinitiate"
              ? JSON.stringify(payload)
              : JSON.stringify({}),
        }
      );

      let json: any = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }

      if (!res.ok || !json?.success) {
        alert(json?.message || "Agreement action failed");
        return;
      }

      await reloadDealer();
    } catch (error) {
      console.error(`Failed to ${action} agreement`, error);
      alert("Something went wrong while processing agreement action");
    } finally {
      setAgreementActionLoading(null);
    }
  };

  // const handleOpenAuditTrail = async () => {
  //   try {
  //     if (!hasInitiatedAgreement) {
  //       alert("Agreement has not been initiated yet. Please initiate agreement first.");
  //       return;
  //     }

  //     if (!isAgreementCompleted) {
  //       alert("Audit trail will be available only after all signers complete signing.");
  //       return;
  //     }

  //     setAuditTrailLoading(true);

  //     window.open(
  //       `/api/admin/dealer-verifications/${dealerId}/fetch-audit-trail?download=1`,
  //       "_blank",
  //       "noopener,noreferrer"
  //     );
  //   } catch (error) {
  //     console.error("Failed to open audit trail", error);
  //     alert("Audit trail is not available right now. Please check Digio dashboard.");
  //   } finally {
  //     setAuditTrailLoading(false);
  //   }
  // };

  const handleApprove = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/dealer-verifications/${dealerId}/approve`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.success) {
        router.push("/admin/dealer-verification");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCorrection = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/admin/dealer-verifications/${dealerId}/request-correction`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ remarks }),
        }
      );
      const json = await res.json();
      if (json.success) {
        router.push("/admin/dealer-verification");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/dealer-verifications/${dealerId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remarks }),
      });
      const json = await res.json();
      if (json.success) {
        router.push("/admin/dealer-verification");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
        Loading dealer review...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-6 text-sm text-rose-600 shadow-sm">
        Dealer review data not found.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
        className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-400">
              Dealer Review
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
              {data.companyName || "Dealer Application"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Validate company data, uploaded documents, and agreement workflow before final activation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge value={data.onboardingStatus} />
            <StatusBadge value={data.reviewStatus} />
            {data.financeEnabled ? <AgreementBadge value={agreementStatusForUi} /> : null}
          </div>
        </div>

        {data.onboardingStatus === "correction_requested" && (
          <div className="mt-6 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
            <div className="flex items-start gap-3">
              <CircleAlert className="mt-0.5 h-4 w-4" />
              <div>
                <p className="font-semibold">Correction Requested</p>
                <p className="mt-1">
                  Admin has requested corrections for this application. Update the required
                  details and save the form for re-validation.
                </p>
                {data?.correctionRemarks && (
                  <p className="mt-2 text-xs">
                    <strong>Remarks:</strong> {data.correctionRemarks}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {data.onboardingStatus === "rejected" && (
          <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            <div className="flex items-start gap-3">
              <XCircle className="mt-0.5 h-4 w-4" />
              <div>
                <p className="font-semibold">Application Rejected</p>
                <p className="mt-1">
                  This onboarding application has been rejected and is now locked.
                </p>
                {data?.rejectionRemarks && (
                  <p className="mt-2 text-xs">
                    <strong>Reason:</strong> {data.rejectionRemarks}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Submitted At
            </p>
            <p className="mt-2 text-sm font-medium text-slate-900">
              {data.submittedAt ? new Date(data.submittedAt).toLocaleString() : "Not available"}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Company Type
            </p>
            <p className="mt-2 text-sm font-medium capitalize text-slate-900">
              {(data.companyType || "Not available").replaceAll("_", " ")}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Document Status
            </p>
            <p className="mt-2 text-sm font-medium text-slate-900">{documentCountLabel}</p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Verification Progress
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-slate-700">
              {verificationChecklist.companyReady ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <Clock3 className="h-4 w-4 text-amber-500" />
              )}
              Company Details
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-slate-700">
              {verificationChecklist.documentsReady ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <Clock3 className="h-4 w-4 text-amber-500" />
              )}
              Documents Uploaded
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-slate-700">
              {verificationChecklist.bankReady ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <Clock3 className="h-4 w-4 text-amber-500" />
              )}
              Bank Details
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-medium text-slate-700">
              {verificationChecklist.agreementReady ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <Clock3 className="h-4 w-4 text-amber-500" />
              )}
              {data.financeEnabled ? "Agreement" : "No Finance Agreement"}
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <SectionCard
            title="Section 1 — Company Details"
            subtitle="Review legal entity details, registered identifiers, and payout information."
            icon={<Building2 className="h-5 w-5" />}
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <InfoField label="Company Name" value={data.companyName} />
              <InfoField label="Company Address" value={data.companyAddress} />
              <InfoField label="GST Number" value={data.gstNumber} />
              <InfoField label="PAN Number" value={data.panNumber} />
              <InfoField label="CIN Number" value={data.cinNumber} />
              <InfoField
                label="Company Type"
                value={data.companyType?.replaceAll("_", " ")}
              />
              <InfoField label="Primary Contact Name" value={data.ownerName} />
              <InfoField label="Primary Contact Phone" value={data.ownerPhone} />
              <InfoField label="Primary Contact Email" value={data.ownerEmail} />
              <InfoField label="Bank Name" value={data.bankName} />
              <InfoField label="Account Number" value={data.accountNumber} />
              <InfoField label="Beneficiary Name" value={data.beneficiaryName} />
              <InfoField label="IFSC Code" value={data.ifscCode} />
            </div>
          </SectionCard>

          <SectionCard
            title="Section 2 — Document Verification"
            subtitle="Validate uploaded onboarding and compliance records."
            icon={<FileCheck2 className="h-5 w-5" />}
          >
            {data.documents && data.documents.length > 0 ? (
              <div className="space-y-3">
                {data.documents.map((doc, index) => (
                  <motion.div
                    key={doc.id || `${doc.name}-${index}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, delay: index * 0.04 }}
                    className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{doc.name}</p>

                      <p className="mt-1 text-sm text-slate-500">
                        {(
                          doc.verificationStatus ||
                          doc.docStatus ||
                          doc.status ||
                          "Uploaded"
                        ).replaceAll("_", " ")}
                      </p>

                      {doc.documentType ? (
                        <p className="mt-1 text-xs text-slate-400">
                          Type: {doc.documentType.replaceAll("_", " ")}
                        </p>
                      ) : null}

                      {doc.rejectionReason ? (
                        <p className="mt-1 text-xs text-rose-500">
                          Reason: {doc.rejectionReason}
                        </p>
                      ) : null}
                    </div>

                    {doc.url ? (
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        <ExternalLink className="h-4 w-4" />
                        View Document
                      </a>
                    ) : (
                      <span className="text-sm text-slate-400">No link available</span>
                    )}
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                No uploaded documents available yet.
              </div>
            )}
          </SectionCard>

          {data.financeEnabled === true && (
            <SectionCard
              title="Section 3 — Agreement Verification"
              subtitle="Review agreement execution state for finance-enabled dealer onboarding."
              icon={<Landmark className="h-5 w-5" />}
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <InfoField
                  label="Agreement ID"
                  value={tracking?.agreementId || data.agreement?.agreementId || undefined}
                />
                <div className="rounded-2xl bg-slate-50 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Agreement Status
                  </p>
                  <div className="mt-2">
                    <AgreementBadge value={agreementStatusForUi || undefined} />
                  </div>
                </div>
                <InfoField
                  label="Primary Signer Name"
                  value={data.agreement?.signerName || data.agreement?.dealerSignerName || undefined}
                />
                <InfoField
                  label="Primary Signer Email"
                  value={data.agreement?.signerEmail || data.agreement?.dealerSignerEmail || undefined}
                />
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                {(signedAgreementReady || tracking?.signedAgreementUrl) && (
                  <button
                    onClick={() =>
                      window.open(
                        `/api/admin/dealer-verifications/${dealerId}/download-signed-agreement`,
                        "_blank"
                      )
                    }
                    className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                  >
                    <Download className="h-4 w-4" />
                    Download Signed Agreement
                  </button>
                )}

                <button
                  onClick={handleAuditTrailDownload}
                  disabled={auditTrailLoading || isRejected || !isAgreementCompleted}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <FileText className="h-4 w-4" />
                  {auditTrailLoading ? "Downloading Audit Trail..." : "Download Audit Trail"}
                </button>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                {!hasInitiatedAgreement && (
                  <button
                    onClick={() => handleAgreementAction("initiate")}
                    disabled={agreementActionLoading !== null || isRejected}
                    className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    <FileSignature className="h-4 w-4" />
                    {agreementActionLoading === "initiate"
                      ? "Initiating..."
                      : "Initiate Agreement"}
                  </button>
                )}

                {hasInitiatedAgreement && !isAgreementCompleted && (
                  <button
                    onClick={() => handleAgreementAction("refresh")}
                    disabled={agreementActionLoading !== null || isRejected}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {agreementActionLoading === "refresh"
                      ? "Refreshing..."
                      : "Refresh Status"}
                  </button>
                )}

                {tracking?.canReInitiate && (
                  <button
                    onClick={() => handleAgreementAction("reinitiate")}
                    disabled={agreementActionLoading !== null || isRejected}
                    className="inline-flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {agreementActionLoading === "reinitiate"
                      ? "Re-initiating..."
                      : "Re-initiate Agreement"}
                  </button>
                )}

                {(agreementStatusForUi || "").toLowerCase() === "signed" &&
                  !data.agreement?.copyUrl && (
                    <button
                      onClick={() => handleAgreementAction("retry")}
                      disabled={agreementActionLoading !== null || isRejected}
                      className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Download className="h-4 w-4" />
                      {agreementActionLoading === "retry"
                        ? "Retrying..."
                        : "Retry Download Signed Copy"}
                    </button>
                  )}

                {/* <button
                  onClick={handleOpenAuditTrail}
                  disabled={
                    auditTrailLoading ||
                    isRejected ||
                    !isAgreementCompleted
                  }
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <FileText className="h-4 w-4" />
                  {auditTrailLoading ? "Opening Audit Trail..." : "Download Audit Trail"}
                </button> */}
              </div>

              <div className="mt-8 rounded-[24px] border border-slate-200 bg-white shadow-sm">
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      Agreement Tracking Table
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Signer-wise agreement progress and available actions.
                    </p>
                  </div>

                  {tracking?.failureReason ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">
                      {tracking.failureReason}
                    </div>
                  ) : null}
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="bg-slate-50">
                      <tr className="text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        <th className="px-6 py-4">Agreement ID</th>
                        <th className="px-6 py-4">Signer Name</th>
                        <th className="px-6 py-4">Signer Email</th>
                        <th className="px-6 py-4">Signer Status</th>
                        <th className="px-6 py-4">Actions</th>
                      </tr>
                    </thead>

                    <tbody>
                      {trackingLoading ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-8 text-sm text-slate-500">
                            Loading agreement tracking...
                          </td>
                        </tr>
                      ) : tracking?.signers?.length ? (
                        tracking.signers.map((signer) => (
                          <tr
                            key={signer.id}
                            className="border-t border-slate-200 text-sm text-slate-700"
                          >
                            <td className="px-6 py-4 font-medium text-slate-900">
                              {tracking.agreementId || "Not available"}
                            </td>

                            <td className="px-6 py-4">
                              <div className="font-medium text-slate-900">
                                {signer.signerName || "Not available"}
                              </div>
                              <div className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-400">
                                {signer.signerRole?.replaceAll("_", " ")}
                              </div>
                            </td>

                            <td className="px-6 py-4">
                              <div>{signer.signerEmail || "Not available"}</div>
                              {signer.signerMobile ? (
                                <div className="mt-1 text-xs text-slate-500">{signer.signerMobile}</div>
                              ) : null}
                            </td>

                            <td className="px-6 py-4">
                              <SignerStatusBadge value={signer.signerStatus} />
                            </td>

                            <td className="px-6 py-4">
                              {tracking?.canReInitiate ? (
                                <button
                                  onClick={() => handleAgreementAction("reinitiate")}
                                  disabled={agreementActionLoading !== null || isRejected}
                                  className="inline-flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                                >
                                  <RefreshCw className="h-4 w-4" />
                                  {agreementActionLoading === "reinitiate"
                                    ? "Re-initiating..."
                                    : "Re-initiate Agreement"}
                                </button>
                              ) : signer.providerSigningUrl ? (
                                <a
                                  href={signer.providerSigningUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                  Open Link
                                </a>
                              ) : (
                                <span className="text-slate-400">No action</span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="px-6 py-8 text-sm text-slate-500">
                            No agreement tracking rows available yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-6 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-white p-3 text-slate-700 shadow-sm">
                    <Clock3 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      Agreement Activity Timeline
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Latest Digio agreement events and signer progress history.
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {tracking?.timeline?.length ? (
                    tracking.timeline.map((event) => (
                      <div
                        key={event.id}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
                      >
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {(event.eventType || "event").replaceAll("_", " ")}
                            </p>
                            <p className="mt-1 text-xs uppercase tracking-[0.12em] text-slate-400">
                              {event.signerRole
                                ? event.signerRole.replaceAll("_", " ")
                                : "system"}
                            </p>
                          </div>

                          <div className="flex flex-col items-start gap-2 md:items-end">
                            <AgreementBadge value={event.eventStatus || undefined} />
                            <p className="text-xs text-slate-500">
                              {event.createdAt
                                ? new Date(event.createdAt).toLocaleString()
                                : "Not available"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                      No timeline events available yet.
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>
          )}
        </div>

        <ActionCard
          remarks={remarks}
          setRemarks={setRemarks}
          submitting={submitting || isRejected}
          onApprove={handleApprove}
          onCorrection={handleCorrection}
          onReject={handleReject}
          onBack={() => router.push("/admin/dealer-verification")}
          financeEnabled={data.financeEnabled}
          agreementStatus={agreementStatusForUi}
        />
      </div>
    </div>
  );
}