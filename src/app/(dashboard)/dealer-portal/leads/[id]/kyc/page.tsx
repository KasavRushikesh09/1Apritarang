'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    AlertCircle,
    ArrowRight,
    CheckCircle2,
    ChevronLeft,
    Clock,
    Download,
    Eye,
    FileText,
    Loader2,
    RefreshCw,
    Send,
    Shield,
    Upload,
    X,
} from 'lucide-react';

type AccessCheckResponse =
    | {
        success: true;
        data?: {
            canAccess?: boolean;
            reason?: string | null;
            lead?: any;
        };
        allowed?: boolean;
        lead?: any;
    }
    | {
        success: false;
        message?: string;
        error?: { message?: string };
    };

type UploadedDoc = {
    id?: string;
    doc_type: string;
    file_url: string | null;
    file_name?: string | null;
    file_size?: number | null;
    uploaded_at?: string | null;
    updated_at?: string | null;
    doc_status?: 'not_uploaded' | 'uploaded' | 'verified' | 'rejected' | 'reupload_requested' | string;
    verification_status?: 'pending' | 'in_progress' | 'success' | 'failed' | 'awaiting_action' | string;
    rejection_reason?: string | null;
    failed_reason?: string | null;
};

type VerificationRow = {
    type: string;
    label: string;
    status: 'pending' | 'initiating' | 'awaiting_action' | 'in_progress' | 'success' | 'failed' | string;
    last_update?: string | null;
    failed_reason?: string | null;
};

const FINANCE_DOCUMENTS = [
    { key: 'aadhaar_front', label: 'Aadhaar Front', required: true },
    { key: 'aadhaar_back', label: 'Aadhaar Back', required: true },
    { key: 'pan_card', label: 'PAN Card', required: true },
    { key: 'passport_photo', label: 'Passport Size Photo', required: true },
    { key: 'address_proof', label: 'Address Proof', required: true },
    { key: 'rc_copy', label: 'RC Copy', required: false, conditional: true },
    { key: 'bank_statement', label: 'Bank Statement', required: true },
    { key: 'cheque_1', label: 'Undated Cheque 1', required: true },
    { key: 'cheque_2', label: 'Undated Cheque 2', required: true },
    { key: 'cheque_3', label: 'Undated Cheque 3', required: true },
    { key: 'cheque_4', label: 'Undated Cheque 4', required: true },
] as const;

const UPFRONT_DOCUMENTS = [
    { key: 'aadhaar_front', label: 'Aadhaar Front', required: true },
    { key: 'aadhaar_back', label: 'Aadhaar Back', required: true },
    { key: 'pan_card', label: 'PAN Card', required: true },
] as const;

function isFinalConsentStatus(status: string) {
    return ['admin_verified', 'manual_verified', 'verified'].includes((status || '').toLowerCase());
}

function formatDateTime(value?: string | null) {
    if (!value) return '-';
    try {
        return new Date(value).toLocaleString();
    } catch {
        return value;
    }
}

function bytesToSize(bytes?: number | null) {
    if (!bytes) return '-';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Byte';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round((bytes / Math.pow(1024, i)) * 100) / 100} ${sizes[i]}`;
}

