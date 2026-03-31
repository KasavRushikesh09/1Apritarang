'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    CheckCircle2, User, Loader2, Banknote, Filter,
    X, AlertCircle, Scan, Plus, Info,
    Calendar, ChevronRight, Camera, Shield, ChevronLeft,
    Sparkles, HelpCircle, Save, ArrowRight
} from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { DatePicker } from '@/components/ui/date-picker';

const workflowSteps = [
    { id: 1, title: 'Customer Info', icon: User },
    { id: 2, title: 'Loan Details', icon: Banknote },
    { id: 3, title: 'Classification', icon: Filter },
];

function NewLeadWizardContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const step = parseInt(searchParams.get('step') || '1');
    const fromScraped = searchParams.get('from_scraped');
    const prefillName = searchParams.get('name');
    const prefillPhone = searchParams.get('phone');
    const { user } = useAuth();

    // Session/Core State
    const [leadId, setLeadId] = useState<string | null>(null);
    const [referenceId, setReferenceId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [initLoading, setInitLoading] = useState(true);
    const [lastSaved, setLastSaved] = useState<string | null>(null);
    const [isModified, setIsModified] = useState(false);

    // Form State
    const [formData, setFormData] = useState<any>({
        full_name: '',
        phone: '',
        father_or_husband_name: '',
        dob: '',
        current_address: '',
        permanent_address: '',
        is_current_same: false,
        product_category_id: '',
        product_type_id: '',
        primary_product_id: '',
        interested_in: [],
        vehicle_rc: '',
        vehicle_ownership: '',
        vehicle_owner_name: '',
        vehicle_owner_phone: '',
        interest_level: 'hot',
        payment_method: 'finance', // 'upfront' or 'finance'
        asset_model: '', // stores category slug for API calls
        asset_model_label: '', // stores category display name
        is_vehicle_category: false, // true for 2W/3W/4W categories
    });

    // Multi-product state
    const [additionalProducts, setAdditionalProducts] = useState<{ category_id: string; product_id: string; category_name: string }[]>([]);
    const [outOfStockProducts, setOutOfStockProducts] = useState<string[]>([]);

    // Validation/UI State
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [apiError, setApiError] = useState<string | null>(null);
    const [duplicateMatch, setDuplicateMatch] = useState<any>(null);
    const [categories, setCategories] = useState<any[]>([]);
    const [products, setProducts] = useState<any[]>([]);
    const [showOCR, setShowOCR] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const [showDraftPrompt, setShowDraftPrompt] = useState(false);
    const [hasDraft, setHasDraft] = useState(false);


    // 1) Initialize/Resume Draft
    const initDraft = async (fresh = false) => {
        setInitLoading(true);
        setApiError(null);
        try {
            const res = await fetch('/api/leads/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initializeDraft: true, fresh })
            });
            const result = await res.json();
            if (result.success) {
                setLeadId(result.data.leadId);
                setReferenceId(result.data.referenceId);
                if (result.data.formData && !fresh) {
                    // Check if the draft has any real data
                    const fd = result.data.formData;
                    const hasData = fd.full_name || fd.phone || fd.dob || fd.father_or_husband_name;
                    if (hasData && result.data.resumed) {
                        setHasDraft(true);
                        setShowDraftPrompt(true);
                        setFormData((prev: any) => ({ ...prev, ...fd }));
                        setLastSaved('Draft resumed');
                    } else {
                        setFormData((prev: any) => ({ ...prev, ...fd }));
                    }
                }
            } else {
                setApiError(result.error?.message || "Initialization failed. Please retry.");
            }
        } catch (e) {
            setApiError("Connection lost. Please try again.");
        } finally {
            setInitLoading(false);
        }
    };

    const handleStartFresh = async () => {
        setShowDraftPrompt(false);
        setFormData({
            full_name: '', phone: '', father_or_husband_name: '', dob: '',
            current_address: '', permanent_address: '', is_current_same: false,
            product_category_id: '', product_type_id: '', primary_product_id: '',
            interested_in: [], vehicle_rc: '', vehicle_ownership: '',
            vehicle_owner_name: '', vehicle_owner_phone: '', interest_level: 'hot',
            payment_method: 'finance', asset_model: '', asset_model_label: '', is_vehicle_category: false,
        });
        setLeadId(null);
        setReferenceId(null);
        setIsModified(false);
        await initDraft(true);
    };

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const fresh = params.get('fresh') === 'true';
        initDraft(fresh);
    }, []);

    useEffect(() => {
        if (prefillName || prefillPhone) {
            setFormData((prev: any) => ({
                ...prev,
                full_name: prefillName || prev.full_name,
                phone: prefillPhone || prev.phone,
            }));
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // 2) Data Loading
    useEffect(() => {
        fetch('/api/inventory/categories').then(r => r.json()).then(d => d.success && setCategories(d.data));
    }, []);

    useEffect(() => {
        if (formData.asset_model) {
            fetch(`/api/inventory/products?category=${encodeURIComponent(formData.asset_model)}`)
                .then(r => r.json())
                .then(d => {
                    if (d.success) {
                        setProducts(d.data);
                        // Track out-of-stock products
                        const oos = d.data.filter((p: any) => p.available_quantity === 0).map((p: any) => p.id);
                        setOutOfStockProducts(oos);
                    }
                });
        }
    }, [formData.asset_model]);

    // 3) Handlers & Normalization
    const updateField = (field: string, value: any) => {
        let fin = value;
        // Auto-capitalize words for names
        if (['full_name', 'father_or_husband_name', 'vehicle_owner_name'].includes(field)) {
            fin = value.split(' ').map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
        }
        if (field === 'vehicle_rc') fin = value.toUpperCase();

        setFormData((prev: any) => {
            const next = { ...prev, [field]: fin };
            if (field === 'is_current_same' && fin) next.permanent_address = next.current_address;
            if (field === 'current_address' && next.is_current_same) next.permanent_address = fin;
            return next;
        });
        setIsModified(true);
        if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
    };

    const handlePhoneBlur = async () => {
        if (!formData.phone || formData.phone.length < 10) return;
        try {
            const res = await fetch(`/api/leads/check-duplicate?phone=${encodeURIComponent(formData.phone)}`);
            const data = await res.json();
            if (data.success && data.data.length > 0) {
                setDuplicateMatch(data.data[0]);
            } else {
                setDuplicateMatch(null);
            }
        } catch (e) { console.error("Duplicate check failed"); }
    };

    const calculateAge = (dob: string) => {
        if (!dob) return 0;
        return new Date().getFullYear() - new Date(dob).getFullYear();
    };

    const validate = () => {
        const e: any = {};
        if (!formData.full_name || formData.full_name.trim().length < 2) e.full_name = "Min 2 chars";
        if (!formData.phone || formData.phone.length < 10) e.phone = "Invalid phone";
        if (!formData.dob) e.dob = "Required";
        else if (calculateAge(formData.dob) < 18) e.dob = "Must be 18+";
        if (!formData.product_category_id) e.product_category_id = "Required";
        if (!formData.primary_product_id) e.primary_product_id = "Required";
        if (formData.current_address && formData.current_address.length < 10) e.current_address = "Address too short";

        const isVehicle = formData.is_vehicle_category;
        if (isVehicle && formData.vehicle_rc?.trim()) {
            if (!formData.vehicle_ownership) e.vehicle_ownership = "*";
            if (!formData.vehicle_owner_name) e.vehicle_owner_name = "*";
            if (!formData.vehicle_owner_phone) e.vehicle_owner_phone = "*";
        }
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const commitStep = async () => {
        if (!leadId) {
            setApiError("Lead draft not initialized. Please refresh the page and try again.");
            return;
        }
        if (!validate()) return;
        setShowConfirm(true);
    };

    const handleFinalConfirm = async () => {
        setShowConfirm(false);
        setLoading(true);
        // Auto-assign lead score based on interest level
        const leadScoreMap: Record<string, number> = { hot: 90, warm: 60, cold: 30 };
        const leadScore = leadScoreMap[formData.interest_level] || 30;

        try {
            const res = await fetch('/api/leads/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    leadId,
                    commitStep: true,
                    lead_score: leadScore,
                    additional_products: additionalProducts,
                })
            });
            const result = await res.json();
            if (result.success) {
                const { leadId: updatedLeadId } = result.data;
                // If coming from scraper, link the converted lead
                if (fromScraped && updatedLeadId) {
                    fetch(`/api/scraper/leads/${fromScraped}/convert`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ converted_lead_id: updatedLeadId }),
                    }).catch(console.error);
                }
                const isFinanceMethod = ['finance', 'other_finance', 'dealer_finance'].includes(formData.payment_method);
                if (formData.payment_method === 'upfront') {
                    router.push(`/dealer-portal/leads`);
                } else if (formData.interest_level === 'hot' && isFinanceMethod) {
                    // Hot leads with finance: auto-navigate to Step 2 (KYC + Payment)
                    router.push(`/dealer-portal/leads/${updatedLeadId}/kyc`);
                } else if (formData.interest_level === 'hot') {
                    router.push(`/dealer-portal/leads/${updatedLeadId}/kyc`);
                } else {
                    router.push(`/dealer-portal/leads`);
                }
            } else {
                const details = result.error?.details?.map((d: any) => `${d.path}: ${d.message}`).join(', ');
                setApiError(details ? `Validation error — ${details}` : (result.error?.message || "Server Error"));
            }
        } catch (err) {
            setApiError("Connection failed. Please retry.");
        } finally {
            setLoading(false);
        }
    };

    const handleCancel = async () => {
        if (!isModified) { router.push('/dealer-portal'); return; }
        if (confirm("Discard draft?")) {
            if (leadId) await fetch(`/api/leads/draft/${leadId}`, { method: 'DELETE' });
            router.push('/dealer-portal');
        }
    };

    if (initLoading) return <div className="min-h-screen flex items-center justify-center bg-[#F8F9FB]"><Loader2 className="w-10 h-10 animate-spin text-[#1D4ED8]" /></div>;

    if (!leadId && apiError) return (
        <div className="min-h-screen flex items-center justify-center bg-[#F8F9FB]">
            <div className="text-center space-y-4">
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
                <p className="text-red-600 font-medium">{apiError}</p>
                <button onClick={initDraft} className="px-6 py-2 bg-[#1D4ED8] text-white rounded-lg hover:bg-[#1E40AF]">
                    Retry
                </button>
            </div>
        </div>
    );

    const isVehicleCategory = formData.is_vehicle_category;

    return (
        <div className="min-h-screen bg-[#F8F9FB]">
            {/* Draft resume prompt */}
            {showDraftPrompt && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 space-y-4">
                        <h3 className="text-lg font-bold text-gray-900">Resume Previous Draft?</h3>
                        <p className="text-sm text-gray-600">
                            You have an unsaved lead draft from a previous session. Would you like to continue where you left off?
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={handleStartFresh}
                                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                Start Fresh
                            </button>
                            <button
                                onClick={() => setShowDraftPrompt(false)}
                                className="flex-1 px-4 py-2.5 bg-[#1D4ED8] text-white rounded-xl font-medium hover:bg-[#1E40AF] transition-colors"
                            >
                                Resume Draft
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Main container with increased bottom padding to avoid sticky footer overlap */}
            <div className="max-w-[1200px] mx-auto px-6 py-8 pb-40">
                {/* HEADER AREA */}
                <header className="mb-8 flex justify-between items-start">
                    <div className="flex gap-4">
                        <button onClick={() => router.back()} className="mt-1 p-2 hover:bg-white transition-colors rounded-lg">
                            <ChevronLeft className="w-6 h-6 text-gray-900" />
                        </button>
                        <div>
                            <h1 className="text-[28px] font-black text-gray-900 leading-tight tracking-tight">Create New Lead</h1>
                            <p className="text-sm text-gray-500 mt-0.5">
                                Reference ID: <span className="font-medium">{referenceId || '#IT-XXXX-XXXXXXX'}</span>
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col items-end gap-5">
                        <div className="flex items-center gap-12">
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-right mb-1.5">Workflow Progress</p>
                                <div className="flex items-center gap-6">
                                    <span className="text-xs font-bold text-[#1D4ED8] whitespace-nowrap">Step {step} of 5</span>
                                    <div className="flex gap-2.5">
                                        {[1, 2, 3, 4, 5].map(s => (
                                            <div key={s} className={`h-[6px] w-[50px] rounded-full transition-all duration-300 ${s <= step ? 'bg-[#0047AB]' : 'bg-gray-200'}`} />
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setShowHelp(true)} className="p-2 text-gray-400 hover:text-gray-600 transition-all">
                                <Info className="w-6 h-6" />
                            </button>
                        </div>

                        <button
                            onClick={() => setShowOCR(true)}
                            className="flex items-center gap-3 px-6 py-2.5 bg-white border border-gray-200 rounded-xl font-bold text-sm text-gray-800 shadow-sm hover:border-[#1D4ED8] hover:text-[#1D4ED8] transition-all"
                        >
                            <Scan className="w-5 h-5" />
                            Auto-fill from ID
                        </button>
                    </div>
                </header>

                {/* ERROR/WARNING BANNERS */}
                <div className="mb-6 space-y-4">
                    {apiError && (
                        <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-center justify-between">
                            <div className="flex items-center gap-3 text-red-700 font-medium text-sm">
                                <AlertCircle className="w-5 h-5" />
                                {apiError}
                            </div>
                            <button onClick={() => setApiError(null)} className="p-1 hover:bg-white rounded-md transition-colors"><X className="w-5 h-5" /></button>
                        </div>
                    )}
                </div>

                {/* MAIN FORM */}
                <main className="grid grid-cols-1 gap-6">
                    {step === 1 && (
                        <>
                            {/* PERSONAL INFO */}
                            <Card title="Personal Information">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                                    <InputField label="Full Name" value={formData.full_name} onChange={(v: string) => updateField('full_name', v)} error={errors.full_name} placeholder="Vijay Sharma" />
                                    <InputField label="Father/Husband Name" value={formData.father_or_husband_name} onChange={(v: string) => updateField('father_or_husband_name', v)} error={errors.father_or_husband_name} placeholder="Richard Doe" />

                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-gray-900 px-1">Date of Birth</label>
                                        <DatePicker
                                            value={formData.dob ?? ''}
                                            onChange={(v: string) => updateField('dob', v)}
                                            minAge={18}
                                            error={!!errors.dob}
                                        />
                                        {errors.dob && <p className="text-xs text-red-500 px-1">{errors.dob}</p>}
                                    </div>

                                    <InputField label="Phone Number" value={formData.phone} onChange={(v: string) => updateField('phone', v)} onBlur={handlePhoneBlur} error={errors.phone} placeholder="9876543210" />

                                    <div className="md:col-span-2 space-y-2">
                                        <label className="text-sm font-bold text-gray-900 px-1">Current Address</label>
                                        <textarea
                                            value={formData.current_address ?? ''}
                                            onChange={(e) => updateField('current_address', e.target.value)}
                                            className={`w-full min-h-[60px] px-4 py-3 bg-white border-2 rounded-xl outline-none transition-all placeholder-gray-400 focus:border-[#1D4ED8] focus:ring-4 focus:ring-blue-50/50 text-sm ${errors.current_address ? 'border-red-500' : 'border-[#EBEBEB]'}`}
                                            placeholder="123, Main Street, City, State - 123456"
                                        />
                                    </div>

                                    <div className="md:col-span-2 space-y-2">
                                        <div className="flex items-center justify-between px-1">
                                            <label className="text-sm font-bold text-gray-900">Permanent Address</label>
                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                <div className="relative">
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.is_current_same}
                                                        onChange={(e) => updateField('is_current_same', e.target.checked)}
                                                        className="peer sr-only"
                                                    />
                                                    <div className="w-4 h-4 rounded-full border-2 border-gray-300 peer-checked:border-[#0047AB] peer-checked:bg-[#0047AB] transition-all flex items-center justify-center">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-white scale-0 peer-checked:scale-100 transition-all" />
                                                    </div>
                                                </div>
                                                <span className="text-xs font-medium text-gray-600 transition-colors group-hover:text-gray-900">Same as current address</span>
                                            </label>
                                        </div>
                                        <textarea
                                            value={formData.permanent_address ?? ''}
                                            disabled={formData.is_current_same}
                                            onChange={(e) => updateField('permanent_address', e.target.value)}
                                            className={`w-full min-h-[60px] px-4 py-3 bg-white border-2 rounded-xl outline-none transition-all placeholder-gray-400 focus:border-[#1D4ED8] focus:ring-4 focus:ring-blue-50/50 text-sm ${formData.is_current_same ? 'bg-gray-50 border-[#F5F5F5] text-gray-400' : 'border-[#EBEBEB]'}`}
                                            placeholder="123, Main Street, City, State - 123456"
                                        />
                                    </div>
                                </div>
                            </Card>

                            {/* PRODUCT + VEHICLE PAIR */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                                <Card title="Product Details" className="lg:col-span-2">
                                    <div className="space-y-6">
                                        <SelectField
                                            label="Product Category"
                                            value={formData.asset_model}
                                            onChange={(v: string) => {
                                                const cat = categories.find((c: any) => c.slug === v);
                                                setFormData((p: any) => ({ ...p, asset_model: cat?.slug || v, asset_model_label: cat?.name || v, is_vehicle_category: cat?.isVehicleCategory || false, product_category_id: cat?.id || '', primary_product_id: '' }));
                                                setIsModified(true);
                                            }}
                                            placeholder="Select from Current Inventory"
                                        >
                                            {categories.map((c: any) => <option key={c.id} value={c.slug}>{c.name}</option>)}
                                        </SelectField>

                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-gray-900 px-1">Primary Product <span className="text-red-500">*</span></label>
                                            <div className="relative">
                                                <select
                                                    value={formData.primary_product_id ?? ''}
                                                    onChange={e => updateField('primary_product_id', e.target.value)}
                                                    className={`w-full h-11 px-6 bg-white border-2 rounded-xl outline-none appearance-none transition-all focus:border-[#1D4ED8] focus:ring-4 focus:ring-blue-50/50 text-sm cursor-pointer ${errors.primary_product_id ? 'border-red-500' : 'border-[#EBEBEB]'} ${!formData.primary_product_id ? 'text-gray-400' : 'text-gray-900'}`}
                                                >
                                                    <option value="" disabled>Select primary product</option>
                                                    {products.map((p: any) => (
                                                        <option key={p.id} value={p.id}>
                                                            {p.name} {outOfStockProducts.includes(p.id) ? '(Out of Stock)' : ''}
                                                        </option>
                                                    ))}
                                                </select>
                                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                                    <ChevronRight className="w-4 h-4 rotate-90" />
                                                </div>
                                            </div>
                                            {outOfStockProducts.includes(formData.primary_product_id) && (
                                                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg mt-2">
                                                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                                                    <span className="text-xs font-medium text-amber-700">This product is out of stock. Consider ordering from OEM.</span>
                                                </div>
                                            )}
                                            {errors.primary_product_id && <p className="text-[10px] text-red-500 font-bold px-1 mt-1">{errors.primary_product_id}</p>}
                                        </div>

                                        <SelectField
                                            label="Product Type"
                                            value={formData.product_type_id}
                                            onChange={(v: string) => updateField('product_type_id', v)}
                                            placeholder="Select Product type"
                                        >
                                            <option value="consumer">Consumer</option>
                                            <option value="commercial">Commercial</option>
                                        </SelectField>

                                        {/* Additional Products */}
                                        {additionalProducts.map((ap, idx) => (
                                            <div key={idx} className="flex items-end gap-3 bg-gray-50 p-4 rounded-xl border border-gray-100">
                                                <div className="flex-1">
                                                    <label className="text-xs font-bold text-gray-600 px-1 mb-1 block">Additional Product {idx + 1}</label>
                                                    <select
                                                        value={ap.product_id}
                                                        onChange={e => {
                                                            const updated = [...additionalProducts];
                                                            updated[idx].product_id = e.target.value;
                                                            setAdditionalProducts(updated);
                                                            setIsModified(true);
                                                        }}
                                                        className="w-full h-10 px-4 bg-white border-2 border-[#EBEBEB] rounded-xl text-sm outline-none focus:border-[#1D4ED8]"
                                                    >
                                                        <option value="">Select product</option>
                                                        {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                                    </select>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        setAdditionalProducts(prev => prev.filter((_, i) => i !== idx));
                                                        setIsModified(true);
                                                    }}
                                                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}

                                        <button
                                            onClick={() => {
                                                setAdditionalProducts(prev => [...prev, { category_id: formData.product_category_id, product_id: '', category_name: formData.asset_model }]);
                                                setIsModified(true);
                                            }}
                                            className="flex items-center gap-2 text-sm font-bold text-[#0047AB] hover:text-[#003580] transition-colors px-1"
                                        >
                                            <Plus className="w-4 h-4" />
                                            Add Another Product
                                        </button>
                                    </div>
                                </Card>

                                <Card title={isVehicleCategory ? "Existing Vehicle Information" : "Vehicle Details"} className="lg:col-span-3">
                                    {!isVehicleCategory && (
                                        <p className="text-sm text-gray-400 font-medium px-1 mb-4">Vehicle details are only applicable for 2W/3W/4W categories.</p>
                                    )}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-6">
                                        <InputField
                                            label="Vehicle Reg. Number"
                                            placeholder="HR 35 A 78989"
                                            value={formData.vehicle_rc}
                                            onChange={(v: string) => updateField('vehicle_rc', v)}
                                        />
                                        <SelectField
                                            label={`Vehicle Ownership${formData.vehicle_rc?.trim() ? ' *' : ''}`}
                                            value={formData.vehicle_ownership}
                                            onChange={(v: string) => updateField('vehicle_ownership', v)}
                                            placeholder="Select ownership"
                                            error={errors.vehicle_ownership}
                                        >
                                            <option>Self</option>
                                            <option>Financed</option>
                                            <option>Company</option>
                                            <option>Leased</option>
                                            <option>Family</option>
                                        </SelectField>
                                        <InputField
                                            label={`Owner Full Name${formData.vehicle_rc?.trim() ? ' *' : ''}`}
                                            value={formData.vehicle_owner_name}
                                            onChange={(v: string) => updateField('vehicle_owner_name', v)}
                                            placeholder="Vijay Sharma"
                                            error={errors.vehicle_owner_name}
                                        />
                                        <InputField
                                            label={`Owner Phone${formData.vehicle_rc?.trim() ? ' *' : ''}`}
                                            value={formData.vehicle_owner_phone}
                                            onChange={(v: string) => updateField('vehicle_owner_phone', v)}
                                            placeholder="+91 9876543210"
                                            error={errors.vehicle_owner_phone}
                                        />
                                    </div>
                                    {formData.vehicle_rc?.trim() && (
                                        <div className="mt-4 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg">
                                            <p className="text-xs font-medium text-blue-700">You&apos;ve entered vehicle details. Ownership, Owner Name, and Owner Phone are now required.</p>
                                        </div>
                                    )}
                                </Card>
                            </div>

                            <Card title="Lead Classification">
                                <div className="space-y-6">
                                    <label className="text-sm font-bold text-gray-900 px-1">Lead Interest Level</label>
                                    <div className="flex bg-[#F1F3F5] rounded-[14px] p-1.5">
                                        {(['hot', 'warm', 'cold'] as const).map((lvl) => {
                                            const scoreMap = { hot: 90, warm: 60, cold: 30 };
                                            const colorMap = { hot: 'bg-red-500', warm: 'bg-amber-500', cold: 'bg-blue-400' };
                                            return (
                                                <button
                                                    key={lvl}
                                                    onClick={() => updateField('interest_level', lvl)}
                                                    className={`flex-1 py-3 text-sm font-bold rounded-[10px] transition-all capitalize tracking-tight ${formData.interest_level === lvl ? 'bg-[#0047AB] text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                                                >
                                                    {lvl}
                                                    {formData.interest_level === lvl && (
                                                        <span className="ml-2 text-[10px] opacity-80">Score: {scoreMap[lvl]}</span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {/* Payment Method */}
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-gray-900 px-1">Payment Method</label>
                                        <div className="flex bg-[#F1F3F5] rounded-[14px] p-1.5">
                                            {([
                                                { value: 'finance', label: 'Finance / Loan', icon: '🏦' },
                                                { value: 'upfront', label: 'Cash / Upfront', icon: '💵' },
                                            ] as const).map((opt) => (
                                                <button
                                                    key={opt.value}
                                                    onClick={() => updateField('payment_method', opt.value)}
                                                    className={`flex-1 py-3 text-sm font-bold rounded-[10px] transition-all tracking-tight ${formData.payment_method === opt.value ? 'bg-[#0047AB] text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                                                >
                                                    {opt.icon} {opt.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="px-4 py-3 bg-gray-50 rounded-xl border border-gray-100">
                                        {formData.payment_method === 'upfront' ? (
                                            <p className="text-xs font-medium text-gray-600">
                                                <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2" />
                                                <strong>Cash/Upfront Payment:</strong> KYC verification will be skipped. Lead goes directly to product selection.
                                            </p>
                                        ) : formData.interest_level === 'hot' ? (
                                            <p className="text-xs font-medium text-gray-600">
                                                <span className="inline-block w-2 h-2 bg-red-500 rounded-full mr-2" />
                                                <strong>Hot Lead:</strong> After creating, you will proceed directly to KYC (Step 2).
                                            </p>
                                        ) : (
                                            <p className="text-xs font-medium text-gray-600">
                                                <span className={`inline-block w-2 h-2 ${formData.interest_level === 'warm' ? 'bg-amber-500' : 'bg-blue-400'} rounded-full mr-2`} />
                                                <strong>{formData.interest_level === 'warm' ? 'Warm' : 'Cold'} Lead:</strong> After creating, the lead will be saved and you will return to the leads list.
                                            </p>
                                        )}
                                    </div>

                                    {/* Note: Facilitation fee payment is now handled on Step 2 (KYC page) */}
                                </div>
                            </Card>
                        </>
                    )}
                </main>

                <div className="sticky bottom-0 left-0 right-0 bg-[#F8F9FB] pt-4 pb-8 z-50">
                    <div className="max-w-[1200px] mx-auto px-6">
                        <div className="flex justify-between items-center bg-white border border-gray-100 rounded-[20px] px-8 py-5 shadow-[0_-8px_30px_rgb(0,0,0,0.04)]">
                            <div className="flex items-center gap-3">
                                <div className="bg-gray-100 px-4 py-1.5 rounded-full">
                                    <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest leading-none">Last saved: {lastSaved || 'Just now'}</span>
                                </div>
                            </div>
                            <div className="flex gap-4">
                                <button
                                    onClick={handleCancel}
                                    className="px-8 py-2.5 border-2 border-[#EBEBEB] rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={commitStep}
                                    disabled={loading}
                                    className="px-10 py-2.5 bg-[#0047AB] text-white rounded-xl text-sm font-bold hover:bg-[#003580] transition-all flex items-center gap-2 disabled:opacity-50"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Lead'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* MODALS - These render nothing if not open, preventing invisible overlays */}
            <OCRModal isOpen={showOCR} onClose={() => setShowOCR(false)} leadId={leadId} onResult={(data: any) => {
                setFormData((p: any) => ({ ...p, ...data }));
                setIsModified(true);
            }} />
            <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />

            {/* CONFIRMATION MODAL */}
            {showConfirm && (
                <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-sm p-10 text-center shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Save className="w-8 h-8 text-[#0047AB]" />
                        </div>
                        <h2 className="text-2xl font-black text-gray-900 mb-3 tracking-tight">Create Lead?</h2>
                        <p className="text-sm text-gray-500 mb-10 leading-relaxed font-medium">Are you sure you want to finalize Step 1 and create this lead record?</p>
                        <div className="flex flex-col gap-4">
                            <button onClick={handleFinalConfirm} className="w-full py-4 bg-[#0047AB] text-white rounded-2xl font-bold tracking-tight shadow-xl shadow-blue-200">Yes, Create Lead</button>
                            <button onClick={() => setShowConfirm(false)} className="w-full py-3 text-sm font-bold text-gray-400 hover:text-gray-700 transition-colors">Go Back</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// UI HELPERS
function Card({ title, children, className = "" }: { title: string, children: React.ReactNode, className?: string }) {
    return (
        // Removed overflow-hidden to prevent clipping of inputs or focus rings
        <div className={`bg-white rounded-[24px] border border-[#E9ECEF] shadow-[0_8px_30px_rgb(0,0,0,0.02)] min-h-fit ${className}`}>
            <div className="flex items-center gap-4 px-8 pt-8 pb-4">
                <div className="w-[3px] h-6 bg-[#0047AB] rounded-full" />
                <h3 className="text-lg font-black text-gray-900 tracking-tight">{title}</h3>
            </div>
            <div className="p-8 pt-4">
                {children}
            </div>
        </div>
    );
}

function InputField({ label, value, onChange, placeholder, error, type = "text", onBlur, required }: any) {
    return (
        <div className="space-y-2">
            <label className="text-sm font-bold text-gray-900 px-1">
                {label} {required && <span className="text-red-500">*</span>}
            </label>
            <input
                type={type}
                value={value ?? ''}
                onChange={e => onChange(e.target.value)}
                onBlur={onBlur}
                placeholder={placeholder}
                className={`w-full h-11 px-6 bg-white border-2 rounded-xl outline-none transition-all placeholder-gray-300 focus:border-[#1D4ED8] focus:ring-4 focus:ring-blue-50/50 text-sm ${error ? 'border-red-500' : 'border-[#EBEBEB]'}`}
            />
            {error && <p className="text-[10px] text-red-500 font-bold px-1 mt-1">{error}</p>}
        </div>
    );
}

function SelectField({ label, value, onChange, children, error, placeholder }: any) {
    return (
        <div className="space-y-2">
            <label className="text-sm font-bold text-gray-900 px-1">{label}</label>
            <div className="relative">
                <select
                    value={value ?? ''}
                    onChange={e => onChange(e.target.value)}
                    className={`w-full h-11 px-6 bg-white border-2 rounded-xl outline-none appearance-none transition-all focus:border-[#1D4ED8] focus:ring-4 focus:ring-blue-50/50 text-sm cursor-pointer ${error ? 'border-red-500' : 'border-[#EBEBEB]'} ${!value ? 'text-gray-400' : 'text-gray-900'}`}
                >
                    <option value="" disabled>{placeholder}</option>
                    {children}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                    <ChevronRight className="w-4 h-4 rotate-90" />
                </div>
            </div>
            {error && <p className="text-[10px] text-red-500 font-bold px-1 mt-1">{error}</p>}
        </div>
    );
}

function HelpModal({ isOpen, onClose }: any) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[80vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 rounded-xl text-[#0047AB]">
                            <Info className="w-6 h-6" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-900">Step 1 Guide</h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-400" /></button>
                </div>
                <div className="space-y-5 text-sm text-gray-600 leading-relaxed">
                    <div>
                        <h3 className="font-bold text-gray-900 mb-1">Required Fields</h3>
                        <ul className="list-disc pl-4 space-y-1">
                            <li><strong>Full Name</strong> - 2-100 characters, letters and spaces only</li>
                            <li><strong>Date of Birth</strong> - Must be 18+ years old</li>
                            <li><strong>Phone Number</strong> - 10-digit Indian mobile number</li>
                            <li><strong>Product Category</strong> - Select from inventory</li>
                            <li><strong>Primary Product</strong> - Required selection</li>
                        </ul>
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-900 mb-1">Loan Compliance</h3>
                        <p>Father/Husband Name becomes mandatory if the selected product requires a loan in later steps.</p>
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-900 mb-1">Vehicle Details</h3>
                        <p>If you enter a Vehicle Registration Number, then Ownership, Owner Name, and Owner Phone become required fields.</p>
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-900 mb-1">Lead Classification</h3>
                        <ul className="list-disc pl-4 space-y-1">
                            <li><strong>Hot</strong> (Score: 90) - Proceeds to KYC step automatically</li>
                            <li><strong>Warm</strong> (Score: 60) - Saves and exits workflow</li>
                            <li><strong>Cold</strong> (Score: 30) - Saves and exits workflow</li>
                        </ul>
                    </div>
                    <div>
                        <h3 className="font-bold text-gray-900 mb-1">Auto-fill</h3>
                        <p>Use the &quot;Auto-fill from ID&quot; button to extract details from Aadhaar card scans (PNG, JPEG, PDF, max 5MB).</p>
                    </div>
                </div>
                <button onClick={onClose} className="w-full mt-8 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-colors">Got it</button>
            </div>
        </div>
    );
}

function OCRModal({ isOpen, onClose, onResult, leadId }: any) {
    const [status, setStatus] = useState<'idle' | 'uploading' | 'scanning' | 'done' | 'error'>('idle');
    const [msg, setMsg] = useState('');
    const [progress, setProgress] = useState(0);

    if (!isOpen) return null;

    const checkImageQuality = async (file: File) => {
        if (file.type === 'application/pdf') return true; // skip dimension check for pdf
        return new Promise<boolean>((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img.width >= 600 && img.height >= 600);
            img.onerror = () => resolve(false);
            img.src = URL.createObjectURL(file);
        });
    };

    const handleScan = async () => {
        const front = (document.getElementById('aadhaarFront') as HTMLInputElement).files?.[0];
        const back = (document.getElementById('aadhaarBack') as HTMLInputElement).files?.[0];
        if (!front || !back) { setMsg("Upload both sides to continue"); return; }

        setMsg('');
        const [okFront, okBack] = await Promise.all([checkImageQuality(front), checkImageQuality(back)]);
        if (!okFront || !okBack) {
            setStatus('error');
            setMsg('Image quality too low (min 600px). Please reupload clearer images.');
            return;
        }

        setStatus('uploading');
        setProgress(25);

        const body = new FormData();
        body.append('aadhaarFront', front);
        body.append('aadhaarBack', back);
        if (leadId) body.append('leadId', leadId);
        body.append('idType', 'aadhaar');

        try {
            setProgress(45);
            setStatus('scanning');
            const res = await fetch('/api/leads/autofillRequest', { method: 'POST', body });
            const data = await res.json();
            if (res.ok) {
                setProgress(100);
                onResult(data.data);
                setStatus('done');
                setMsg('Auto-filled from Aadhaar');
                setTimeout(() => { setStatus('idle'); setProgress(0); onClose(); }, 800);
            } else {
                setMsg(data.error?.message || "Service error");
                setStatus('error');
            }
        } catch (err) {
            setMsg("Connection failed");
            setStatus('error');
        }
    };

    return (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-[40px] w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="p-10 border-b border-gray-50 flex justify-between items-start">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900">Auto-fill from ID</h2>
                        <p className="text-sm text-gray-500 mt-1">Extract profile info from Aadhaar card scan.</p>
                    </div>
                    <button onClick={onClose} className="p-3 bg-gray-50 hover:bg-gray-100 rounded-2xl text-gray-400 transition-all"><X className="w-6 h-6" /></button>
                </div>

                <div className="p-10 space-y-8 relative">
                    {(status === 'scanning' || status === 'uploading') && (
                        <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
                            <Loader2 className="w-12 h-12 text-[#0047AB] animate-spin mb-4" />
                            <p className="text-xl font-bold text-gray-900">{status === 'uploading' ? 'Uploading…' : 'Processing…'}</p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-center">
                        {['Front', 'Back'].map(side => (
                            <div key={side} className="space-y-3">
                                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Aadhaar {side}</label>
                                <label className="flex flex-col items-center justify-center h-44 border-2 border-dashed border-gray-100 rounded-[32px] cursor-pointer hover:bg-gray-50 hover:border-[#0047AB]/20 transition-all group overflow-hidden">
                                    <input type="file" id={`aadhaar${side}`} className="hidden" accept="image/png, image/jpeg, application/pdf" />
                                    <div className="p-4 bg-gray-50 rounded-2xl group-hover:bg-[#0047AB]/5 transition-colors mb-3">
                                        <Camera className="w-8 h-8 text-gray-300 group-hover:text-[#0047AB]" />
                                    </div>
                                    <span className="text-xs font-bold text-gray-400 group-hover:text-gray-900">Click to upload</span>
                                </label>
                            </div>
                        ))}
                    </div>

                    {progress > 0 && (
                        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div className="h-2 bg-[#0047AB] transition-all" style={{ width: `${progress}%` }} />
                        </div>
                    )}

                    {msg && (
                        <div className={`p-4 rounded-2xl text-xs font-bold border text-center ${status === 'error' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-700 border-green-100'}`}>
                            {msg}
                        </div>
                    )}
                </div>

                <div className="px-10 py-8 bg-gray-50 flex gap-4">
                    <button onClick={onClose} className="flex-1 py-4 text-sm font-semibold text-gray-400 hover:text-gray-700">Cancel</button>
                    <button
                        onClick={handleScan}
                        disabled={status === 'scanning' || status === 'uploading'}
                        className="flex-[2] py-4 bg-[#0047AB] text-white rounded-2xl font-bold text-sm shadow-xl shadow-blue-200 hover:bg-blue-700 transition-all disabled:opacity-60"
                    >
                        {status === 'scanning' || status === 'uploading' ? 'Processing…' : 'Start Scanning'}
                    </button>
                    {status === 'error' && (
                        <button onClick={handleScan} className="flex-1 py-4 text-sm font-semibold text-gray-600 hover:text-gray-900 border border-gray-200 rounded-2xl">Retry</button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function NewLeadWizard() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#F8F9FB]"><Loader2 className="w-10 h-10 animate-spin text-[#1D4ED8]" /></div>}>
            <NewLeadWizardContent />
        </Suspense>
    );
}
