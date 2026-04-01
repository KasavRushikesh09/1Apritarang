'use client';

import {
  Users,
  FileText,
  Plus,
  FileCheck,
  Battery,
  Package,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Megaphone,
  ChevronRight,
  BadgeCheck,
  Building2,
  Clock3,
  ShieldCheck,
  LifeBuoy,
  Lock,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';

type DealerApiData = {
  id: string | null;
  companyName: string;
  dealerCode: string | null;
  onboardingStatus: string;
  reviewStatus: string;
  dealerAccountStatus: string;
  approvedAt: string | null;
  submittedAt: string | null;
  financeEnabled: boolean;
  isApproved: boolean;
};

type DealerStatsResponse = {
  dealer: DealerApiData | null;
  metrics: {
    totalLeads: number;
    convertedLeads: number;
    conversionRate: number;
    commission: number;
    inventoryCount: number;
    totalPayments: number;
    loanCount: number;
    rewards: number;
  };
  recentLeads: LeadItem[];
};

type DealerDashboardData = {
  dealerId: string;
  dealerDisplayName: string;
  companyName: string;
  companyType: string;
  gstNumber: string;
  financeEnabled: string;
  submittedAt: string;
};

type LeadItem = {
  id: string;
  owner_name?: string | null;
  owner_contact?: string | null;
  interest_level?: string | null;
  lead_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  current_address?: string | null;
  payment_method?: string | null;
};

type ExtendedAuthUser = {
  id?: string;
  email?: string;
  role?: string;
  name?: string | null;
  full_name?: string | null;
  dealer_id?: string | null;
  company_type?: string | null;
  gst_number?: string | null;
  finance_enabled?: boolean | null;
  submitted_at?: string | null;
};

function DealerApprovalModal({
  open,
  onClose,
  companyName,
  dealerCode,
  approvedAt,
}: {
  open: boolean;
  onClose: () => void;
  companyName?: string;
  dealerCode?: string | null;
  approvedAt?: string | null;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-2xl rounded-[32px] border border-slate-200 bg-white shadow-2xl">
        <div className="px-8 pt-8 pb-6">
          <div className="flex justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/60">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            </div>
          </div>

          <div className="mt-6 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-600">
              Account Approved
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
              Congratulations, your iTarang dealer account is now active
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-600">
              Your onboarding review has been completed successfully. Full dashboard
              access has been enabled, and you can now manage leads, orders,
              inventory, service operations, and finance workflows from your
              iTarang dealer workspace.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-5 md:grid-cols-3">
            <div className="rounded-2xl bg-white p-4">
              <div className="flex items-center gap-2 text-slate-500">
                <Building2 className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-[0.16em]">
                  Company
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {companyName || 'Dealer Account'}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-4">
              <div className="flex items-center gap-2 text-slate-500">
                <BadgeCheck className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-[0.16em]">
                  Dealer ID
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {dealerCode || 'Not available'}
              </p>
            </div>

            <div className="rounded-2xl bg-white p-4">
              <div className="flex items-center gap-2 text-slate-500">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-[0.16em]">
                  Activated On
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {approvedAt ? new Date(approvedAt).toLocaleString() : 'Just now'}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
            Your account has been activated securely and no further action is required at this time.
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-8 py-6 sm:flex-row sm:justify-center">
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-2xl bg-[#1F5C8F] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#173F63]"
          >
            Go to Dashboard
          </button>

          <button
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            View Account Details
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DealerDashboard() {
  const { user, loading: authLoading } = useAuth();
  const currentUser = (user ?? null) as ExtendedAuthUser | null;

  const [stats, setStats] = useState<DealerStatsResponse>({
    dealer: null,
    metrics: {
      totalLeads: 0,
      convertedLeads: 0,
      conversionRate: 0,
      commission: 0,
      inventoryCount: 0,
      totalPayments: 0,
      loanCount: 0,
      rewards: 0,
    },
    recentLeads: [],
  });

  const [loading, setLoading] = useState(true);
  const [dealerData, setDealerData] = useState<DealerDashboardData | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [selectedLead, setSelectedLead] = useState<LeadItem | null>(null);

  useEffect(() => {
    const savedDealerData = localStorage.getItem('dealerDashboardData');
    if (savedDealerData) {
      try {
        setDealerData(JSON.parse(savedDealerData) as DealerDashboardData);
      } catch (error) {
        console.error('Failed to parse dealer dashboard data', error);
      }
    }
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/dealer/stats', { cache: 'no-store' });
        const json: { success?: boolean; data?: DealerStatsResponse } = await res.json();

        if (json.success && json.data) {
          setStats(json.data);
        }
      } catch (error) {
        console.error('Failed to load stats', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const dealer = stats.dealer;
  const metricsData = stats.metrics;
  const isApproved = !!dealer?.isApproved;

  useEffect(() => {
    if (!dealer?.id || !isApproved) return;

    const seenKey = `dealerApprovalSeen-${dealer.id}`;
    const alreadySeen = localStorage.getItem(seenKey) === 'true';

    if (!alreadySeen) {
      setShowApprovalModal(true);
    }
  }, [dealer?.id, isApproved]);

  const handleCloseApprovalModal = () => {
    if (dealer?.id) {
      localStorage.setItem(`dealerApprovalSeen-${dealer.id}`, 'true');
    }
    setShowApprovalModal(false);
  };

  if (authLoading) {
    return <div className="p-8 text-sm text-slate-500">Loading dashboard...</div>;
  }

  const currentDealerName =
    dealer?.companyName ||
    currentUser?.full_name ||
    currentUser?.name ||
    dealerData?.dealerDisplayName ||
    dealerData?.companyName ||
    'Dealer';

  const currentDealerId =
    dealer?.dealerCode ||
    currentUser?.dealer_id ||
    dealerData?.dealerId ||
    'Pending Approval';

  const currentCompanyType =
    currentUser?.company_type ||
    dealerData?.companyType ||
    'Not available';

  const currentGst =
    currentUser?.gst_number ||
    dealerData?.gstNumber ||
    'Not available';

  const financeEnabledValue =
    typeof dealer?.financeEnabled === 'boolean'
      ? dealer.financeEnabled
        ? 'Yes'
        : 'No'
      : typeof currentUser?.finance_enabled === 'boolean'
        ? currentUser.finance_enabled
          ? 'Yes'
          : 'No'
        : dealerData?.financeEnabled?.toLowerCase() === 'yes'
          ? 'Yes'
          : 'No';

  const submittedAtValue =
    dealer?.submittedAt ||
    currentUser?.submitted_at ||
    dealerData?.submittedAt;

  const approvalStatusLabel = isApproved ? 'Approved' : 'Under Review';

  const metrics = [
    {
      title: 'Stock Available',
      value: `${metricsData.inventoryCount} Units`,
      trend: '+0%',
      icon: Package,
      color: 'text-brand-600',
      subtext: 'in warehouse',
      trendColor: 'text-gray-400',
    },
    {
      title: 'Stock Deployed',
      value: '0 EVs',
      trend: '0',
      icon: TruckStart,
      color: 'text-blue-600',
      subtext: 'on the road',
      trendColor: 'text-gray-400',
    },
    {
      title: 'Delayed Payment',
      value: '₹ 0',
      trend: '0%',
      icon: AlertCircle,
      color: 'text-red-600',
      subtext: 'Outstanding',
      trendColor: 'text-gray-400',
    },
    {
      title: 'On-time Payment',
      value:
        metricsData.totalPayments > 1000
          ? `₹ ${(metricsData.totalPayments / 1000).toFixed(1)}K`
          : `₹ ${metricsData.totalPayments}`,
      trend: '+0%',
      icon: CheckCircle2,
      color: 'text-green-600',
      subtext: 'Total Collected',
      trendColor: 'text-gray-400',
    },
    {
      title: 'Total Customers',
      value: metricsData.totalLeads.toString(),
      trend: `+${metricsData.totalLeads}`,
      icon: Users,
      color: 'text-indigo-600',
      subtext: 'total leads',
      trendColor: 'text-green-600',
    },
    {
      title: 'Loan Applied',
      value: metricsData.loanCount.toString(),
      trend: `+${metricsData.loanCount}`,
      icon: FileText,
      color: 'text-orange-600',
      subtext: 'applications',
      trendColor: 'text-green-600',
    },
    {
      title: 'Loan Cleared',
      value: '0',
      trend: '0',
      icon: CheckCircle2,
      color: 'text-emerald-600',
      subtext: 'funded',
      trendColor: 'text-gray-400',
    },
    {
      title: 'KYC Rejected',
      value: '0',
      trend: '0',
      icon: XCircle,
      color: 'text-red-500',
      subtext: 'discrepancies',
      trendColor: 'text-gray-400',
    },
  ];

  return (
    <div className="animate-in space-y-8 fade-in duration-500 pb-10">
      <DealerApprovalModal
        open={showApprovalModal}
        onClose={handleCloseApprovalModal}
        companyName={dealer?.companyName || currentDealerName}
        dealerCode={dealer?.dealerCode || currentDealerId}
        approvedAt={dealer?.approvedAt || null}
      />

      {selectedLead && (
        <RecentLeadModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
        />
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Dealer Dashboard - {currentDealerName}
        </h1>
        <p className="mt-1 text-gray-500">
          {isApproved
            ? 'Overview of your iTarang dealer business'
            : 'Your onboarding is under review. Full dashboard access will unlock after approval.'}
        </p>
      </div>

      {!isApproved && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl bg-amber-100 p-2">
              <Clock3 className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-amber-900">
                Account under review
              </h2>
              <p className="mt-1 text-sm text-amber-800">
                Your onboarding has been submitted successfully. Once iTarang approves your
                documents and activates your dealer account, your full dealer dashboard will be unlocked.
              </p>
            </div>
          </div>
        </div>
      )}

      {isApproved && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-xl bg-emerald-100 p-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-700" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-emerald-900">
                Account active
              </h2>
              <p className="mt-1 text-sm text-emerald-800">
                Your dealer workspace is fully enabled. You can now manage leads, loan workflows,
                orders, inventory, and support operations from this dashboard.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-[#E3E8EF] bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-[#1F5C8F]">
                Dealer Identity
              </p>
              <h2 className="mt-2 text-xl font-bold text-[#173F63]">
                {currentDealerName}
              </h2>
              <p className="mt-2 text-sm text-gray-500">
                This dealer profile reflects the latest approved onboarding status from iTarang.
              </p>
            </div>

            <div className="hidden h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#1F5C8F] sm:flex">
              <BadgeCheck className="h-6 w-6" />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Dealer Name</p>
              <p className="mt-2 text-base font-semibold text-gray-900">
                {currentDealerName}
              </p>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-xs uppercase tracking-wide text-blue-700">Dealer ID</p>
              <p className="mt-2 inline-flex rounded-full border border-blue-200 bg-white px-3 py-1 text-sm font-bold text-[#1F5C8F]">
                {currentDealerId}
              </p>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">Company Type</p>
              <p className="mt-2 text-base font-semibold text-gray-900">
                {currentCompanyType}
              </p>
            </div>

            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">GST Number</p>
              <p className="mt-2 text-base font-semibold text-gray-900">
                {currentGst}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#E3E8EF] bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Onboarding Status</h3>
              <p className="text-sm text-gray-500">Application snapshot</p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <div
              className={`rounded-xl border px-4 py-3 ${
                isApproved
                  ? 'border-emerald-100 bg-emerald-50'
                  : 'border-amber-100 bg-amber-50'
              }`}
            >
              <p
                className={`text-xs uppercase tracking-wide ${
                  isApproved ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                Current Status
              </p>
              <p
                className={`mt-1 text-sm font-semibold ${
                  isApproved ? 'text-emerald-800' : 'text-amber-800'
                }`}
              >
                {approvalStatusLabel}
              </p>
            </div>

            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Finance Enabled</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">
                {financeEnabledValue}
              </p>
            </div>

            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Submitted At</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">
                {submittedAtValue ? new Date(submittedAtValue).toLocaleString() : 'Not available'}
              </p>
            </div>

            {dealer?.approvedAt && (
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="text-xs uppercase tracking-wide text-gray-500">Approved At</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">
                  {new Date(dealer.approvedAt).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {!isApproved ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          <ReviewTimelineCard />

          <LockedActionCard
            icon={<Plus className="h-6 w-6" />}
            title="New Lead"
            description="Lead creation will unlock after dealer verification is completed."
          />

          <LockedActionCard
            icon={<FileCheck className="h-6 w-6" />}
            title="Process Loan"
            description="Loan processing will unlock after iTarang approves your documents."
          />

          <LockedActionCard
            icon={<Battery className="h-6 w-6" />}
            title="Add Asset"
            description="Asset registration will unlock after your dealer account is activated."
          />

          <SupportCard />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <Link
              href="/dealer-portal/leads/new"
              className="group relative overflow-hidden rounded-2xl bg-[#005596] p-6 text-white shadow-lg transition-transform hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="relative z-10 flex min-h-[140px] flex-col justify-between">
                <div className="w-fit rounded-xl bg-white/10 p-3 backdrop-blur-sm transition-colors group-hover:bg-white/20">
                  <Plus className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="mb-1 text-xl font-bold">New Lead</h3>
                  <p className="text-sm text-blue-100 opacity-90">
                    Create a new customer lead
                  </p>
                </div>
              </div>
              <div className="absolute -right-4 -bottom-4 h-32 w-32 rounded-full bg-white/5 blur-2xl transition-colors group-hover:bg-white/10" />
            </Link>

            <Link
              href="/dealer-portal/loans/facilitation"
              className="group relative rounded-2xl border border-gray-100 bg-white p-6 shadow-card transition-transform hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="flex min-h-[140px] flex-col justify-between">
                <div className="w-fit rounded-xl bg-indigo-50 p-3 text-indigo-600">
                  <FileCheck className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="mb-1 text-xl font-bold text-gray-900">Process Loan</h3>
                  <p className="text-sm text-gray-500">Upload docs for financing</p>
                </div>
              </div>
            </Link>

            <Link
              href="/dealer-portal/assets"
              className="group relative rounded-2xl border border-gray-100 bg-white p-6 shadow-card transition-transform hover:-translate-y-1 hover:shadow-lg"
            >
              <div className="flex min-h-[140px] flex-col justify-between">
                <div className="w-fit rounded-xl bg-teal-50 p-3 text-teal-600">
                  <Battery className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="mb-1 text-xl font-bold text-gray-900">Add Asset</h3>
                  <p className="text-sm text-gray-500">Register new vehicle/battery</p>
                </div>
              </div>
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map((metric, index) => (
              <div
                key={index}
                className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-500">{metric.title}</span>
                  <metric.icon className={`h-4 w-4 ${metric.color}`} />
                </div>
                <div className="mb-2 flex items-end gap-2">
                  <span className="text-2xl font-bold text-gray-900">{metric.value}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                      metric.trendColor.includes('green')
                        ? 'bg-green-50 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {metric.trend}
                  </span>
                </div>
                <p className="text-xs text-gray-400">{metric.subtext}</p>
              </div>
            ))}
          </div>

          <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#004e92] to-[#000428] p-8 text-white shadow-lg">
            <div className="relative z-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
              <div>
                <h3 className="mb-2 text-xl font-bold">
                  Boost your sales! Send SMS/WhatsApp updates
                </h3>
                <p className="max-w-xl text-blue-100">
                  Reach all your customers instantly for just{' '}
                  <span className="font-semibold text-white">₹99/- per month</span>. Drive
                  engagement with targeted campaigns.
                </p>
              </div>
              <Link
                href="/dealer-portal/campaigns/new"
                className="flex items-center gap-2 whitespace-nowrap rounded-full bg-white px-6 py-2.5 font-semibold text-blue-900 shadow-md transition-colors hover:bg-blue-50"
              >
                <Megaphone className="h-4 w-4" />
                Start Campaign
              </Link>
            </div>
            <div className="absolute top-0 right-0 h-64 w-64 translate-x-1/2 -translate-y-1/2 rounded-full bg-white/5 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-48 w-48 -translate-x-1/4 translate-y-1/3 rounded-full bg-blue-500/20 blur-2xl" />
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 p-6">
              <div>
                <h3 className="font-bold text-gray-900">Recent Leads</h3>
                <p className="text-sm text-gray-500">Latest potential customers added</p>
              </div>
              <Link
                href="/dealer-portal/leads"
                className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                View All Leads <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="p-2">
              {loading ? (
                <div className="space-y-4 p-8">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-50" />
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {stats.recentLeads.length > 0 ? (
                    stats.recentLeads.map((lead) => (
                      <LeadRow
                        key={lead.id}
                        lead={lead}
                        onClick={() => setSelectedLead(lead)}
                      />
                    ))
                  ) : (
                    <>
                      <MockLeadRow
                        name="Nandhu"
                        status="Cold"
                        color="bg-gray-100 text-gray-700"
                        initial="N"
                      />
                      <MockLeadRow
                        name="Rakesh"
                        status="Hot"
                        color="bg-red-50 text-red-600"
                        initial="R"
                      />
                      <MockLeadRow
                        name="Suresh"
                        status="Warm"
                        color="bg-blue-50 text-blue-600"
                        initial="S"
                      />
                      <MockLeadRow
                        name="Anjali"
                        status="Hot"
                        color="bg-red-50 text-red-600"
                        initial="A"
                      />
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function RecentLeadModal({
  lead,
  onClose,
}: {
  lead: LeadItem;
  onClose: () => void;
}) {
  const lastTouch = lead.updated_at || lead.created_at;
  const inactiveDays = lastTouch
    ? Math.floor((Date.now() - new Date(lastTouch).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const overSevenDays = inactiveDays > 7;

  const timeline = [
    { label: 'Lead created', value: formatLeadDate(lead.created_at), done: true },
    { label: 'Latest update', value: formatLeadDate(lead.updated_at || lead.created_at), done: !!lastTouch },
    { label: 'Current status', value: formatLeadLabel(lead.lead_status || 'new'), done: true },
  ];

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-4xl overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-8 py-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#1F5C8F]">
              Recent Lead Snapshot
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">
              {lead.owner_name || 'Unnamed Lead'}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Customer profile, timeline, and workflow quick actions
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-2xl border border-slate-200 p-3 text-slate-400 transition hover:bg-slate-50 hover:text-slate-700"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-6 p-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            {overSevenDays && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-amber-100 p-2 text-amber-700">
                    <AlertCircle className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-amber-900">
                      Last contact is older than 7 days
                    </p>
                    <p className="mt-1 text-sm text-amber-800">
                      This lead may need immediate follow-up to avoid drop-off.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <LeadInfoCard label="Lead ID" value={lead.id} />
              <LeadInfoCard label="Phone" value={lead.owner_contact || 'Not captured'} />
              <LeadInfoCard label="Interest Level" value={formatLeadLabel(lead.interest_level || 'new')} />
              <LeadInfoCard label="Payment Method" value={formatLeadLabel(lead.payment_method || 'pending')} />
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Lead workflow timeline</h3>
                  <p className="text-sm text-slate-500">Quick context for customer handling</p>
                </div>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                  {inactiveDays <= 0 ? 'Updated today' : `${inactiveDays} day${inactiveDays === 1 ? '' : 's'} ago`}
                </span>
              </div>

              <div className="mt-5 space-y-3">
                {timeline.map((item) => (
                  <div key={item.label} className="flex items-center justify-between rounded-2xl bg-white px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`h-2.5 w-2.5 rounded-full ${item.done ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      <p className="text-sm font-medium text-slate-800">{item.label}</p>
                    </div>
                    <p className="text-sm text-slate-500">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[28px] border border-[#D9E8F6] bg-gradient-to-br from-[#F5FAFF] to-white p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1F5C8F]">
                Status Summary
              </p>
              <div className="mt-4 flex items-center gap-3">
                <div className="rounded-2xl bg-white p-3 text-[#1F5C8F] shadow-sm">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-lg font-bold text-slate-900">
                    {formatLeadLabel(lead.lead_status || 'new')}
                  </p>
                  <p className="text-sm text-slate-500">Current workflow status</p>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-slate-200 bg-white p-5">
              <h3 className="text-lg font-bold text-slate-900">Quick actions</h3>
              <div className="mt-4 space-y-3">
                <Link
                  href={`/dealer-portal/leads?new=${lead.id}`}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  View Lead
                  <ChevronRight className="h-4 w-4" />
                </Link>

                <Link
                  href={`/dealer-portal/leads?new=${lead.id}`}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Edit Lead
                  <ChevronRight className="h-4 w-4" />
                </Link>

                <button
                  onClick={onClose}
                  className="w-full rounded-2xl bg-[#1F5C8F] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#173F63]"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LeadInfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function formatLeadDate(value?: string | null) {
  if (!value) return 'Not available';
  return new Date(value).toLocaleString();
}

function formatLeadLabel(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const TruckStart = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
    <path d="M15 18H9" />
    <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
    <circle cx="17" cy="18" r="2" />
    <circle cx="7" cy="18" r="2" />
  </svg>
);

function LockedActionCard({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 opacity-95">
      <div className="flex items-start justify-between">
        <div className="w-fit rounded-xl bg-gray-200 p-3 text-gray-500">{icon}</div>
        <div className="rounded-xl bg-white p-2 text-gray-400">
          <Lock className="h-5 w-5" />
        </div>
      </div>

      <h3 className="mt-10 text-xl font-bold text-gray-500">{title}</h3>
      <p className="mt-2 text-sm text-gray-400">{description}</p>
      <p className="mt-5 text-sm font-medium text-gray-500">
        Available after account approval
      </p>
    </div>
  );
}

function ReviewTimelineCard() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-start gap-3">
        <div className="rounded-2xl bg-emerald-50 p-3">
          <ShieldCheck className="h-6 w-6 text-emerald-700" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-gray-900">Review in progress</h3>
          <p className="text-sm text-gray-500">What happens next</p>
        </div>
      </div>

      <div className="space-y-4">
        <StepRow done label="Application submitted" />
        <StepRow active label="Compliance & business verification" />
        <StepRow label="Final approval & account activation" />
      </div>
    </div>
  );
}

function StepRow({
  label,
  done = false,
  active = false,
}: {
  label: string;
  done?: boolean;
  active?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
      <div
        className={`h-3 w-3 rounded-full ${
          done ? 'bg-emerald-500' : active ? 'bg-amber-500' : 'bg-slate-300'
        }`}
      />
      <span
        className={`text-sm font-medium ${
          done || active ? 'text-slate-800' : 'text-slate-500'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function SupportCard() {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-start gap-3">
        <div className="rounded-2xl bg-cyan-50 p-3">
          <LifeBuoy className="h-6 w-6 text-cyan-700" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-gray-900">Need help?</h3>
          <p className="text-sm text-gray-500">Contact onboarding support</p>
        </div>
      </div>

      <p className="text-sm leading-6 text-slate-600">
        If your onboarding is taking longer than expected or any document needs correction,
        contact the support team for assistance.
      </p>

      <button className="mt-5 rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
        Contact Support
      </button>
    </div>
  );
}

function MockLeadRow({
  name,
  status,
  color,
  initial,
}: {
  name: string;
  status: string;
  color: string;
  initial: string;
}) {
  return (
    <div className="group flex cursor-pointer items-center justify-between rounded-xl p-4 transition-colors hover:bg-gray-50">
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 font-bold text-gray-600">
          {initial}
        </div>
        <span className="font-medium text-gray-900">{name}</span>
      </div>
      <span className={`rounded-full px-3 py-1 text-xs font-medium ${color}`}>{status}</span>
    </div>
  );
}

function LeadRow({
  lead,
  onClick,
}: {
  lead: LeadItem;
  onClick: () => void;
}) {
  const getStatusColor = (status: string) => {
    switch ((status || '').toLowerCase()) {
      case 'hot':
        return 'bg-red-50 text-red-600';
      case 'warm':
        return 'bg-blue-50 text-blue-600';
      case 'cold':
        return 'bg-gray-100 text-gray-700';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full cursor-pointer items-center justify-between rounded-xl p-4 text-left transition-colors hover:bg-gray-50"
    >
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-sm font-bold uppercase text-brand-600">
          {lead.owner_name?.[0] || 'U'}
        </div>
        <div>
          <p className="font-medium text-gray-900">{lead.owner_name || 'Unnamed Lead'}</p>
          <p className="text-sm text-gray-500">{lead.id}</p>
        </div>
      </div>
      <span
        className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${getStatusColor(
          lead.interest_level || 'new'
        )}`}
      >
        {lead.interest_level || 'New'}
      </span>
    </button>
  );
}