export default function KYCPage() {
    const router = useRouter();
    const params = useParams();
    const leadId = params.id as string;

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lead, setLead] = useState<any>(null);
    const [accessDenied, setAccessDenied] = useState(false);
    const [apiError, setApiError] = useState<string | null>(null);

    const [uploadedDocs, setUploadedDocs] = useState<Record<string, UploadedDoc>>({});
    const [verifications, setVerifications] = useState<VerificationRow[]>([]);
    const [consentStatus, setConsentStatus] = useState<string>('awaiting_signature');

    const [savingDraft, setSavingDraft] = useState(false);
    const [lastSaved, setLastSaved] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const loadPageData = async (soft = false) => {
        if (soft) setRefreshing(true);
        else setLoading(true);

        try {
            setApiError(null);

            const accessRes = await fetch(`/api/kyc/${leadId}/access-check`, {
                cache: 'no-store',
            });
            const accessJson: AccessCheckResponse = await accessRes.json();

            const canAccess =
                (accessJson as any)?.data?.canAccess ??
                (accessJson as any)?.allowed ??
                false;

            const fetchedLead =
                (accessJson as any)?.data?.lead ??
                (accessJson as any)?.lead ??
                null;

            if (!canAccess) {
                setAccessDenied(true);
                setLead(fetchedLead);
                return;
            }

            setAccessDenied(false);
            setLead(fetchedLead);

            if (fetchedLead?.consent_status) {
                setConsentStatus(fetchedLead.consent_status);
            }

            const [docsRes, verificationsRes] = await Promise.allSettled([
                fetch(`/api/kyc/${leadId}/documents`, { cache: 'no-store' }),
                fetch(`/api/kyc/${leadId}/verifications`, { cache: 'no-store' }),
            ]);

            if (docsRes.status === 'fulfilled') {
                const docsJson = await docsRes.value.json();
                if (docsJson?.success && Array.isArray(docsJson.data)) {
                    const mapped: Record<string, UploadedDoc> = {};
                    for (const doc of docsJson.data) {
                        mapped[doc.doc_type] = doc;
                    }
                    setUploadedDocs(mapped);
                } else {
                    setUploadedDocs({});
                }
            }

            if (verificationsRes.status === 'fulfilled') {
                const verJson = await verificationsRes.value.json();
                if (verJson?.success && Array.isArray(verJson.data)) {
                    setVerifications(verJson.data);
                } else {
                    setVerifications([]);
                }
            }
        } catch (error) {
            console.error(error);
            setApiError('Failed to load Step 2 data');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadPageData();
    }, [leadId]);

    useEffect(() => {
        const interval = setInterval(() => {
            if (!loading && !accessDenied && Object.keys(uploadedDocs).length > 0) {
                handleSaveDraft(true);
            }
        }, 120000);

        return () => clearInterval(interval);
    }, [loading, accessDenied, uploadedDocs, consentStatus]);

    const requiredDocs = useMemo(() => {
        const paymentMethod = (lead?.payment_method || '').toLowerCase();
        const isFinance = ['finance', 'dealer_finance', 'other_finance', 'loan'].includes(paymentMethod);

        if (!isFinance) {
            return [...UPFRONT_DOCUMENTS];
        }

        const assetModel = String(lead?.asset_model || lead?.asset_category || '').toUpperCase();
        const isVehicle = ['2W', '3W', '4W'].includes(assetModel);

        return FINANCE_DOCUMENTS.map((doc) =>
            doc.key === 'rc_copy' ? { ...doc, required: isVehicle } : doc
        );
    }, [lead]);

    const docStats = useMemo(() => {
        const required = requiredDocs.filter((d) => d.required);
        const uploaded = required.filter((d) => {
            const row = uploadedDocs[d.key];
            return !!row?.file_url;
        });

        const pending = required.filter((d) => {
            const row = uploadedDocs[d.key];
            return !row?.file_url;
        });

        return {
            total: required.length,
            uploadedCount: uploaded.length,
            pending,
        };
    }, [requiredDocs, uploadedDocs]);

    const handleDocUpload = async (documentType: string, file: File) => {
        if (!file) return;

        const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'];

        if (!allowedTypes.includes(file.type)) {
            setApiError('Only PNG, JPEG, JPG, and PDF files are allowed');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            setApiError('File size must be 5MB or smaller');
            return;
        }

        setUploadedDocs((prev) => ({
            ...prev,
            [documentType]: {
                ...(prev[documentType] || {}),
                doc_type: documentType,
                verification_status: 'pending',
                doc_status: 'uploaded',
                file_url: prev[documentType]?.file_url || null,
            },
        }));

        try {
            setApiError(null);

            const formData = new FormData();
            formData.append('file', file);
            formData.append('documentType', documentType);
            formData.append('docType', documentType);

            const res = await fetch(`/api/kyc/${leadId}/upload-document`, {
                method: 'POST',
                body: formData,
            });

            const data = await res.json();

            if (!res.ok || !data?.success) {
                throw new Error(data?.message || data?.error?.message || 'Upload failed');
            }

            await loadPageData(true);
        } catch (error: any) {
            console.error(error);
            setApiError(error?.message || 'Document upload failed');
        }
    };

    const handleSaveDraft = async (auto = false) => {
        try {
            setSavingDraft(true);

            const res = await fetch(`/api/kyc/${leadId}/save-draft`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    step: 2,
                    data: {
                        documents: uploadedDocs,
                        consentStatus,
                    },
                }),
            });

            if (!res.ok) {
                throw new Error('Failed to save draft');
            }

            setLastSaved(`${auto ? 'Auto-saved' : 'Saved'} at ${new Date().toLocaleTimeString()}`);
        } catch (error) {
            console.error(error);
        } finally {
            setSavingDraft(false);
        }
    };

    const handleSendConsent = async (channel: 'sms' | 'whatsapp') => {
        try {
            setApiError(null);

            const res = await fetch(`/api/kyc/${leadId}/send-consent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel }),
            });

            const data = await res.json();

            if (!res.ok || !data?.success) {
                throw new Error(data?.message || data?.error?.message || 'Failed to send consent');
            }

            setConsentStatus('link_sent');
        } catch (error: any) {
            setApiError(error?.message || 'Failed to send consent');
        }
    };

    const handleGenerateConsentPDF = async () => {
        try {
            setApiError(null);

            const res = await fetch(`/api/kyc/${leadId}/generate-consent-pdf`, {
                method: 'POST',
            });

            const data = await res.json();

            if (!res.ok || !data?.success) {
                throw new Error(data?.message || data?.error?.message || 'Failed to generate consent PDF');
            }

            setConsentStatus('manual_pdf_generated');

            if (data.pdfUrl) {
                window.open(data.pdfUrl, '_blank');
            }
        } catch (error: any) {
            setApiError(error?.message || 'Failed to generate consent PDF');
        }
    };

    const handleUploadSignedConsent = async (file: File) => {
        try {
            setApiError(null);

            if (file.type !== 'application/pdf') {
                throw new Error('Only PDF files are allowed for signed consent upload');
            }

            if (file.size > 10 * 1024 * 1024) {
                throw new Error('Signed consent PDF must be 10MB or smaller');
            }

            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch(`/api/kyc/${leadId}/upload-signed-consent`, {
                method: 'POST',
                body: formData,
            });

            const data = await res.json();

            if (!res.ok || !data?.success) {
                throw new Error(data?.message || data?.error?.message || 'Failed to upload signed consent');
            }

            setConsentStatus('manual_uploaded');
        } catch (error: any) {
            setApiError(error?.message || 'Failed to upload signed consent');
        }
    };

    const handleSaveAndNext = async () => {
        const failedVerification = verifications.find((v) => v.status === 'failed');

        if (docStats.uploadedCount < docStats.total) {
            setApiError(
                `Missing documents: ${docStats.pending.map((d) => d.label).join(', ')}`
            );
            return;
        }

        if (!isFinalConsentStatus(consentStatus)) {
            setApiError('Save & Next is allowed only after consent is admin verified');
            return;
        }

        if (failedVerification) {
            setApiError(`Verification failed: ${failedVerification.label}`);
            return;
        }

        try {
            setSubmitting(true);
            setApiError(null);

            const res = await fetch(`/api/kyc/${leadId}/complete-step2`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });

            const data = await res.json();

            if (!res.ok || !data?.success) {
                throw new Error(data?.message || data?.error?.message || 'Failed to proceed');
            }

            router.push(`/dealer-portal/leads/${leadId}/options`);
        } catch (error: any) {
            setApiError(error?.message || 'Failed to proceed');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#F8F9FB]">
                <Loader2 className="w-10 h-10 animate-spin text-[#1D4ED8]" />
            </div>
        );
    }

    if (accessDenied) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#F8F9FB]">
                <div className="text-center max-w-md">
                    <Shield className="w-14 h-14 text-red-400 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-gray-900">Access Denied</h2>
                    <p className="mt-2 text-sm text-gray-500">
                        Step 2 is only available for hot leads with non-cash payment method.
                    </p>
                    <button
                        onClick={() => router.push('/dealer-portal/leads')}
                        className="mt-6 px-6 py-3 bg-[#0047AB] text-white rounded-xl font-bold"
                    >
                        Back to Leads
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F8F9FB]">
            <div className="max-w-[1200px] mx-auto px-6 py-8 pb-40">
                <header className="mb-8 flex justify-between items-start gap-6">
                    <div className="flex gap-4">
                        <button
                            onClick={() => router.back()}
                            className="mt-1 p-2 hover:bg-white transition-colors rounded-lg"
                        >
                            <ChevronLeft className="w-6 h-6 text-gray-900" />
                        </button>

                        <div>
                            <h1 className="text-[28px] font-black text-gray-900 leading-tight tracking-tight">
                                Customer KYC
                            </h1>
                            <p className="text-sm text-gray-500 mt-0.5">
                                Lead: <span className="font-medium">{lead?.reference_id || leadId}</span>
                                {lead?.full_name ? <span> — {lead.full_name}</span> : null}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => loadPageData(true)}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 text-sm font-semibold"
                        >
                            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                            Refresh
                        </button>

                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-right mb-1.5">
                                Workflow Progress
                            </p>
                            <div className="flex items-center gap-6">
                                <span className="text-xs font-bold text-[#1D4ED8] whitespace-nowrap">
                                    Step 2 of 5
                                </span>
                                <div className="flex gap-2.5">
                                    {[1, 2, 3, 4, 5].map((s) => (
                                        <div
                                            key={s}
                                            className={`h-[6px] w-[50px] rounded-full ${s <= 2 ? 'bg-[#0047AB]' : 'bg-gray-200'
                                                }`}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                {apiError && (
                    <div className="mb-6 bg-red-50 border border-red-200 p-4 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-3 text-red-700 font-medium text-sm">
                            <AlertCircle className="w-5 h-5" />
                            {apiError}
                        </div>
                        <button
                            onClick={() => setApiError(null)}
                            className="p-1 hover:bg-white rounded-md"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                )}

                {submitted && (
                    <div className="mb-6 bg-green-50 border border-green-200 p-6 rounded-xl text-center">
                        <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto mb-3" />
                        <p className="text-lg font-bold text-green-800">Submitted</p>
                        <p className="text-sm text-green-600 mt-1">
                            Step 2 has been submitted successfully.
                        </p>
                    </div>
                )}

                <div className="mb-6 flex items-center gap-2 overflow-x-auto pb-1">
                    {[
                        {
                            label: 'Documents',
                            done: docStats.uploadedCount === docStats.total,
                            active: docStats.uploadedCount < docStats.total,
                        },
                        {
                            label: 'Consent',
                            done: isFinalConsentStatus(consentStatus),
                            active: docStats.uploadedCount === docStats.total && !isFinalConsentStatus(consentStatus),
                        },
                        {
                            label: 'Review',
                            done: false,
                            active: false,
                        },
                    ].map((s, i) => (
                        <div key={s.label} className="flex items-center gap-2">
                            {i > 0 && (
                                <div className={`w-8 h-[2px] ${s.done || s.active ? 'bg-[#0047AB]' : 'bg-gray-200'}`} />
                            )}
                            <div
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap ${s.done
                                        ? 'bg-green-50 text-green-700 border border-green-200'
                                        : s.active
                                            ? 'bg-blue-50 text-[#0047AB] border border-blue-200'
                                            : 'bg-gray-50 text-gray-400 border border-gray-100'
                                    }`}
                            >
                                {s.done ? (
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                ) : s.active ? (
                                    <div className="w-2 h-2 bg-[#0047AB] rounded-full animate-pulse" />
                                ) : (
                                    <div className="w-2 h-2 bg-gray-300 rounded-full" />
                                )}
                                {s.label}
                            </div>
                        </div>
                    ))}
                </div>

                <main className="grid grid-cols-1 gap-6">
                    <SectionCard title="Document Upload" icon={<FileText className="w-5 h-5 text-[#0047AB]" />}>
                        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
                            <div className="flex items-center gap-4">
                                <div className="text-sm font-bold text-gray-900">
                                    Documents: <span className="text-[#0047AB]">{docStats.uploadedCount}/{docStats.total}</span>
                                </div>

                                <div className="h-2 w-40 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-[#0047AB] rounded-full transition-all"
                                        style={{
                                            width: `${docStats.total > 0 ? (docStats.uploadedCount / docStats.total) * 100 : 0}%`,
                                        }}
                                    />
                                </div>
                            </div>

                            {docStats.pending.length > 0 && (
                                <p className="text-xs font-medium text-red-500">
                                    Pending: {docStats.pending.map((d) => d.label).join(', ')}
                                </p>
                            )}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {requiredDocs.map((doc) => {
                                const row = uploadedDocs[doc.key];

                                return (
                                    <DocumentCard
                                        key={doc.key}
                                        label={doc.label}
                                        required={doc.required}
                                        uploaded={!!row?.file_url}
                                        fileUrl={row?.file_url || null}
                                        fileName={row?.file_name || null}
                                        fileSize={row?.file_size || null}
                                        uploadedAt={row?.uploaded_at || null}
                                        docStatus={row?.doc_status || 'not_uploaded'}
                                        failedReason={row?.rejection_reason || row?.failed_reason || null}
                                        onUpload={(file) => handleDocUpload(doc.key, file)}
                                    />
                                );
                            })}
                        </div>
                    </SectionCard>

                    <SectionCard title="Customer Consent" icon={<Send className="w-5 h-5 text-[#0047AB]" />}>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-3">
                                <h4 className="text-sm font-bold text-gray-900">Digital Consent</h4>

                                <button
                                    onClick={() => handleSendConsent('sms')}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-[#0047AB] text-white rounded-xl text-sm font-bold hover:bg-[#003580] transition-all"
                                >
                                    <Send className="w-4 h-4" />
                                    Send SMS Consent
                                </button>

                                <button
                                    onClick={() => handleSendConsent('whatsapp')}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 transition-all"
                                >
                                    <Send className="w-4 h-4" />
                                    Send WhatsApp Consent
                                </button>
                            </div>

                            <div className="space-y-3">
                                <h4 className="text-sm font-bold text-gray-900">Manual Consent</h4>

                                <button
                                    onClick={handleGenerateConsentPDF}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-gray-200 rounded-xl text-sm font-bold hover:border-[#0047AB] transition-all"
                                >
                                    <Download className="w-4 h-4" />
                                    Generate Consent PDF
                                </button>

                                <label className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm font-bold cursor-pointer hover:border-[#0047AB] transition-all">
                                    <Upload className="w-4 h-4" />
                                    Upload Signed PDF
                                    <input
                                        type="file"
                                        className="hidden"
                                        accept="application/pdf"
                                        onChange={(e) => {
                                            if (e.target.files?.[0]) handleUploadSignedConsent(e.target.files[0]);
                                        }}
                                    />
                                </label>
                            </div>

                            <div className="space-y-3">
                                <h4 className="text-sm font-bold text-gray-900">Status</h4>

                                <div className="p-4 bg-gray-50 rounded-xl space-y-2">
                                    {[
                                        'awaiting_signature',
                                        'link_sent',
                                        'admin_review_pending',
                                        'admin_verified',
                                        'manual_pdf_generated',
                                        'manual_uploaded',
                                        'manual_verified',
                                    ].map((status) => {
                                        const active = consentStatus === status;
                                        const complete =
                                            status === 'awaiting_signature'
                                                ? true
                                                : isFinalConsentStatus(consentStatus)
                                                    ? ['awaiting_signature', 'link_sent', 'admin_review_pending', 'admin_verified', 'manual_pdf_generated', 'manual_uploaded', 'manual_verified'].includes(status)
                                                    : ['link_sent', 'admin_review_pending', 'manual_pdf_generated', 'manual_uploaded'].includes(consentStatus) &&
                                                    ['awaiting_signature', 'link_sent'].includes(status);

                                        return (
                                            <div key={status} className="flex items-center gap-2">
                                                {complete ? (
                                                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                                                ) : (
                                                    <div className="w-4 h-4 rounded-full border-2 border-gray-200" />
                                                )}
                                                <span className={`text-xs font-medium ${active ? 'text-gray-900' : 'text-gray-400'}`}>
                                                    {status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </SectionCard>

                    {verifications.length > 0 && (
                        <SectionCard title="Verification Status" icon={<Shield className="w-5 h-5 text-[#0047AB]" />}>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-gray-100">
                                            <th className="text-left py-3 px-4 font-bold text-gray-500 text-xs uppercase">Check</th>
                                            <th className="text-left py-3 px-4 font-bold text-gray-500 text-xs uppercase">Status</th>
                                            <th className="text-left py-3 px-4 font-bold text-gray-500 text-xs uppercase">Last Update</th>
                                            <th className="text-left py-3 px-4 font-bold text-gray-500 text-xs uppercase">Reason</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {verifications.map((row) => (
                                            <tr key={row.type} className="border-b border-gray-50 hover:bg-gray-50/50">
                                                <td className="py-3 px-4 font-medium text-gray-900">{row.label}</td>
                                                <td className="py-3 px-4">
                                                    <StatusBadge status={row.status} />
                                                </td>
                                                <td className="py-3 px-4 text-gray-500 text-xs">
                                                    {formatDateTime(row.last_update)}
                                                </td>
                                                <td className="py-3 px-4 text-red-500 text-xs">
                                                    {row.failed_reason || '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </SectionCard>
                    )}
                </main>

                <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
                    <div className="max-w-[1200px] mx-auto px-6 py-4 flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-4 flex-wrap">
                            <button
                                onClick={() => router.push('/dealer-portal/leads')}
                                className="px-5 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 flex items-center gap-2"
                            >
                                <ChevronLeft className="w-4 h-4" />
                                Back
                            </button>

                            {lastSaved ? <span className="text-xs text-gray-400">{lastSaved}</span> : null}

                            <button
                                onClick={() => handleSaveDraft(false)}
                                disabled={savingDraft}
                                className="px-5 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-40 flex items-center gap-2"
                            >
                                {savingDraft ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                Save Draft
                            </button>
                        </div>

                        <button
                            onClick={handleSaveAndNext}
                            disabled={savingDraft || submitting}
                            className="px-8 py-2.5 bg-[#0047AB] text-white rounded-xl text-sm font-bold disabled:opacity-40 hover:bg-[#003580] flex items-center gap-2"
                        >
                            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                            Save & Next
                            <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function SectionCard({
    title,
    icon,
    children,
}: {
    title: string;
    icon?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-3">
                {icon}
                <h3 className="text-base font-black text-gray-900">{title}</h3>
            </div>
            <div className="px-6 py-5">{children}</div>
        </div>
    );
}

function DocumentCard({
    label,
    required,
    uploaded,
    fileUrl,
    fileName,
    fileSize,
    uploadedAt,
    docStatus,
    failedReason,
    onUpload,
}: {
    label: string;
    required: boolean;
    uploaded: boolean;
    fileUrl: string | null;
    fileName: string | null;
    fileSize: number | null;
    uploadedAt: string | null;
    docStatus: string;
    failedReason: string | null;
    onUpload: (file: File) => void;
}) {
    const status = (docStatus || 'not_uploaded').toLowerCase();

    const statusPill =
        status === 'verified' ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-700">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Verified
            </span>
        ) : status === 'uploaded' ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700">
                <Clock className="w-3.5 h-3.5" />
                Uploaded - Pending Review
            </span>
        ) : status === 'reupload_requested' || status === 'rejected' ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700">
                <AlertCircle className="w-3.5 h-3.5" />
                Reupload Required
            </span>
        ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-400">
                <Clock className="w-3.5 h-3.5" />
                Not Uploaded
            </span>
        );

    return (
        <div
            className={`rounded-2xl border p-4 transition-all ${uploaded
                    ? 'border-blue-200 bg-blue-50/40'
                    : status === 'reupload_requested' || status === 'rejected'
                        ? 'border-red-200 bg-red-50/40'
                        : 'border-dashed border-gray-200 bg-white'
                }`}
        >
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h4 className="text-sm font-bold text-gray-900">{label}</h4>
                    {required ? (
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-red-500">
                            Required
                        </p>
                    ) : (
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                            Optional
                        </p>
                    )}
                </div>

                <div>{statusPill}</div>
            </div>

            {uploaded ? (
                <div className="mt-4 space-y-2">
                    <div className="text-xs text-gray-600">
                        <p className="font-medium text-gray-800 truncate">{fileName || 'Uploaded file'}</p>
                        <p className="mt-1 text-gray-500">
                            {bytesToSize(fileSize)} · {formatDateTime(uploadedAt)}
                        </p>
                    </div>

                    {failedReason ? (
                        <div className="text-[11px] text-red-600 font-medium">{failedReason}</div>
                    ) : null}

                    <div className="flex items-center gap-3 pt-1">
                        {fileUrl ? (
                            <button
                                onClick={() => window.open(fileUrl, '_blank')}
                                className="inline-flex items-center gap-1 text-xs font-bold text-[#0047AB] hover:underline"
                            >
                                <Eye className="w-3.5 h-3.5" />
                                View
                            </button>
                        ) : null}

                        <label className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 cursor-pointer hover:underline">
                            <RefreshCw className="w-3.5 h-3.5" />
                            Replace
                            <input
                                type="file"
                                className="hidden"
                                accept="image/png,image/jpeg,image/jpg,application/pdf"
                                onChange={(e) => {
                                    if (e.target.files?.[0]) onUpload(e.target.files[0]);
                                }}
                            />
                        </label>
                    </div>
                </div>
            ) : (
                <label className="mt-5 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 cursor-pointer hover:border-[#0047AB] hover:bg-blue-50/40 transition-all">
                    <Upload className="w-6 h-6 text-gray-300" />
                    <span className="text-xs font-bold text-gray-500">Click to upload</span>
                    <span className="text-[10px] text-gray-400">PNG, JPEG, PDF (max 5MB)</span>
                    <input
                        type="file"
                        className="hidden"
                        accept="image/png,image/jpeg,image/jpg,application/pdf"
                        onChange={(e) => {
                            if (e.target.files?.[0]) onUpload(e.target.files[0]);
                        }}
                    />
                </label>
            )}

            {!uploaded && failedReason ? (
                <p className="mt-3 text-[11px] text-red-600 font-medium">{failedReason}</p>
            ) : null}
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const normalized = (status || '').toLowerCase();

    if (normalized === 'success' || normalized === 'verified') {
        return (
            <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                Success
            </span>
        );
    }

    if (normalized === 'failed' || normalized === 'rejected') {
        return (
            <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                Failed
            </span>
        );
    }

    if (normalized === 'in_progress' || normalized === 'initiating') {
        return (
            <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                In Progress
            </span>
        );
    }

    if (normalized === 'awaiting_action') {
        return (
            <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                Awaiting Action
            </span>
        );
    }

    return (
        <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
            Pending
        </span>
    );
}