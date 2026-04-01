<!-- SYSTEM ARCHITECTURE -->

<!-- A. High-level CRM flow -->

Login
  ↓
Dashboard
  ↓
Choose Action
  ├─ New Lead
  ├─ Process Loan
  ├─ Add Asset
  ├─ Start Campaign
  ├─ Lead Management
  ├─ Loan Management
  ├─ Asset Management
  ├─ Service Management
  ├─ Orders from OEM
  └─ Inventory

<!-- B. Lead creation flow -->

Dashboard
  ↓
New Lead
  ↓
Step 1 of 5: Create New Lead
  ↓
Enter Personal Information
  ↓
Enter Product Details
  ↓
Enter Vehicle Details (if applicable)
  ↓
Select Interest Level (Hot / Warm / Cold)
  ↓
Select Payment Method
  ├─ Cash
  └─ Finance / Dealer Finance / Other Finance
  ↓
Click Create Lead
  ↓
Lead saved with reference ID


<!-- workflow -->

Important rules from BRD:

this is a 5-step transactional 

reference ID is auto-generated like #IT-[YEAR]-[SEQUENCE]
OCR auto-fill can populate fields from Aadhaar upload
Hot lead behavior is different from Warm/Cold behavior

<!-- C. Step 2 KYC flow -->

Lead Created
  ↓
Check access for Step 2
  ↓
Allowed only if:
  - lead created
  - interest level = hot
  - payment method is not cash
  ↓
Customer KYC Step 2
  ↓
Consent Collection
  ├─ Digital Consent (Aadhaar eSign)
  └─ Manual Consent (signed PDF upload)
  ↓
Admin verifies consent
  ↓
Dealer uploads required documents
  ↓
Dealer enters coupon code
  ↓
Coupon validated and reserved
  ↓
Dealer clicks Submit for Verification
  ↓
Case moves to iTarang Admin Queue

<!-- D. Consent flow -->

Customer KYC
  ↓
Choose Consent Method
  ├─ Digital Aadhaar eSign
  │    ↓
  │  Send SMS / WhatsApp link
  │    ↓
  │  Customer opens link
  │    ↓
  │  Customer signs using Aadhaar OTP
  │    ↓
  │  Signed PDF received
  │    ↓
  │  Admin review pending
  │    ↓
  │  Admin approves / rejects
  │
  └─ Manual Consent
       ↓
     Generate consent PDF
       ↓
     Dealer prints and gets physical signature
       ↓
     Upload signed PDF
       ↓
     Admin review pending
       ↓
     Admin approves / rejects

<!-- E. Coupon flow -->

Admin creates coupon batch
  ↓
Coupons assigned to dealer
  ↓
Dealer receives coupon codes
  ↓
Dealer creates lead and uploads KYC docs
  ↓
Dealer enters coupon code
  ↓
System validates:
  - exists?
  - belongs to dealer?
  - available?
  - not expired?
  - lead does not already have one?
  ↓
If valid:
  coupon status = reserved
  ↓
Dealer submits lead for admin review
  ↓
Admin checks reserved coupon
  ↓
Admin clicks Run Verification
  ↓
Coupon status = used
  ↓
Verification starts
  ↓
Results stored
  ↓
Admin approves / rejects KYC

<!-- F. Admin verification flow -->

Dealer side complete
  - consent verified
  - required docs uploaded
  - coupon validated
  - submit for verification clicked
  ↓
Lead enters Admin KYC Queue
  ↓
Dealer editing locked
  ↓
Admin reviews documents
  ↓
Admin runs OCR + API verifications
  - Aadhaar
  - PAN
  - Bank
  - Face Match
  - CIBIL
  ↓
Admin decision
  ├─ Approve
  ├─ Reject
  └─ Request More Info

<!-- G. Dealer onboarding flow -->

Login / Create One
  ↓
Dealer Onboarding Workspace
  ↓
Step 1: Company Information
  ↓
Step 2: Compliance Documents
  ↓
Step 3: Ownership & Banking Details
  ↓
Step 4: Finance Enablement
  ├─ No  → Skip agreement
  └─ Yes → Go to Dealer Agreement
  ↓
Step 5: Dealer Agreement
  ↓
Step 6: Review & Submit
  ↓
Admin Review
  ├─ Approved
  ├─ Request Correction
  └─ Rejected

<!-- Simple master flow chart -->

  Dashboard
  ↓
Create New Lead
  ↓
Step 1: Lead Details
  ↓
If Hot Lead + Non-Cash
  ↓
Step 2: KYC
  ↓
Consent Completed
  ↓
Admin Consent Verification
  ↓
Documents Uploaded
  ↓
Coupon Validated
  ↓
Submit for Verification
  ↓
Admin KYC Queue
  ↓
Admin OCR/API Verification
  ↓
Decision
  ├─ Approved
  ├─ Rejected
  └─ Request More Info


