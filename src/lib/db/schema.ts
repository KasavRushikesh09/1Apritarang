import { pgTable, text, timestamp, integer, boolean, varchar, decimal, jsonb, uuid, index, bigint } from 'drizzle-orm/pg-core';
// import { pgTable, uuid, text, varchar, boolean, timestamp, jsonb, bigint } from "drizzle-orm/pg-core";

import { relations } from 'drizzle-orm';

// --- FOUNDATION ---

export const users = pgTable('users', {
    id: uuid('id').primaryKey(),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    role: varchar('role', { length: 50 }).notNull(),
    dealer_id: varchar('dealer_id', { length: 255 }),
    phone: text('phone'),
    avatar_url: text('avatar_url'),

    // ADD THESE 2 FIELDS
    password_hash: text('password_hash'),
    must_change_password: boolean('must_change_password').notNull().default(false),

    is_active: boolean('is_active').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// --- PHASE 0: MVP ---

export const productCategories = pgTable('product_categories', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull().unique(),
    slug: text('slug').notNull().unique(),
    is_active: boolean('is_active').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const products = pgTable('products', {
    id: uuid('id').primaryKey().defaultRandom(),
    category_id: uuid('category_id').references(() => productCategories.id, { onDelete: 'restrict' }).notNull(),
    name: text('name').notNull(),                        // e.g. "51V 105AH"
    slug: text('slug').notNull(),                        // e.g. "51v-105ah"
    voltage_v: integer('voltage_v'),                     // 51 / 61 / 64 / 72 (null for non-battery)
    capacity_ah: integer('capacity_ah'),                 // 105 / 132 / 153 / 232 (null for non-battery)
    sku: text('sku').notNull().unique(),                 // e.g. "3W-51V-105AH"
    hsn_code: varchar('hsn_code', { length: 8 }),
    asset_type: varchar('asset_type', { length: 50 }),   // Battery, Charger, SOC, Harness, Inverter
    is_serialized: boolean('is_serialized').notNull().default(true),
    warranty_months: integer('warranty_months').notNull().default(0),
    status: varchar('status', { length: 20 }).notNull().default('active'),
    sort_order: integer('sort_order').notNull().default(0),
    is_active: boolean('is_active').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    catSortIdx: index('idx_products_category_sort').on(table.category_id, table.sort_order),
    voltCapIdx: index('idx_products_voltage_capacity').on(table.voltage_v, table.capacity_ah),
}));

export const oems = pgTable('oems', {
    id: varchar('id', { length: 255 }).primaryKey(), // OEM-YYYYMMDD-SEQ
    business_entity_name: text('business_entity_name').notNull(),
    gstin: varchar('gstin', { length: 15 }).notNull().unique(),
    pan: varchar('pan', { length: 10 }),
    address_line1: text('address_line1'),
    address_line2: text('address_line2'),
    city: text('city'),
    state: text('state'),
    pincode: varchar('pincode', { length: 6 }),
    bank_name: text('bank_name'),
    bank_account_number: text('bank_account_number').notNull(),
    ifsc_code: varchar('ifsc_code', { length: 11 }).notNull(),
    bank_proof_url: text('bank_proof_url'),
    status: varchar('status', { length: 20 }).default('active').notNull(),
    created_by: uuid('created_by').references(() => users.id),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const oemContacts = pgTable('oem_contacts', {
    id: varchar('id', { length: 255 }).primaryKey(), // OEM_ID-ROLE_SEQ
    oem_id: varchar('oem_id', { length: 255 }).references(() => oems.id, { onDelete: 'cascade' }).notNull(),
    contact_role: varchar('contact_role', { length: 50 }).notNull(), // sales_head, sales_manager, finance_manager
    contact_name: text('contact_name').notNull(),
    contact_phone: varchar('contact_phone', { length: 20 }).notNull(),
    contact_email: text('contact_email').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const inventory = pgTable('inventory', {
    id: varchar('id', { length: 255 }).primaryKey(), // INV-YYYYMMDD-XXX
    product_id: uuid('product_id').references(() => products.id),
    oem_id: varchar('oem_id', { length: 255 }).references(() => oems.id).notNull(),

    // Denormalized Product Details (SOP 7.4)
    oem_name: text('oem_name').notNull(),
    asset_category: text('asset_category').notNull(),
    asset_type: text('asset_type').notNull(),
    model_type: text('model_type').notNull(),

    // Serialization
    is_serialized: boolean('is_serialized').default(true).notNull(),
    serial_number: varchar('serial_number', { length: 255 }).unique(),
    batch_number: varchar('batch_number', { length: 255 }),
    quantity: integer('quantity'),

    // Dates
    manufacturing_date: timestamp('manufacturing_date', { withTimezone: true }).notNull(),
    expiry_date: timestamp('expiry_date', { withTimezone: true }).notNull(),

    // Financials
    inventory_amount: decimal('inventory_amount', { precision: 12, scale: 2 }).notNull(),
    gst_percent: decimal('gst_percent', { precision: 5, scale: 2 }).notNull(),
    gst_amount: decimal('gst_amount', { precision: 12, scale: 2 }).notNull(),
    final_amount: decimal('final_amount', { precision: 12, scale: 2 }).notNull(),

    // Invoicing
    oem_invoice_number: text('oem_invoice_number').notNull(),
    oem_invoice_date: timestamp('oem_invoice_date', { withTimezone: true }).notNull(),
    oem_invoice_url: text('oem_invoice_url'),

    // Documents
    product_manual_url: text('product_manual_url'),
    warranty_document_url: text('warranty_document_url'),

    // Status
    status: varchar('status', { length: 20 }).default('in_transit').notNull(), // in_transit, pdi_pending, pdi_failed, available, reserved, sold, damaged, returned
    warehouse_location: text('warehouse_location'),

    // Metadata
    created_by: uuid('created_by').references(() => users.id).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// --- DEALER SALES ---

export const leads = pgTable('leads', {
    id: varchar('id', { length: 255 }).primaryKey(), // LEAD-YYYYMMDD-SEQ
    lead_source: varchar('lead_source', { length: 50 }).notNull(), // call_center, ground_sales, digital_marketing, database_upload, dealer_referral
    interest_level: varchar('interest_level', { length: 20 }).default('cold').notNull(), // cold, warm, hot
    lead_status: varchar('lead_status', { length: 50 }).default('new').notNull(), // new, assigned, contacted, qualified, converted, lost
    dealer_id: varchar('dealer_id', { length: 255 }).references(() => accounts.id), // Scoped to dealer org

    // Dealer Info
    owner_name: text('owner_name').notNull(),
    owner_contact: varchar('owner_contact', { length: 20 }).notNull(),
    business_name: text('business_name'),
    owner_email: text('owner_email'),

    // Location
    state: varchar('state', { length: 100 }), // can be nullable now if not always provided
    city: varchar('city', { length: 100 }),   // can be nullable
    shop_address: text('shop_address'),

    // Extended Attributes (Dealer Portal)
    mobile: varchar('mobile', { length: 20 }),
    permanent_address: text('permanent_address'),
    vehicle_ownership: varchar('vehicle_ownership', { length: 50 }),
    battery_type: varchar('battery_type', { length: 50 }),
    asset_model: text('asset_model'),
    asset_price: decimal('asset_price', { precision: 12, scale: 2 }),
    family_members: integer('family_members'),
    driving_experience: integer('driving_experience'),
    lead_type: varchar('lead_type', { length: 20 }), // hot, warm, cold
    vehicle_rc: varchar('vehicle_rc', { length: 50 }),

    // V2 Step 1 Mapping (Additive)
    full_name: text('full_name'),
    father_or_husband_name: text('father_or_husband_name'),
    dob: timestamp('dob', { withTimezone: true }),
    phone: varchar('phone', { length: 20 }),
    current_address: text('current_address'),
    is_current_same: boolean('is_current_same').notNull().default(false),
    product_category_id: varchar('product_category_id', { length: 255 }), // Changed from uuid to match catalog
    product_type_id: varchar('product_type_id', { length: 255 }), // Added for Step 1 selection
    vehicle_owner_name: text('vehicle_owner_name'),
    vehicle_owner_phone: varchar('vehicle_owner_phone', { length: 20 }),
    auto_filled: boolean('auto_filled').default(false).notNull(),
    ocr_status: varchar('ocr_status', { length: 20 }), // success, partial, failed
    ocr_error: text('ocr_error'),
    reference_id: varchar('reference_id', { length: 255 }).unique(),

    // Business Details
    interested_in: jsonb('interested_in'), // Array of product IDs
    battery_order_expected: integer('battery_order_expected'),
    investment_capacity: decimal('investment_capacity', { precision: 12, scale: 2 }),
    business_type: varchar('business_type', { length: 50 }), // retail, wholesale, distributor

    // Qualification
    qualified_by: uuid('qualified_by').references(() => users.id),
    qualified_at: timestamp('qualified_at', { withTimezone: true }),
    qualification_notes: text('qualification_notes'),

    // Conversion
    converted_deal_id: varchar('converted_deal_id', { length: 255 }),
    converted_at: timestamp('converted_at', { withTimezone: true }),

    // AI Call tracking
    total_ai_calls: integer('total_ai_calls').default(0),
    last_ai_call_at: timestamp('last_ai_call_at', { withTimezone: true }),
    last_call_outcome: text('last_call_outcome'),
    ai_priority_score: decimal('ai_priority_score', { precision: 5, scale: 2 }),
    next_call_after: timestamp('next_call_after', { withTimezone: true }),
    do_not_call: boolean('do_not_call').default(false),

    // AI Dialer (Bolna)
    ai_managed: boolean('ai_managed').default(false),
    ai_owner: text('ai_owner'),
    manual_takeover: boolean('manual_takeover').default(false),
    last_ai_action_at: timestamp('last_ai_action_at', { withTimezone: true }),
    intent_score: integer('intent_score'),
    intent_reason: text('intent_reason'),
    next_call_at: timestamp('next_call_at', { withTimezone: true }),
    call_priority: integer('call_priority').default(0),
    conversation_summary: text('conversation_summary'),
    last_call_status: text('last_call_status'),

    // V2 Workflow
    status: varchar('status', { length: 50 }).default('INCOMPLETE').notNull(), // INCOMPLETE, ACTIVE, CONVERTED, ABANDONED
    workflow_step: integer('workflow_step').default(1).notNull(),
    primary_product_id: uuid('primary_product_id').references(() => products.id),
    lead_score: integer('lead_score'), // hot=90, warm=60, cold=30

    // KYC Fields
    kyc_status: varchar('kyc_status', { length: 30 }).default('not_started'), // not_started, draft, in_progress, completed, failed
    kyc_score: integer('kyc_score'), // 0-100 calculated score
    kyc_completed_at: timestamp('kyc_completed_at', { withTimezone: true }),
    payment_method: varchar('payment_method', { length: 20 }), // upfront, finance
    consent_status: varchar('consent_status', { length: 30 }).default('awaiting_signature'), // awaiting_signature, link_sent, digitally_signed, manual_uploaded, verified
    has_co_borrower: boolean('has_co_borrower').default(false),
    has_additional_docs_required: boolean('has_additional_docs_required').default(false),
    interim_step_status: varchar('interim_step_status', { length: 20 }), // pending, completed
    kyc_draft_data: jsonb('kyc_draft_data'), // Stores draft KYC form data

    // SM Workflow
    sm_review_status: varchar('sm_review_status', { length: 30 }).default('not_submitted'), // not_submitted, pending_sm_review, under_review, docs_verified, options_ready, option_booked
    submitted_to_sm_at: timestamp('submitted_to_sm_at', { withTimezone: true }),
    sm_assigned_to: uuid('sm_assigned_to').references(() => users.id),

    // Metadata
    uploader_id: uuid('uploader_id').references(() => users.id).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
    return {
        leadsSourceIdx: index('leads_source_idx').on(table.lead_source),
        leadsInterestIdx: index('leads_interest_idx').on(table.interest_level),
        leadsStatusIdx: index('leads_status_idx').on(table.lead_status),
    };
});

export const loanDetails = pgTable('loan_details', {
    id: uuid('id').defaultRandom().primaryKey(),
    lead_id: varchar('lead_id', { length: 255 }).references(() => leads.id, { onDelete: 'cascade' }),
    loan_required: boolean('loan_required').default(false),
    loan_amount: decimal('loan_amount', { precision: 12, scale: 2 }),
    interest_rate: decimal('interest_rate', { precision: 5, scale: 2 }),
    tenure_months: integer('tenure_months'),
    processing_fee: decimal('processing_fee', { precision: 10, scale: 2 }),
    emi: decimal('emi', { precision: 10, scale: 2 }),
    down_payment: decimal('down_payment', { precision: 12, scale: 2 }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const personalDetails = pgTable('personal_details', {
    id: uuid('id').defaultRandom().primaryKey(),
    lead_id: varchar('lead_id', { length: 255 }).references(() => leads.id, { onDelete: 'cascade' }),
    aadhaar_no: varchar('aadhaar_no', { length: 20 }),
    pan_no: varchar('pan_no', { length: 20 }),
    dob: timestamp('dob', { withTimezone: true }), // Using timestamp for date
    email: text('email'),
    income: decimal('income', { precision: 12, scale: 2 }),
    finance_type: varchar('finance_type', { length: 50 }),
    financier: varchar('financier', { length: 100 }),
    asset_type: varchar('asset_type', { length: 50 }), // 2W, 3W
    vehicle_rc: varchar('vehicle_rc', { length: 50 }),
    loan_type: varchar('loan_type', { length: 100 }),
    father_husband_name: text('father_husband_name'),
    marital_status: varchar('marital_status', { length: 20 }),
    spouse_name: text('spouse_name'),
    local_address: text('local_address'),

    // OCR Confidence
    dob_confidence: decimal('dob_confidence', { precision: 5, scale: 2 }),
    name_confidence: decimal('name_confidence', { precision: 5, scale: 2 }),
    address_confidence: decimal('address_confidence', { precision: 5, scale: 2 }),
    ocr_processed_at: timestamp('ocr_processed_at', { withTimezone: true }),

    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});


export const documents = pgTable('documents', {
    id: uuid('id').defaultRandom().primaryKey(),
    lead_id: varchar('lead_id', { length: 255 }).references(() => leads.id, { onDelete: 'cascade' }),
    document_type: varchar('document_type', { length: 50 }).notNull(),
    file_url: text('file_url').notNull(),
    uploaded_at: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
});

export const leadDocuments = pgTable('lead_documents', {
    id: varchar('id', { length: 255 }).primaryKey(),
    lead_id: varchar('lead_id', { length: 255 }).references(() => leads.id, { onDelete: 'cascade' }),
    dealer_id: varchar('dealer_id', { length: 255 }).references(() => accounts.id),
    user_id: uuid('user_id').references(() => users.id),
    doc_type: varchar('doc_type', { length: 100 }).notNull(),
    storage_path: text('storage_path').notNull(), // private/dealer_id/lead_id/filename
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const leadAssignments = pgTable('lead_assignments', {
    id: varchar('id', { length: 255 }).primaryKey(),
    lead_id: varchar('lead_id', { length: 255 }).references(() => leads.id).notNull(),
    lead_owner: uuid('lead_owner').references(() => users.id).notNull(), // Sales Head MUST assign
    assigned_by: uuid('assigned_by').references(() => users.id).notNull(),
    assigned_at: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),

    // Lead Actor (Owner or Sales Head can assign)
    lead_actor: uuid('lead_actor').references(() => users.id),
    actor_assigned_by: uuid('actor_assigned_by').references(() => users.id),
    actor_assigned_at: timestamp('actor_assigned_at', { withTimezone: true }),

    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const assignmentChangeLogs = pgTable('assignment_change_logs', {
    id: varchar('id', { length: 255 }).primaryKey(),
    lead_id: varchar('lead_id', { length: 255 }).references(() => leads.id).notNull(),
    change_type: varchar('change_type', { length: 50 }).notNull(), // owner_assigned, owner_changed, actor_assigned, actor_changed, actor_removed
    old_user_id: uuid('old_user_id').references(() => users.id),
    new_user_id: uuid('new_user_id').references(() => users.id),
    changed_by: uuid('changed_by').references(() => users.id).notNull(),
    change_reason: text('change_reason'),
    changed_at: timestamp('changed_at', { withTimezone: true }).defaultNow().notNull(),
});

export const deals = pgTable('deals', {
    id: varchar('id', { length: 255 }).primaryKey(), // DEAL-YYYYMMDD-XXX
    lead_id: varchar('lead_id', { length: 255 }).references(() => leads.id).notNull(),

    // Products & Pricing
    products: jsonb('products').notNull(), // Array of { product_id, quantity, unit_price, gst_percent }
    line_total: decimal('line_total', { precision: 12, scale: 2 }).notNull(),
    gst_amount: decimal('gst_amount', { precision: 12, scale: 2 }).notNull(),
    transportation_cost: decimal('transportation_cost', { precision: 10, scale: 2 }).default('0').notNull(),
    transportation_gst_percent: integer('transportation_gst_percent').default(18).notNull(),
    total_payable: decimal('total_payable', { precision: 12, scale: 2 }).notNull(),

    // Payment Terms
    payment_term: varchar('payment_term', { length: 20 }).notNull(), // cash, credit
    credit_period_months: integer('credit_period_months'),

    // Status
    deal_status: varchar('deal_status', { length: 50 }).default('pending_approval_l1').notNull(), // pending_approval_l1, pending_approval_l2, pending_approval_l3, approved, rejected, payment_awaited, converted, expired

    // Immutability (after invoice)
    is_immutable: boolean('is_immutable').default(false).notNull(),
    invoice_number: text('invoice_number'),
    invoice_url: text('invoice_url'),
    invoice_issued_at: timestamp('invoice_issued_at', { withTimezone: true }),

    // Expiry
    expires_at: timestamp('expires_at', { withTimezone: true }),
    expired_by: uuid('expired_by').references(() => users.id),
    expired_at: timestamp('expired_at', { withTimezone: true }),
    expiry_reason: text('expiry_reason'),

    // Rejection
    rejected_by: uuid('rejected_by').references(() => users.id),
    rejected_at: timestamp('rejected_at', { withTimezone: true }),
    rejection_reason: text('rejection_reason'),

    created_by: uuid('created_by').references(() => users.id).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const approvals = pgTable('approvals', {
    id: varchar('id', { length: 255 }).primaryKey(),
    entity_type: varchar('entity_type', { length: 50 }).notNull(), // deal, order, provision
    entity_id: varchar('entity_id', { length: 255 }).notNull(),

    level: integer('level').notNull(), // 1, 2, 3
    approver_role: varchar('approver_role', { length: 50 }).notNull(), // sales_head, business_head, finance_controller

    status: varchar('status', { length: 20 }).default('pending').notNull(), // pending, approved, rejected

    approver_id: uuid('approver_id').references(() => users.id),
    decision_at: timestamp('decision_at', { withTimezone: true }),
    rejection_reason: text('rejection_reason'),
    comments: text('comments'),

    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const orderDisputes = pgTable('order_disputes', {
    id: varchar('id', { length: 255 }).primaryKey(), // DISP-YYYYMMDD-SEQ
    order_id: varchar('order_id', { length: 255 }).references(() => orders.id).notNull(),
    dispute_type: varchar('dispute_type', { length: 50 }).notNull(), // damage, shortage, delivery_failure
    description: text('description').notNull(),
    photos_urls: jsonb('photos_urls'), // Array of photo URLs
    assigned_to: uuid('assigned_to').references(() => users.id).notNull(),
    resolution_status: varchar('resolution_status', { length: 50 }).default('open').notNull(), // open, investigating, resolved, closed
    resolution_details: text('resolution_details'), // Added from SOP 9.6
    action_taken: text('action_taken'),           // Added from SOP 9.6
    resolved_by: uuid('resolved_by').references(() => users.id),
    resolved_at: timestamp('resolved_at'),
    created_by: uuid('created_by').references(() => users.id).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const slas = pgTable('slas', {
    id: varchar('id', { length: 255 }).primaryKey(),
    workflow_step: varchar('workflow_step', { length: 100 }).notNull(),
    entity_type: varchar('entity_type', { length: 50 }).notNull(),
    entity_id: varchar('entity_id', { length: 255 }).notNull(),
    assigned_to: uuid('assigned_to').references(() => users.id),
    sla_deadline: timestamp('sla_deadline').notNull(),
    status: varchar('status', { length: 20 }).default('active').notNull(), // active, completed, breached
    completed_at: timestamp('completed_at'),
    escalated_to: uuid('escalated_to').references(() => users.id),
    escalated_at: timestamp('escalated_at'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// --- PDI ---

export const oemInventoryForPDI = pgTable('oem_inventory_for_pdi', {
    id: varchar('id', { length: 255 }).primaryKey(), // PDIREQ-YYYYMMDD-XXX
    provision_id: varchar('provision_id', { length: 255 }).notNull(),
    inventory_id: varchar('inventory_id', { length: 255 }).references(() => inventory.id).notNull(),
    serial_number: varchar('serial_number', { length: 255 }),
    oem_id: varchar('oem_id', { length: 255 }).references(() => oems.id).notNull(),
    pdi_status: varchar('pdi_status', { length: 20 }).default('pending').notNull(), // pending, in_progress, completed
    pdi_record_id: varchar('pdi_record_id', { length: 255 }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const pdiRecords = pgTable('pdi_records', {
    id: varchar('id', { length: 255 }).primaryKey(), // PDI-YYYYMMDD-XXX
    oem_inventory_id: varchar('oem_inventory_id', { length: 255 }).references(() => oemInventoryForPDI.id).notNull(),
    provision_id: varchar('provision_id', { length: 255 }).notNull(),
    service_engineer_id: uuid('service_engineer_id').references(() => users.id).notNull(),

    // Physical Inspection
    iot_imei_no: varchar('iot_imei_no', { length: 255 }),
    physical_condition: text('physical_condition').notNull(), // OK - No issues, Minor scratches, Damaged exterior, Severely damaged
    discharging_connector: varchar('discharging_connector', { length: 20 }).notNull(), // SB75, SB50
    charging_connector: varchar('charging_connector', { length: 20 }).notNull(), // SB75, SB50
    productor_sticker: varchar('productor_sticker', { length: 50 }).notNull(), // Available - damage, Available - OK, Unavailable

    // Technical Fields
    voltage: decimal('voltage', { precision: 5, scale: 2 }),
    soc: integer('soc'),
    capacity_ah: decimal('capacity_ah', { precision: 6, scale: 2 }),
    resistance_mohm: decimal('resistance_mohm', { precision: 6, scale: 2 }),
    temperature_celsius: decimal('temperature_celsius', { precision: 5, scale: 2 }),

    // GPS
    latitude: decimal('latitude', { precision: 10, scale: 8 }).notNull(),
    longitude: decimal('longitude', { precision: 11, scale: 8 }).notNull(),
    location_address: text('location_address'),

    // Documents
    product_manual_url: text('product_manual_url'),
    warranty_document_url: text('warranty_document_url'),
    pdi_photos: jsonb('pdi_photos'),

    // Result
    pdi_status: varchar('pdi_status', { length: 20 }).notNull(), // pass, fail
    failure_reason: text('failure_reason'),

    inspected_at: timestamp('inspected_at', { withTimezone: true }).defaultNow().notNull(),
});

export const auditLogs = pgTable('audit_logs', {
    id: varchar('id', { length: 255 }).primaryKey(), // AUDIT-YYYYMMDD-SEQ
    entity_type: varchar('entity_type', { length: 50 }).notNull(),
    entity_id: varchar('entity_id', { length: 255 }).notNull(),
    action: varchar('action', { length: 50 }).notNull(), // create, update, delete, approve, reject, assign, complete
    changes: jsonb('changes'),
    performed_by: uuid('performed_by').references(() => users.id).notNull(),
    timestamp: timestamp('timestamp').defaultNow().notNull(),
});

// --- ACCOUNTS ---

export const accounts = pgTable('accounts', {
    id: varchar('id', { length: 255 }).primaryKey(), // ACC-YYYYMMDD-XXX
    business_name: text('business_name').notNull(),
    owner_name: text('owner_name').notNull(),
    email: text('email'),
    phone: varchar('phone', { length: 20 }),
    gstin: varchar('gstin', { length: 15 }),
    billing_address: text('billing_address'),
    shipping_address: text('shipping_address'),
    status: varchar('status', { length: 20 }).default('active').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    last_order_fulfilled_at: timestamp('last_order_fulfilled_at', { withTimezone: true }),
});

// --- PROCUREMENT ---

export const provisions = pgTable('provisions', {
    id: varchar('id', { length: 255 }).primaryKey(), // PROV-YYYYMMDD-XXX
    oem_id: varchar('oem_id', { length: 255 }).references(() => oems.id).notNull(),
    oem_name: text('oem_name').notNull(),
    products: jsonb('products').notNull(), // Array of { product_id, quantity }
    expected_delivery_date: timestamp('expected_delivery_date', { withTimezone: true }).notNull(),
    status: varchar('status', { length: 20 }).default('pending').notNull(), // pending, acknowledged, in_production, ready_for_pdi, completed, cancelled
    remarks: text('remarks'),
    created_by: uuid('created_by').references(() => users.id).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const orders = pgTable('orders', {
    id: varchar('id', { length: 255 }).primaryKey(), // ORD-YYYYMMDD-XXX
    provision_id: varchar('provision_id', { length: 255 }).references(() => provisions.id).notNull(),
    oem_id: varchar('oem_id', { length: 255 }).references(() => oems.id).notNull(),
    account_id: varchar('account_id', { length: 255 }).references(() => accounts.id),

    // Order items
    order_items: jsonb('order_items').notNull(), // Array of { inventory_id, serial_number, amount }
    total_amount: decimal('total_amount', { precision: 12, scale: 2 }).notNull(),

    payment_term: varchar('payment_term', { length: 20 }).notNull(), // advance, credit
    credit_period_days: integer('credit_period_days'),

    // Documents
    pi_url: text('pi_url'),
    pi_amount: decimal('pi_amount', { precision: 12, scale: 2 }),
    invoice_url: text('invoice_url'),
    grn_id: text('grn_id'),
    grn_date: timestamp('grn_date', { withTimezone: true }),

    // Payment Tracking
    payment_status: varchar('payment_status', { length: 20 }).default('unpaid').notNull(), // unpaid, partial, paid
    payment_amount: decimal('payment_amount', { precision: 12, scale: 2 }).default('0').notNull(),
    payment_mode: varchar('payment_mode', { length: 50 }),
    transaction_id: text('transaction_id'),
    payment_date: timestamp('payment_date', { withTimezone: true }),

    // Status
    order_status: varchar('order_status', { length: 50 }).default('pi_awaited').notNull(), // pi_awaited, pi_approval_pending, pi_approved, pi_rejected, payment_made, in_transit, delivered, cancelled
    delivery_status: varchar('delivery_status', { length: 20 }).default('pending').notNull(), // pending, in_transit, delivered, failed

    // Dates
    expected_delivery_date: timestamp('expected_delivery_date', { withTimezone: true }),
    actual_delivery_date: timestamp('actual_delivery_date', { withTimezone: true }),

    created_by: uuid('created_by').references(() => users.id).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
    return {
        ordersCreatedAtIdx: index('orders_created_at_idx').on(table.created_at),
        ordersPaymentStatusIdx: index('orders_payment_status_idx').on(table.payment_status),
    };
});

export const bolnaCalls = pgTable('bolna_calls', {
    id: varchar('id', { length: 255 }).primaryKey(),
    bolna_call_id: varchar('bolna_call_id', { length: 255 }).notNull().unique(),
    lead_id: varchar('lead_id', { length: 255 }).references(() => leads.id),
    status: varchar('status', { length: 20 }).default('initiated').notNull(),
    current_phase: varchar('current_phase', { length: 100 }),
    started_at: timestamp('started_at', { withTimezone: true }),
    ended_at: timestamp('ended_at', { withTimezone: true }),
    transcript_chunk: text('transcript_chunk'),
    chunk_received_at: timestamp('chunk_received_at', { withTimezone: true }),
    full_transcript: text('full_transcript'),
    transcript_fetched_at: timestamp('transcript_fetched_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
    return {
        bolnaCallIdIdx: index('bolna_calls_bolna_call_id_idx').on(table.bolna_call_id),
        leadIdIdx: index('bolna_calls_lead_id_idx').on(table.lead_id),
        statusIdx: index('bolna_calls_status_idx').on(table.status),
        startedAtIdx: index('bolna_calls_started_at_idx').on(table.started_at),
    };
});

export const aiCallLogs = pgTable('ai_call_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    lead_id: varchar('lead_id', { length: 255 }).references(() => leads.id).notNull(),
    call_id: varchar('call_id', { length: 255 }).notNull().unique(),
    agent_id: varchar('agent_id', { length: 255 }),
    phone_number: varchar('phone_number', { length: 20 }),
    transcript: text('transcript'),
    summary: text('summary'),
    recording_url: text('recording_url'),
    call_duration: integer('call_duration'), // in seconds
    status: varchar('status', { length: 50 }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
    return {
        aiCallLogsLeadIdIdx: index('ai_call_logs_lead_id_idx').on(table.lead_id),
        aiCallLogsCallIdIdx: index('ai_call_logs_call_id_idx').on(table.call_id),
    };
});

// --- AI CALLS ---

export const callSessions = pgTable('call_sessions', {
    id: uuid('id').primaryKey().defaultRandom(),
    session_id: text('session_id').unique(), // External ID
    status: text('status').default('active'), // active, completed
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    ended_at: timestamp('ended_at', { withTimezone: true }),
});

export const callRecords = pgTable('call_records', {
    id: varchar('id', { length: 255 }).primaryKey(),
    session_id: text('session_id').references(() => callSessions.session_id),
    lead_id: varchar('lead_id', { length: 255 }).references(() => leads.id),
    bolna_call_id: varchar('bolna_call_id', { length: 255 }).unique(),
    status: text('status').default('queued'), // queued, ringing, completed, failed
    duration_seconds: integer('duration_seconds'),
    recording_url: text('recording_url'),
    summary: text('summary'),
    transcript: text('transcript'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    ended_at: timestamp('ended_at', { withTimezone: true }),
});

export const conversationMessages = pgTable('conversation_messages', {
    id: uuid('id').primaryKey().defaultRandom(),
    call_record_id: varchar('call_record_id', { length: 255 }).references(() => callRecords.id), // Link to record
    role: text('role'), // 'user', 'assistant'
    message: text('message'),
    timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow(),
});

// --- RELATIONS ---

export const productCategoriesRelations = relations(productCategories, ({ many }) => ({
    products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
    category: one(productCategories, { fields: [products.category_id], references: [productCategories.id] }),
    inventories: many(inventory),
}));

export const usersRelations = relations(users, ({ many }) => ({
    oemsCreated: many(oems, { relationName: 'oem_creator' }),
    inventoryCreated: many(inventory, { relationName: 'inventory_creator' }),
    leadsUploaded: many(leads, { relationName: 'lead_uploader' }),
    assignmentsReceived: many(leadAssignments, { relationName: 'assigned_to_user' }),
    assignmentsGiven: many(leadAssignments, { relationName: 'assigned_by_user' }),
    dealsCreated: many(deals, { relationName: 'deal_creator' }),
    approvalsHandled: many(approvals, { relationName: 'approver_user' }),
    slasAssigned: many(slas, { relationName: 'sla_assigned' }),
    slasEscalatedTo: many(slas, { relationName: 'sla_escalated' }),
    leadsQualified: many(leads, { relationName: 'qualified_by_user' }),
    pdiInspections: many(pdiRecords, { relationName: 'pdi_service_engineer' }),
    campaigns: many(campaigns),
    loanApplications: many(loanApplications),
}));


export const oemsRelations = relations(oems, ({ one, many }) => ({
    creator: one(users, { fields: [oems.created_by], references: [users.id], relationName: 'oem_creator' }),
    contacts: many(oemContacts),
}));

export const oemContactsRelations = relations(oemContacts, ({ one }) => ({
    oem: one(oems, { fields: [oemContacts.oem_id], references: [oems.id] }),
}));

export const inventoryRelations = relations(inventory, ({ one }) => ({
    product: one(products, { fields: [inventory.product_id], references: [products.id] }),
    creator: one(users, { fields: [inventory.created_by], references: [users.id], relationName: 'inventory_creator' }),
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
    uploader: one(users, { fields: [leads.uploader_id], references: [users.id], relationName: 'lead_uploader' }),
    qualifiedBy: one(users, { fields: [leads.qualified_by], references: [users.id], relationName: 'qualified_by_user' }),
    assignments: many(leadAssignments),
    deals: many(deals),
    bolnaCalls: many(bolnaCalls),
    aiCallLogs: many(aiCallLogs),
    loanApplications: many(loanApplications),
    kycDocuments: many(kycDocuments),
    kycVerifications: many(kycVerifications),
    consentRecords: many(consentRecords),
    coBorrowers: many(coBorrowers),
    deployedAssets: many(deployedAssets),
    loanFiles: many(loanFiles),
}));

export const leadAssignmentsRelations = relations(leadAssignments, ({ one }) => ({
    lead: one(leads, { fields: [leadAssignments.lead_id], references: [leads.id] }),
    owner: one(users, { fields: [leadAssignments.lead_owner], references: [users.id], relationName: 'assigned_to_user' }),
    assigner: one(users, { fields: [leadAssignments.assigned_by], references: [users.id], relationName: 'assigned_by_user' }),
    actor: one(users, { fields: [leadAssignments.lead_actor], references: [users.id], relationName: 'lead_actor_user' }),
    actorAssigner: one(users, { fields: [leadAssignments.actor_assigned_by], references: [users.id], relationName: 'actor_assigned_by_user' }),
}));

export const dealsRelations = relations(deals, ({ one }) => ({
    lead: one(leads, { fields: [deals.lead_id], references: [leads.id] }),
    creator: one(users, { fields: [deals.created_by], references: [users.id], relationName: 'deal_creator' }),
}));

export const approvalsRelations = relations(approvals, ({ one }) => ({
    approver: one(users, { fields: [approvals.approver_id], references: [users.id], relationName: 'approver_user' }),
}));

export const slasRelations = relations(slas, ({ one }) => ({
    assignedUser: one(users, { fields: [slas.assigned_to], references: [users.id], relationName: 'sla_assigned' }),
    escalatedUser: one(users, { fields: [slas.escalated_to], references: [users.id], relationName: 'sla_escalated' }),
}));

export const provisionsRelations = relations(provisions, ({ one, many }) => ({
    oem: one(oems, { fields: [provisions.oem_id], references: [oems.id] }),
    creator: one(users, { fields: [provisions.created_by], references: [users.id] }),
    orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
    provision: one(provisions, { fields: [orders.provision_id], references: [provisions.id] }),
    oem: one(oems, { fields: [orders.oem_id], references: [oems.id] }),
    creator: one(users, { fields: [orders.created_by], references: [users.id] }),
    account: one(accounts, { fields: [orders.account_id], references: [accounts.id] }),
}));

export const oemInventoryForPDIRelations = relations(oemInventoryForPDI, ({ one }) => ({
    inventory: one(inventory, { fields: [oemInventoryForPDI.inventory_id], references: [inventory.id] }),
    oem: one(oems, { fields: [oemInventoryForPDI.oem_id], references: [oems.id] }),
    pdiRecord: one(pdiRecords, { fields: [oemInventoryForPDI.pdi_record_id], references: [pdiRecords.id] }),
}));

export const pdiRecordsRelations = relations(pdiRecords, ({ one }) => ({
    oemInventory: one(oemInventoryForPDI, { fields: [pdiRecords.oem_inventory_id], references: [oemInventoryForPDI.id] }),
    serviceEngineer: one(users, { fields: [pdiRecords.service_engineer_id], references: [users.id], relationName: 'pdi_service_engineer' }),
}));

export const assignmentChangeLogsRelations = relations(assignmentChangeLogs, ({ one }) => ({
    lead: one(leads, { fields: [assignmentChangeLogs.lead_id], references: [leads.id] }),
    oldUser: one(users, { fields: [assignmentChangeLogs.old_user_id], references: [users.id] }),
    newUser: one(users, { fields: [assignmentChangeLogs.new_user_id], references: [users.id] }),
    changedBy: one(users, { fields: [assignmentChangeLogs.changed_by], references: [users.id] }),
}));

export const orderDisputesRelations = relations(orderDisputes, ({ one }) => ({
    order: one(orders, { fields: [orderDisputes.order_id], references: [orders.id] }),
    resolvedBy: one(users, { fields: [orderDisputes.resolved_by], references: [users.id] }),
    creator: one(users, { fields: [orderDisputes.created_by], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ many }) => ({
    orders: many(orders),
}));

export const bolnaCallsRelations = relations(bolnaCalls, ({ one }) => ({
    lead: one(leads, { fields: [bolnaCalls.lead_id], references: [leads.id] }),
}));

export const aiCallLogsRelations = relations(aiCallLogs, ({ one }) => ({
    lead: one(leads, { fields: [aiCallLogs.lead_id], references: [leads.id] }),
}));
export const callSessionsRelations = relations(callSessions, ({ many }) => ({
    records: many(callRecords),
}));

export const callRecordsRelations = relations(callRecords, ({ one, many }) => ({
    session: one(callSessions, { fields: [callRecords.session_id], references: [callSessions.session_id] }),
    lead: one(leads, { fields: [callRecords.lead_id], references: [leads.id] }),
    messages: many(conversationMessages),
}));

export const conversationMessagesRelations = relations(conversationMessages, ({ one }) => ({
    record: one(callRecords, { fields: [conversationMessages.call_record_id], references: [callRecords.id] }),
}));



// --- DEALER ADDITIONS (SOP Refinements) ---

export const campaigns = pgTable('campaigns', {
    id: varchar('id', { length: 255 }).primaryKey(), // CAMP-YYYYMMDD-XXX
    name: text('name').notNull(),
    type: varchar('type', { length: 50 }).notNull(), // sms, whatsapp, email
    status: varchar('status', { length: 20 }).default('draft').notNull(), // draft, scheduled, running, completed
    audience_filter: jsonb('audience_filter'), // Logic for segments
    message_content: text('message_content'),
    total_audience: integer('total_audience'),
    cost: decimal('cost', { precision: 10, scale: 2 }),
    created_by: uuid('created_by').references(() => users.id).notNull(),
    started_at: timestamp('started_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// For "Process Loan" workflow tracking
export const loanApplications = pgTable('loan_applications', {
    id: varchar('id', { length: 255 }).primaryKey(), // LOAN-APP-XXX
    lead_id: varchar('lead_id', { length: 255 }).references(() => leads.id).notNull(),
    applicant_name: text('applicant_name'), // De-normalized for list views
    loan_amount: decimal('loan_amount', { precision: 12, scale: 2 }),

    // Status Flow
    documents_uploaded: boolean('documents_uploaded').default(false),
    company_validation_status: varchar('company_validation_status', { length: 20 }).default('pending').notNull(), // pending, passed, failed
    facilitation_fee_status: varchar('facilitation_fee_status', { length: 20 }).default('pending').notNull(), // pending, paid
    application_status: varchar('application_status', { length: 20 }).default('new').notNull(), // new, processing, approved, disbursed, rejected

    facilitation_fee_amount: decimal('facilitation_fee_amount', { precision: 10, scale: 2 }),

    created_by: uuid('created_by').references(() => users.id),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// --- KYC MODULE ---

export const kycDocuments = pgTable('kyc_documents', {
    id: varchar('id', { length: 255 }).primaryKey(),
    lead_id: varchar('lead_id', { length: 255 })
        .references(() => leads.id, { onDelete: 'cascade' })
        .notNull(),
    doc_type: varchar('doc_type', { length: 50 }).notNull(),

    file_url: text('file_url'),
    file_name: text('file_name'),
    file_size: integer('file_size'),
    file_type: varchar('file_type', { length: 50 }),

    doc_status: varchar('doc_status', { length: 30 }).default('not_uploaded').notNull(), // not_uploaded, uploaded, verified, rejected, reupload_requested
    verification_status: varchar('verification_status', { length: 30 }).default('pending').notNull(), // pending, in_progress, success, failed, awaiting_action

    uploaded_by: uuid('uploaded_by').references(() => users.id),
    verified_by: uuid('verified_by').references(() => users.id),

    failed_reason: text('failed_reason'),
    rejection_reason: text('rejection_reason'),

    ocr_data: jsonb('ocr_data'),
    extracted_data: jsonb('extracted_data'),
    api_response: jsonb('api_response'),
    api_verification_results: jsonb('api_verification_results'),

    verified_at: timestamp('verified_at', { withTimezone: true }),
    uploaded_at: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
    return {
        kycDocsLeadIdx: index('kyc_documents_lead_id_idx').on(table.lead_id),
        kycDocsTypeIdx: index('kyc_documents_doc_type_idx').on(table.doc_type),
    };
});

export const kycVerifications = pgTable('kyc_verifications', {
    id: varchar('id', { length: 255 }).primaryKey(), // KYCVER-YYYYMMDD-SEQ
    lead_id: varchar('lead_id', { length: 255 }).references(() => leads.id, { onDelete: 'cascade' }).notNull(),
    verification_type: varchar('verification_type', { length: 50 }).notNull(), // aadhaar, pan, bank, address, rc, mobile, cibil, photo
    status: varchar('status', { length: 30 }).default('pending').notNull(), // pending, initiating, awaiting_action, in_progress, success, failed
    api_provider: varchar('api_provider', { length: 50 }), // decentro, surepass, vahan
    api_request: jsonb('api_request'),
    api_response: jsonb('api_response'),
    failed_reason: text('failed_reason'),
    match_score: decimal('match_score', { precision: 5, scale: 2 }), // Fuzzy match percentage
    retry_count: integer('retry_count').default(0),
    submitted_at: timestamp('submitted_at', { withTimezone: true }),
    completed_at: timestamp('completed_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
    return {
        kycVerLeadIdx: index('kyc_verifications_lead_id_idx').on(table.lead_id),
        kycVerTypeIdx: index('kyc_verifications_type_idx').on(table.verification_type),
    };
});

export const consentRecords = pgTable('consent_records', {
    id: varchar('id', { length: 255 }).primaryKey(), // CONSENT-YYYYMMDD-SEQ
    lead_id: varchar('lead_id', { length: 255 }).references(() => leads.id, { onDelete: 'cascade' }).notNull(),
    consent_for: varchar('consent_for', { length: 20 }).default('primary').notNull(), // primary, co_borrower
    consent_type: varchar('consent_type', { length: 30 }), // digital, manual, sms, whatsapp
    consent_status: varchar('consent_status', { length: 30 }).default('awaiting_signature').notNull(), // awaiting_signature, link_sent, digitally_signed, manual_uploaded, verified
    consent_token: varchar('consent_token', { length: 255 }),
    consent_link_url: text('consent_link_url'),
    consent_link_sent_at: timestamp('consent_link_sent_at', { withTimezone: true }),
    signed_consent_url: text('signed_consent_url'),
    generated_pdf_url: text('generated_pdf_url'),
    signed_at: timestamp('signed_at', { withTimezone: true }),
    verified_by: uuid('verified_by').references(() => users.id),
    verified_at: timestamp('verified_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const couponCodes = pgTable('coupon_codes', {
    id: varchar('id', { length: 255 }).primaryKey(), // COUPON-SEQ
    code: varchar('code', { length: 20 }).notNull().unique(),
    dealer_id: varchar('dealer_id', { length: 255 }).references(() => accounts.id).notNull(),
    status: varchar('status', { length: 20 }).default('available').notNull(), // available, validated, used, expired
    credits_available: integer('credits_available').default(1),
    discount_type: varchar('discount_type', { length: 20 }).default('flat'), // flat, percentage
    discount_value: decimal('discount_value', { precision: 10, scale: 2 }).default('0'),
    max_discount_cap: decimal('max_discount_cap', { precision: 10, scale: 2 }),
    min_amount: decimal('min_amount', { precision: 10, scale: 2 }),
    used_by_lead_id: varchar('used_by_lead_id', { length: 255 }).references(() => leads.id),
    used_by: uuid('used_by').references(() => users.id),
    validated_at: timestamp('validated_at', { withTimezone: true }),
    used_at: timestamp('used_at', { withTimezone: true }),
    expires_at: timestamp('expires_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// --- FACILITATION PAYMENTS ---

export const facilitationPayments = pgTable('facilitation_payments', {
    id: varchar('id', { length: 255 }).primaryKey(),
    lead_id: varchar('lead_id', { length: 255 }).references(() => leads.id, { onDelete: 'cascade' }).notNull(),
    payment_method: varchar('payment_method', { length: 30 }),

    facilitation_fee_base_amount: decimal('facilitation_fee_base_amount', { precision: 10, scale: 2 }).notNull().default('1500.00'),
    coupon_code: varchar('coupon_code', { length: 50 }),
    coupon_id: varchar('coupon_id', { length: 255 }),
    coupon_discount_type: varchar('coupon_discount_type', { length: 20 }),
    coupon_discount_value: decimal('coupon_discount_value', { precision: 10, scale: 2 }),
    coupon_discount_amount: decimal('coupon_discount_amount', { precision: 10, scale: 2 }).default('0'),
    facilitation_fee_final_amount: decimal('facilitation_fee_final_amount', { precision: 10, scale: 2 }).notNull(),

    razorpay_qr_id: varchar('razorpay_qr_id', { length: 255 }),
    razorpay_qr_status: varchar('razorpay_qr_status', { length: 30 }),
    razorpay_qr_image_url: text('razorpay_qr_image_url'),
    razorpay_qr_short_url: text('razorpay_qr_short_url'),
    razorpay_qr_expires_at: timestamp('razorpay_qr_expires_at', { withTimezone: true }),

    razorpay_payment_id: varchar('razorpay_payment_id', { length: 255 }),
    razorpay_order_id: varchar('razorpay_order_id', { length: 255 }),
    razorpay_payment_status: varchar('razorpay_payment_status', { length: 30 }),
    utr_number_manual: varchar('utr_number_manual', { length: 100 }),
    payment_screenshot_url: text('payment_screenshot_url'),

    facilitation_fee_status: varchar('facilitation_fee_status', { length: 30 }).notNull().default('UNPAID'),
    // UNPAID, QR_GENERATED, PAYMENT_PENDING_CONFIRMATION, PAID, FAILED, EXPIRED

    payment_paid_at: timestamp('payment_paid_at', { withTimezone: true }),
    payment_verified_at: timestamp('payment_verified_at', { withTimezone: true }),
    payment_verification_source: varchar('payment_verification_source', { length: 30 }),

    created_by: uuid('created_by').references(() => users.id),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    fpLeadIdx: index('facilitation_payments_lead_id_idx').on(table.lead_id),
    fpStatusIdx: index('facilitation_payments_status_idx').on(table.facilitation_fee_status),
    fpQrIdx: index('facilitation_payments_rzp_qr_idx').on(table.razorpay_qr_id),
}));

export const facilitationPaymentsRelations = relations(facilitationPayments, ({ one }) => ({
    lead: one(leads, { fields: [facilitationPayments.lead_id], references: [leads.id] }),
    creator: one(users, { fields: [facilitationPayments.created_by], references: [users.id] }),
}));

// --- CO-BORROWER MODULE ---

export const coBorrowers = pgTable('co_borrowers', {
    id: varchar('id', { length: 255 }).primaryKey(), // COBOR-YYYYMMDD-SEQ
    lead_id: varchar('lead_id', { length: 255 }).references(() => leads.id, { onDelete: 'cascade' }).notNull(),
    full_name: text('full_name').notNull(),
    father_or_husband_name: text('father_or_husband_name'),
    dob: timestamp('dob', { withTimezone: true }),
    phone: varchar('phone', { length: 20 }).notNull(),
    permanent_address: text('permanent_address'),
    current_address: text('current_address'),
    is_current_same: boolean('is_current_same').default(false),
    pan_no: varchar('pan_no', { length: 20 }),
    aadhaar_no: varchar('aadhaar_no', { length: 20 }),
    auto_filled: boolean('auto_filled').default(false),
    kyc_status: varchar('kyc_status', { length: 30 }).default('not_started'), // not_started, draft, in_progress, completed, failed
    consent_status: varchar('consent_status', { length: 30 }).default('awaiting_signature'),
    verification_submitted_at: timestamp('verification_submitted_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
    return {
        coBorrowerLeadIdx: index('co_borrowers_lead_id_idx').on(table.lead_id),
    };
});

export const coBorrowerDocuments = pgTable('co_borrower_documents', {
    id: varchar('id', { length: 255 }).primaryKey(), // COBDOC-YYYYMMDD-SEQ
    co_borrower_id: varchar('co_borrower_id', { length: 255 }).references(() => coBorrowers.id, { onDelete: 'cascade' }).notNull(),
    lead_id: varchar('lead_id', { length: 255 }).references(() => leads.id, { onDelete: 'cascade' }).notNull(),
    doc_type: varchar('doc_type', { length: 50 }).notNull(), // aadhaar_front, aadhaar_back, pan_card, passport_photo, address_proof, rc_copy, bank_statement, cheque_1-4
    file_url: text('file_url').notNull(),
    file_name: text('file_name'),
    file_size: integer('file_size'),
    verification_status: varchar('verification_status', { length: 30 }).default('pending').notNull(),
    failed_reason: text('failed_reason'),
    ocr_data: jsonb('ocr_data'),
    api_response: jsonb('api_response'),
    verified_at: timestamp('verified_at', { withTimezone: true }),
    uploaded_at: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const otherDocumentRequests = pgTable('other_document_requests', {
    id: varchar('id', { length: 255 }).primaryKey(), // OTHERDOC-SEQ
    lead_id: varchar('lead_id', { length: 255 }).references(() => leads.id, { onDelete: 'cascade' }).notNull(),
    doc_for: varchar('doc_for', { length: 20 }).default('primary').notNull(), // primary, co_borrower
    doc_label: text('doc_label').notNull(), // e.g., "Rent Agreement", "Owner Verification"
    doc_key: varchar('doc_key', { length: 100 }).notNull(), // machine-friendly key
    is_required: boolean('is_required').default(true),
    file_url: text('file_url'),
    upload_status: varchar('upload_status', { length: 20 }).default('not_uploaded').notNull(), // not_uploaded, uploaded, rejected, verified
    rejection_reason: text('rejection_reason'),
    reviewed_by: uuid('reviewed_by').references(() => users.id),
    reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
    requested_by: uuid('requested_by').references(() => users.id).notNull(),
    uploaded_at: timestamp('uploaded_at', { withTimezone: true }),
    upload_token: varchar('upload_token', { length: 255 }),
    token_expires_at: timestamp('token_expires_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// --- LOAN OFFERS (SM → Dealer) ---

export const loanOffers = pgTable('loan_offers', {
    id: varchar('id', { length: 255 }).primaryKey(), // OFFER-YYYYMMDD-SEQ
    lead_id: varchar('lead_id', { length: 255 }).references(() => leads.id, { onDelete: 'cascade' }).notNull(),
    financier_name: text('financier_name').notNull(),
    loan_amount: decimal('loan_amount', { precision: 12, scale: 2 }).notNull(),
    interest_rate: decimal('interest_rate', { precision: 5, scale: 2 }).notNull(), // % per annum
    tenure_months: integer('tenure_months').notNull(),
    emi: decimal('emi', { precision: 10, scale: 2 }).notNull(),
    processing_fee: decimal('processing_fee', { precision: 10, scale: 2 }),
    notes: text('notes'),
    status: varchar('status', { length: 20 }).default('pending').notNull(), // pending, offered, selected, booked
    created_by: uuid('created_by').references(() => users.id).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    loanOffersLeadIdx: index('loan_offers_lead_id_idx').on(table.lead_id),
}));

export const loanOffersRelations = relations(loanOffers, ({ one }) => ({
    lead: one(leads, { fields: [loanOffers.lead_id], references: [leads.id] }),
    creator: one(users, { fields: [loanOffers.created_by], references: [users.id] }),
}));

// --- ADMIN KYC REVIEW ---

export const adminKycReviews = pgTable('admin_kyc_reviews', {
    id: varchar('id', { length: 255 }).primaryKey(), // REVIEW-YYYYMMDD-SEQ
    lead_id: varchar('lead_id', { length: 255 }).references(() => leads.id, { onDelete: 'cascade' }).notNull(),
    review_for: varchar('review_for', { length: 20 }).default('primary').notNull(), // primary, co_borrower
    document_id: varchar('document_id', { length: 255 }), // Reference to kyc_documents or co_borrower_documents
    document_type: varchar('document_type', { length: 50 }),
    outcome: varchar('outcome', { length: 20 }).notNull(), // verified, rejected, request_additional
    rejection_reason: text('rejection_reason'),
    additional_doc_requested: text('additional_doc_requested'), // If outcome is request_additional
    reviewer_id: uuid('reviewer_id').references(() => users.id).notNull(),
    reviewer_notes: text('reviewer_notes'),
    reviewed_at: timestamp('reviewed_at', { withTimezone: true }).defaultNow().notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// --- DEPLOYED ASSETS MODULE ---

export const deployedAssets = pgTable('deployed_assets', {
    id: varchar('id', { length: 255 }).primaryKey(), // ASSET-YYYYMMDD-SEQ
    inventory_id: varchar('inventory_id', { length: 255 }).references(() => inventory.id).notNull(),
    lead_id: varchar('lead_id', { length: 255 }).references(() => leads.id),
    deal_id: varchar('deal_id', { length: 255 }).references(() => deals.id),
    dealer_id: varchar('dealer_id', { length: 255 }).references(() => accounts.id),
    customer_name: text('customer_name'),
    customer_phone: varchar('customer_phone', { length: 20 }),

    // Asset Info (denormalized)
    serial_number: varchar('serial_number', { length: 255 }),
    asset_category: varchar('asset_category', { length: 20 }),
    asset_type: varchar('asset_type', { length: 50 }),
    model_type: text('model_type'),

    // Deployment
    deployment_date: timestamp('deployment_date', { withTimezone: true }).notNull(),
    deployment_location: text('deployment_location'),
    latitude: decimal('latitude', { precision: 10, scale: 8 }),
    longitude: decimal('longitude', { precision: 11, scale: 8 }),

    // QR Code
    qr_code_url: text('qr_code_url'),
    qr_code_data: text('qr_code_data'),

    // Payment
    payment_type: varchar('payment_type', { length: 20 }), // upfront, finance, lease
    payment_status: varchar('payment_status', { length: 20 }).default('pending'), // pending, partial, paid

    // Battery Health & Telemetry
    battery_health_percent: decimal('battery_health_percent', { precision: 5, scale: 2 }),
    last_voltage: decimal('last_voltage', { precision: 5, scale: 2 }),
    last_soc: integer('last_soc'),
    last_telemetry_at: timestamp('last_telemetry_at', { withTimezone: true }),
    telemetry_data: jsonb('telemetry_data'), // Historical telemetry snapshots
    total_cycles: integer('total_cycles'),

    // Warranty
    warranty_start_date: timestamp('warranty_start_date', { withTimezone: true }),
    warranty_end_date: timestamp('warranty_end_date', { withTimezone: true }),
    warranty_status: varchar('warranty_status', { length: 20 }).default('active'), // active, expired, claimed

    // Status
    status: varchar('status', { length: 20 }).default('active').notNull(), // active, maintenance, inactive, returned, replaced
    last_maintenance_at: timestamp('last_maintenance_at', { withTimezone: true }),
    next_maintenance_due: timestamp('next_maintenance_due', { withTimezone: true }),

    created_by: uuid('created_by').references(() => users.id).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
    return {
        deployedAssetsDealerIdx: index('deployed_assets_dealer_id_idx').on(table.dealer_id),
        deployedAssetsStatusIdx: index('deployed_assets_status_idx').on(table.status),
    };
});

export const deploymentHistory = pgTable('deployment_history', {
    id: varchar('id', { length: 255 }).primaryKey(),
    deployed_asset_id: varchar('deployed_asset_id', { length: 255 }).references(() => deployedAssets.id, { onDelete: 'cascade' }).notNull(),
    action: varchar('action', { length: 50 }).notNull(), // deployed, maintenance, replaced, returned, status_change
    description: text('description'),
    performed_by: uuid('performed_by').references(() => users.id).notNull(),
    metadata: jsonb('metadata'), // Action-specific data
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// --- SERVICE MANAGEMENT MODULE ---

export const serviceTickets = pgTable('service_tickets', {
    id: varchar('id', { length: 255 }).primaryKey(), // SVC-YYYYMMDD-SEQ
    deployed_asset_id: varchar('deployed_asset_id', { length: 255 }).references(() => deployedAssets.id),
    dealer_id: varchar('dealer_id', { length: 255 }).references(() => accounts.id).notNull(),
    customer_name: text('customer_name'),
    customer_phone: varchar('customer_phone', { length: 20 }),

    // Issue Details
    issue_type: varchar('issue_type', { length: 50 }).notNull(), // battery_failure, charger_issue, physical_damage, performance_degradation, connectivity, other
    issue_description: text('issue_description').notNull(),
    priority: varchar('priority', { length: 20 }).default('medium').notNull(), // low, medium, high, critical
    photos_urls: jsonb('photos_urls'),

    // Assignment
    assigned_to: uuid('assigned_to').references(() => users.id),
    assigned_at: timestamp('assigned_at', { withTimezone: true }),

    // Resolution
    status: varchar('status', { length: 30 }).default('open').notNull(), // open, assigned, in_progress, on_hold, resolved, closed, escalated
    resolution_type: varchar('resolution_type', { length: 50 }), // repair, replace, refund, warranty_claim, no_action
    resolution_notes: text('resolution_notes'),
    resolved_by: uuid('resolved_by').references(() => users.id),
    resolved_at: timestamp('resolved_at', { withTimezone: true }),

    // SLA
    sla_deadline: timestamp('sla_deadline', { withTimezone: true }),
    sla_breached: boolean('sla_breached').default(false),

    created_by: uuid('created_by').references(() => users.id).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
    return {
        serviceTicketsDealerIdx: index('service_tickets_dealer_id_idx').on(table.dealer_id),
        serviceTicketsStatusIdx: index('service_tickets_status_idx').on(table.status),
        serviceTicketsAssetIdx: index('service_tickets_asset_id_idx').on(table.deployed_asset_id),
    };
});

// --- LOAN MANAGEMENT MODULE (Full lifecycle) ---

export const loanFiles = pgTable('loan_files', {
    id: varchar('id', { length: 255 }).primaryKey(), // LOANF-YYYYMMDD-SEQ
    lead_id: varchar('lead_id', { length: 255 }).references(() => leads.id).notNull(),
    loan_application_id: varchar('loan_application_id', { length: 255 }).references(() => loanApplications.id),
    dealer_id: varchar('dealer_id', { length: 255 }).references(() => accounts.id),

    // Loan Details
    borrower_name: text('borrower_name').notNull(),
    co_borrower_name: text('co_borrower_name'),
    loan_amount: decimal('loan_amount', { precision: 12, scale: 2 }).notNull(),
    interest_rate: decimal('interest_rate', { precision: 5, scale: 2 }),
    tenure_months: integer('tenure_months'),
    emi_amount: decimal('emi_amount', { precision: 10, scale: 2 }),
    down_payment: decimal('down_payment', { precision: 12, scale: 2 }),
    processing_fee: decimal('processing_fee', { precision: 10, scale: 2 }),

    // Disbursal
    disbursal_status: varchar('disbursal_status', { length: 30 }).default('pending').notNull(), // pending, approved, disbursed, rejected
    disbursed_amount: decimal('disbursed_amount', { precision: 12, scale: 2 }),
    disbursed_at: timestamp('disbursed_at', { withTimezone: true }),
    disbursal_reference: text('disbursal_reference'),

    // Payments
    total_paid: decimal('total_paid', { precision: 12, scale: 2 }).default('0'),
    total_outstanding: decimal('total_outstanding', { precision: 12, scale: 2 }),
    next_emi_date: timestamp('next_emi_date', { withTimezone: true }),
    emi_schedule: jsonb('emi_schedule'), // Array of { due_date, amount, status, paid_date }
    overdue_amount: decimal('overdue_amount', { precision: 12, scale: 2 }).default('0'),
    overdue_days: integer('overdue_days').default(0),

    // Status
    loan_status: varchar('loan_status', { length: 30 }).default('active').notNull(), // active, closed, defaulted, restructured, written_off
    closure_date: timestamp('closure_date', { withTimezone: true }),
    closure_type: varchar('closure_type', { length: 20 }), // normal, prepayment, foreclosure

    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
    return {
        loanFilesDealerIdx: index('loan_files_dealer_id_idx').on(table.dealer_id),
        loanFilesStatusIdx: index('loan_files_loan_status_idx').on(table.loan_status),
    };
});

export const loanPayments = pgTable('loan_payments', {
    id: varchar('id', { length: 255 }).primaryKey(), // LPAY-YYYYMMDD-SEQ
    loan_file_id: varchar('loan_file_id', { length: 255 }).references(() => loanFiles.id, { onDelete: 'cascade' }).notNull(),
    payment_type: varchar('payment_type', { length: 20 }).notNull(), // emi, prepayment, penalty, down_payment
    amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
    payment_mode: varchar('payment_mode', { length: 30 }), // upi, neft, cash, cheque, auto_debit
    transaction_id: text('transaction_id'),
    payment_date: timestamp('payment_date', { withTimezone: true }).notNull(),
    emi_month: integer('emi_month'), // Which EMI number this payment is for
    status: varchar('status', { length: 20 }).default('completed').notNull(), // completed, pending, failed, reversed
    receipt_url: text('receipt_url'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// --- DEALER PROFILE ---

export const dealerSubscriptions = pgTable('dealer_subscriptions', {
    id: varchar('id', { length: 255 }).primaryKey(),
    dealer_id: varchar('dealer_id', { length: 255 }).references(() => accounts.id).notNull(),
    plan_name: varchar('plan_name', { length: 50 }).notNull(), // basic, standard, premium
    status: varchar('status', { length: 20 }).default('active').notNull(), // active, expired, cancelled
    started_at: timestamp('started_at', { withTimezone: true }).notNull(),
    expires_at: timestamp('expires_at', { withTimezone: true }),
    features: jsonb('features'), // Allowed features based on plan
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// --- CAMPAIGN SEGMENTS ---

export const campaignSegments = pgTable('campaign_segments', {
    id: varchar('id', { length: 255 }).primaryKey(), // SEG-SEQ
    name: text('name').notNull(),
    description: text('description'),
    dealer_id: varchar('dealer_id', { length: 255 }).references(() => accounts.id),
    is_prebuilt: boolean('is_prebuilt').default(false), // true for system segments like "All Customers", "Hot Leads"
    filter_criteria: jsonb('filter_criteria').notNull(), // { conditions: [{ field, operator, value }], logic: 'AND' | 'OR' }
    estimated_audience: integer('estimated_audience'),
    created_by: uuid('created_by').references(() => users.id),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// --- RELATIONS FOR NEW TABLES ---

export const campaignsRelations = relations(campaigns, ({ one }) => ({
    creator: one(users, { fields: [campaigns.created_by], references: [users.id] }),
}));

export const loanApplicationsRelations = relations(loanApplications, ({ one }) => ({
    lead: one(leads, { fields: [loanApplications.lead_id], references: [leads.id] }),
    creator: one(users, { fields: [loanApplications.created_by], references: [users.id] }),
}));

export const kycDocumentsRelations = relations(kycDocuments, ({ one }) => ({
    lead: one(leads, { fields: [kycDocuments.lead_id], references: [leads.id] }),
}));

export const kycVerificationsRelations = relations(kycVerifications, ({ one }) => ({
    lead: one(leads, { fields: [kycVerifications.lead_id], references: [leads.id] }),
}));

export const consentRecordsRelations = relations(consentRecords, ({ one }) => ({
    lead: one(leads, { fields: [consentRecords.lead_id], references: [leads.id] }),
    verifier: one(users, { fields: [consentRecords.verified_by], references: [users.id] }),
}));

export const coBorrowersRelations = relations(coBorrowers, ({ one, many }) => ({
    lead: one(leads, { fields: [coBorrowers.lead_id], references: [leads.id] }),
    documents: many(coBorrowerDocuments),
}));

export const coBorrowerDocumentsRelations = relations(coBorrowerDocuments, ({ one }) => ({
    coBorrower: one(coBorrowers, { fields: [coBorrowerDocuments.co_borrower_id], references: [coBorrowers.id] }),
    lead: one(leads, { fields: [coBorrowerDocuments.lead_id], references: [leads.id] }),
}));

export const deployedAssetsRelations = relations(deployedAssets, ({ one, many }) => ({
    inventory: one(inventory, { fields: [deployedAssets.inventory_id], references: [inventory.id] }),
    lead: one(leads, { fields: [deployedAssets.lead_id], references: [leads.id] }),
    deal: one(deals, { fields: [deployedAssets.deal_id], references: [deals.id] }),
    dealer: one(accounts, { fields: [deployedAssets.dealer_id], references: [accounts.id] }),
    creator: one(users, { fields: [deployedAssets.created_by], references: [users.id] }),
    history: many(deploymentHistory),
    serviceTickets: many(serviceTickets),
}));

export const deploymentHistoryRelations = relations(deploymentHistory, ({ one }) => ({
    asset: one(deployedAssets, { fields: [deploymentHistory.deployed_asset_id], references: [deployedAssets.id] }),
    performer: one(users, { fields: [deploymentHistory.performed_by], references: [users.id] }),
}));

export const serviceTicketsRelations = relations(serviceTickets, ({ one }) => ({
    asset: one(deployedAssets, { fields: [serviceTickets.deployed_asset_id], references: [deployedAssets.id] }),
    dealer: one(accounts, { fields: [serviceTickets.dealer_id], references: [accounts.id] }),
    assignee: one(users, { fields: [serviceTickets.assigned_to], references: [users.id] }),
    resolver: one(users, { fields: [serviceTickets.resolved_by], references: [users.id] }),
    creator: one(users, { fields: [serviceTickets.created_by], references: [users.id] }),
}));

export const loanFilesRelations = relations(loanFiles, ({ one, many }) => ({
    lead: one(leads, { fields: [loanFiles.lead_id], references: [leads.id] }),
    loanApplication: one(loanApplications, { fields: [loanFiles.loan_application_id], references: [loanApplications.id] }),
    dealer: one(accounts, { fields: [loanFiles.dealer_id], references: [accounts.id] }),
    payments: many(loanPayments),
}));

export const loanPaymentsRelations = relations(loanPayments, ({ one }) => ({
    loanFile: one(loanFiles, { fields: [loanPayments.loan_file_id], references: [loanFiles.id] }),
}));

export const campaignSegmentsRelations = relations(campaignSegments, ({ one }) => ({
    dealer: one(accounts, { fields: [campaignSegments.dealer_id], references: [accounts.id] }),
    creator: one(users, { fields: [campaignSegments.created_by], references: [users.id] }),
}));

// --- INTELLICAR TELEMETRY (ORM definitions for existing tables) ---

export const deviceBatteryMap = pgTable('device_battery_map', {
    id: varchar('id', { length: 255 }).primaryKey(),
    device_id: varchar('device_id', { length: 100 }).notNull(),
    battery_serial: varchar('battery_serial', { length: 100 }),
    vehicle_number: varchar('vehicle_number', { length: 50 }),
    vehicle_type: varchar('vehicle_type', { length: 50 }),
    customer_name: text('customer_name'),
    customer_phone: varchar('customer_phone', { length: 20 }),
    dealer_id: varchar('dealer_id', { length: 255 }),
    status: varchar('status', { length: 20 }).default('active'),
    installed_at: timestamp('installed_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const batteryAlerts = pgTable('battery_alerts', {
    id: varchar('id', { length: 255 }).primaryKey(),
    device_id: varchar('device_id', { length: 100 }).notNull(),
    alert_type: varchar('alert_type', { length: 50 }).notNull(),
    severity: varchar('severity', { length: 20 }).notNull(),
    message: text('message'),
    value: decimal('value', { precision: 10, scale: 2 }),
    threshold: decimal('threshold', { precision: 10, scale: 2 }),
    acknowledged: boolean('acknowledged').default(false),
    acknowledged_at: timestamp('acknowledged_at', { withTimezone: true }),
    acknowledged_by: text('acknowledged_by'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// --- APP SETTINGS ---

export const appSettings = pgTable('app_settings', {
    key: text('key').primaryKey(),
    value: jsonb('value').notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// --- DEALER LEAD SCRAPER MODULE ---

export const scraperRuns = pgTable('scraper_runs', {
    id: varchar('id', { length: 255 }).primaryKey(),                      // SCRAPE-YYYYMMDD-SEQ
    triggered_by: uuid('triggered_by').references(() => users.id).notNull(),
    status: varchar('status', { length: 20 }).default('running').notNull(), // running, completed, failed, cancelled
    started_at: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    completed_at: timestamp('completed_at', { withTimezone: true }),
    search_queries: jsonb('search_queries'),                               // string[] of queries used
    total_found: integer('total_found').default(0),
    new_leads_saved: integer('new_leads_saved').default(0),
    duplicates_skipped: integer('duplicates_skipped').default(0),
    error_message: text('error_message'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    scraperRunsStatusIdx: index('scraper_runs_status_idx').on(table.status),
    scraperRunsTriggeredByIdx: index('scraper_runs_triggered_by_idx').on(table.triggered_by),
}));

export const scrapedDealerLeads = pgTable('scraped_dealer_leads', {
    id: varchar('id', { length: 255 }).primaryKey(),                      // SDL-YYYYMMDD-SEQ
    scraper_run_id: varchar('scraper_run_id', { length: 255 }).references(() => scraperRuns.id).notNull(),
    dealer_name: text('dealer_name').notNull(),
    phone: varchar('phone', { length: 20 }),
    location_city: varchar('location_city', { length: 100 }),
    location_state: varchar('location_state', { length: 100 }),
    source_url: text('source_url'),
    raw_data: jsonb('raw_data'),                                          // full scraped payload for reference
    email: varchar('email', { length: 255 }),
    gst_number: varchar('gst_number', { length: 20 }),
    business_type: varchar('business_type', { length: 50 }),
    products_sold: text('products_sold'),
    website: text('website'),
    quality_score: integer('quality_score'),
    phone_valid: boolean('phone_valid'),
    // Assignment (Sales Head assigns to Sales Manager)
    assigned_to: uuid('assigned_to').references(() => users.id),         // null = unassigned
    assigned_by: uuid('assigned_by').references(() => users.id),
    assigned_at: timestamp('assigned_at', { withTimezone: true }),
    // Exploration workflow (Sales Manager drives this)
    exploration_status: varchar('exploration_status', { length: 30 }).default('unassigned').notNull(),
    // Values: unassigned, assigned, exploring, explored, not_interested
    exploration_notes: text('exploration_notes'),
    explored_at: timestamp('explored_at', { withTimezone: true }),
    // Promotion to full CRM lead (optional)
    converted_lead_id: varchar('converted_lead_id', { length: 255 }).references(() => leads.id),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    sdlPhoneIdx: index('sdl_phone_idx').on(table.phone),
    sdlNameCityIdx: index('sdl_name_city_idx').on(table.dealer_name, table.location_city),
    sdlSourceUrlIdx: index('sdl_source_url_idx').on(table.source_url),
    sdlRunIdx: index('sdl_run_idx').on(table.scraper_run_id),
    sdlAssignedToIdx: index('sdl_assigned_to_idx').on(table.assigned_to),
    sdlStatusIdx: index('sdl_status_idx').on(table.exploration_status),
}));

export const scraperDedupLogs = pgTable('scraper_dedup_logs', {
    id: varchar('id', { length: 255 }).primaryKey(),                      // DDUP-YYYYMMDD-SEQ
    scraper_run_id: varchar('scraper_run_id', { length: 255 }).references(() => scraperRuns.id).notNull(),
    raw_dealer_name: text('raw_dealer_name'),
    raw_phone: varchar('raw_phone', { length: 20 }),
    raw_location: text('raw_location'),
    raw_source_url: text('raw_source_url'),
    skip_reason: varchar('skip_reason', { length: 50 }).notNull(),        // duplicate_phone, duplicate_name_location, duplicate_url
    matched_lead_id: varchar('matched_lead_id', { length: 255 }),        // existing SDL id that matched
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    ddupRunIdx: index('ddup_run_idx').on(table.scraper_run_id),
}));

export const scraperSearchQueries = pgTable('scraper_search_queries', {
    id: varchar('id', { length: 255 }).primaryKey(),             // SQ-YYYYMMDD-SEQ
    query_text: text('query_text').notNull(),
    is_active: boolean('is_active').notNull().default(true),
    created_by: uuid('created_by').references(() => users.id).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
    sqActiveIdx: index('sq_active_idx').on(table.is_active),
}));

export const scraperSearchQueriesRelations = relations(scraperSearchQueries, ({ one }) => ({
    createdBy: one(users, { fields: [scraperSearchQueries.created_by], references: [users.id] }),
}));

export const scraperSchedules = pgTable('scraper_schedules', {
    id: varchar('id', { length: 255 }).primaryKey(),
    frequency: varchar('frequency', { length: 20 }).notNull(),
    day_of_week: integer('day_of_week'),
    time_of_day: varchar('time_of_day', { length: 5 }).notNull().default('03:00'),
    is_active: boolean('is_active').notNull().default(true),
    last_run_at: timestamp('last_run_at', { withTimezone: true }),
    created_by: uuid('created_by').references(() => users.id).notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const scraperSchedulesRelations = relations(scraperSchedules, ({ one }) => ({
    createdBy: one(users, { fields: [scraperSchedules.created_by], references: [users.id] }),
}));

// Relations for scraper tables
export const scraperRunsRelations = relations(scraperRuns, ({ one, many }) => ({
    triggeredBy: one(users, { fields: [scraperRuns.triggered_by], references: [users.id] }),
    leads: many(scrapedDealerLeads),
    dedupLogs: many(scraperDedupLogs),
}));

export const scrapedDealerLeadsRelations = relations(scrapedDealerLeads, ({ one }) => ({
    scraperRun: one(scraperRuns, { fields: [scrapedDealerLeads.scraper_run_id], references: [scraperRuns.id] }),
    assignedTo: one(users, { fields: [scrapedDealerLeads.assigned_to], references: [users.id] }),
    assignedBy: one(users, { fields: [scrapedDealerLeads.assigned_by], references: [users.id] }),
    convertedLead: one(leads, { fields: [scrapedDealerLeads.converted_lead_id], references: [leads.id] }),
}));

export const scraperDedupLogsRelations = relations(scraperDedupLogs, ({ one }) => ({
    scraperRun: one(scraperRuns, { fields: [scraperDedupLogs.scraper_run_id], references: [scraperRuns.id] }),
}));

export const dealerOnboardingApplications = pgTable("dealer_onboarding_applications", {
    id: uuid("id").defaultRandom().primaryKey(),

    dealerUserId: uuid("dealer_user_id"),

    companyName: text("company_name"),
    companyType: varchar("company_type", { length: 50 }),
    gstNumber: varchar("gst_number", { length: 20 }),
    panNumber: varchar("pan_number", { length: 20 }),

    businessAddress: jsonb("business_address"),
    registeredAddress: jsonb("registered_address"),

    ownerName: text("owner_name"),
    ownerPhone: varchar("owner_phone", { length: 20 }),
    ownerEmail: text("owner_email"),

    salesManagerName: text("sales_manager_name"),
    salesManagerEmail: text("sales_manager_email"),
    salesManagerMobile: text("sales_manager_mobile"),

    itarangSignatory1Name: text("itarang_signatory_1_name"),
    itarangSignatory1Email: text("itarang_signatory_1_email"),
    itarangSignatory1Mobile: text("itarang_signatory_1_mobile"),

    itarangSignatory2Name: text("itarang_signatory_2_name"),
    itarangSignatory2Email: text("itarang_signatory_2_email"),
    itarangSignatory2Mobile: text("itarang_signatory_2_mobile"),

    bankName: text("bank_name"),
    accountNumber: text("account_number"),
    ifscCode: text("ifsc_code"),
    beneficiaryName: text("beneficiary_name"),

    financeEnabled: boolean("finance_enabled").default(false),

    onboardingStatus: varchar("onboarding_status", { length: 50 }).default("draft"),
    reviewStatus: varchar("review_status", { length: 50 }).default("draft"),

    agreementStatus: varchar("agreement_status", { length: 50 }).default("not_generated"),
    requestId: text("request_id"),
    providerDocumentId: text("provider_document_id"),
    providerSigningUrl: text("provider_signing_url"),
    providerRawResponse: jsonb("provider_raw_response"),

    signedAgreementUrl: text("signed_agreement_url"),
    auditTrailUrl: text("audit_trail_url"),
    signedAgreementStoragePath: text("signed_agreement_storage_path"),
    auditTrailStoragePath: text("audit_trail_storage_path"),

    signedAt: timestamp("signed_at"),
    lastActionTimestamp: timestamp("last_action_timestamp"),
    stampStatus: varchar("stamp_status", { length: 50 }),
    completionStatus: varchar("completion_status", { length: 50 }),

    correctionRemarks: text("correction_remarks"),
    rejectionRemarks: text("rejection_remarks"),
    rejectionReason: text("rejection_reason"),
    rejectedAt: timestamp("rejected_at"),
    approvedAt: timestamp("approved_at"),

    dealerAccountStatus: varchar("dealer_account_status", { length: 50 }).default("inactive"),
    dealerCode: text("dealer_code"),

    submittedAt: timestamp("submitted_at"),

    agreementLastInitiatedAt: timestamp("agreement_last_initiated_at"),
    agreementExpiredAt: timestamp("agreement_expired_at"),
    agreementFailedAt: timestamp("agreement_failed_at"),
    agreementFailureReason: text("agreement_failure_reason"),
    agreementCompletedAt: timestamp("agreement_completed_at"),

    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
});

export const dealerAgreementSigners = pgTable("dealer_agreement_signers", {
    id: uuid("id").defaultRandom().primaryKey(),

    applicationId: uuid("application_id")
        .notNull()
        .references(() => dealerOnboardingApplications.id, { onDelete: "cascade" }),

    providerDocumentId: text("provider_document_id"),
    requestId: text("request_id"),

    signerRole: varchar("signer_role", { length: 50 }).notNull(),
    signerName: text("signer_name").notNull(),
    signerEmail: text("signer_email"),
    signerMobile: text("signer_mobile"),
    signingMethod: varchar("signing_method", { length: 50 }),

    providerSignerIdentifier: text("provider_signer_identifier"),
    providerSigningUrl: text("provider_signing_url"),

    signerStatus: varchar("signer_status", { length: 50 }).default("pending").notNull(),

    signedAt: timestamp("signed_at"),
    lastEventAt: timestamp("last_event_at"),

    providerRawResponse: jsonb("provider_raw_response").default({}),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
    appIdx: index("dealer_agreement_signers_application_id_idx").on(table.applicationId),
    docIdx: index("dealer_agreement_signers_provider_document_id_idx").on(table.providerDocumentId),
    statusIdx: index("dealer_agreement_signers_signer_status_idx").on(table.signerStatus),
}));


export const dealerAgreementEvents = pgTable("dealer_agreement_events", {
    id: uuid("id").defaultRandom().primaryKey(),

    applicationId: uuid("application_id")
        .notNull()
        .references(() => dealerOnboardingApplications.id, { onDelete: "cascade" }),

    providerDocumentId: text("provider_document_id"),
    requestId: text("request_id"),

    eventType: varchar("event_type", { length: 100 }).notNull(),
    signerRole: varchar("signer_role", { length: 50 }),
    eventStatus: varchar("event_status", { length: 50 }),
    eventPayload: jsonb("event_payload").default({}),

    createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
    appIdx: index("dealer_agreement_events_application_id_idx").on(table.applicationId),
    docIdx: index("dealer_agreement_events_provider_document_id_idx").on(table.providerDocumentId),
    createdIdx: index("dealer_agreement_events_created_at_idx").on(table.createdAt),
}));

export const dealerOnboardingDocuments = pgTable("dealer_onboarding_documents", {
    id: uuid("id").defaultRandom().primaryKey(),

    applicationId: uuid("application_id")
        .notNull()
        .references(() => dealerOnboardingApplications.id, { onDelete: "cascade" }),

    documentType: varchar("document_type", { length: 100 }).notNull(),

    bucketName: text("bucket_name").notNull(),
    storagePath: text("storage_path").notNull(),

    fileName: text("file_name").notNull(),
    fileUrl: text("file_url"),

    mimeType: varchar("mime_type", { length: 100 }),
    fileSize: bigint("file_size", { mode: "number" }),

    uploadedBy: uuid("uploaded_by"),
    uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),

    docStatus: varchar("doc_status", { length: 30 }).default("uploaded").notNull(),
    verificationStatus: varchar("verification_status", { length: 30 }).default("pending"),

    verifiedAt: timestamp("verified_at"),
    verifiedBy: uuid("verified_by"),

    rejectionReason: text("rejection_reason"),

    extractedData: jsonb("extracted_data").default({}),
    apiVerificationResults: jsonb("api_verification_results").default({}),
    metadata: jsonb("metadata").default({}),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const dealerOnboardingApplicationsRelations = relations(
    dealerOnboardingApplications,
    ({ many }) => ({
        documents: many(dealerOnboardingDocuments),
        agreementSigners: many(dealerAgreementSigners),
        agreementEvents: many(dealerAgreementEvents),
    })
);

export const dealerOnboardingDocumentsRelations = relations(
    dealerOnboardingDocuments,
    ({ one }) => ({
        application: one(dealerOnboardingApplications, {
            fields: [dealerOnboardingDocuments.applicationId],
            references: [dealerOnboardingApplications.id],
        }),
    })
);

export const dealerAgreementSignersRelations = relations(
    dealerAgreementSigners,
    ({ one }) => ({
        application: one(dealerOnboardingApplications, {
            fields: [dealerAgreementSigners.applicationId],
            references: [dealerOnboardingApplications.id],
        }),
    })
);

export const dealerAgreementEventsRelations = relations(
    dealerAgreementEvents,
    ({ one }) => ({
        application: one(dealerOnboardingApplications, {
            fields: [dealerAgreementEvents.applicationId],
            references: [dealerOnboardingApplications.id],
        }),
    })
);

// export const dealerOnboardingApplicationsRelations = relations(
//     dealerOnboardingApplications,
//     ({ many }) => ({
//         documents: many(dealerOnboardingDocuments),
//         agreementSigners: many(dealerAgreementSigners),
//         agreementEvents: many(dealerAgreementEvents),
//     })
// );

// export const dealerAgreementSignersRelations = relations(
//     dealerAgreementSigners,
//     ({ one }) => ({
//         application: one(dealerOnboardingApplications, {
//             fields: [dealerAgreementSigners.applicationId],
//             references: [dealerOnboardingApplications.id],
//         }),
//     })
// );

// export const dealerAgreementEventsRelations = relations(
//     dealerAgreementEvents,
//     ({ one }) => ({
//         application: one(dealerOnboardingApplications, {
//             fields: [dealerAgreementEvents.applicationId],
//             references: [dealerOnboardingApplications.id],
//         }),
//     })
// );





