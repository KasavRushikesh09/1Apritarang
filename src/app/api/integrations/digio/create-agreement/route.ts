import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { buildTarangDealerAgreementHtml } from "@/lib/agreement/dealer-agreement-template";

type AgreementPayload = {
  company?: {
    companyName?: string;
    companyAddress?: string;
    companyType?: string;
    gstNumber?: string;
    companyPanNumber?: string;
    companyCity?: string;
    companyDistrict?: string;
    companyState?: string;
    companyPinCode?: string;
  };
  ownership?: {
    ownerName?: string;
    ownerPhone?: string;
    ownerEmail?: string;
    ownerAge?: string;
    ownerAddressLine1?: string;
    ownerCity?: string;
    ownerDistrict?: string;
    ownerState?: string;
    ownerPinCode?: string;
    bankName?: string;
    accountNumber?: string;
    ifsc?: string;
    beneficiaryName?: string;
    branch?: string;
    accountType?: string;
  };
  agreement?: {
    dateOfSigning?: string;
    expiryDays?: number;
    executionPlace?: string;
    dealerSignerName?: string;
    dealerSignerEmail?: string;
    dealerSignerPhone?: string;
    dealerSignerDesignation?: string;
    dealerSigningMethod?: string;
    financierName?: string;
    financerLegalEntityName?: string;
    sequenceMode?: "sequential" | "parallel";
    vehicleType?: string;
    manufacturer?: string;
    brand?: string;
    statePresence?: string;
    itarangSignatory1?: {
      name?: string;
      designation?: string;
      email?: string;
      mobile?: string;
      address?: string;
      signingMethod?: string;
    };
    itarangSignatory2?: {
      name?: string;
      designation?: string;
      email?: string;
      mobile?: string;
      address?: string;
      signingMethod?: string;
    };
    financierSignatory?: {
      name?: string;
      designation?: string;
      email?: string;
      mobile?: string;
      address?: string;
      signingMethod?: string;
    };
  };
};

type SignerItem = {
  identifier: string;
  name: string;
  reason: string;
  sign_type: string;
};

function cleanEnv(value?: string) {
  return value?.trim().replace(/^[\"']|[\"']$/g, "");
}

function cleanString(value?: string) {
  return (value || "").trim();
}

function cleanPhone(value?: string) {
  return (value || "").replace(/\D/g, "");
}

function isValidEmail(value?: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanString(value));
}

function isValidPhone(value?: string) {
  return /^[6-9]\d{9}$/.test(cleanPhone(value));
}

function basicAuthHeader(clientId: string, clientSecret: string) {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

function mapSigningMethod(method?: string) {
  switch (method) {
    case "aadhaar_esign":
      return "aadhaar";
    case "dsc_signature":
      return "dsc";
    case "electronic_signature":
    default:
      return "electronic";
  }
}

function buildSigner(
  email: string | undefined,
  mobile: string | undefined,
  name: string | undefined,
  reason: string,
  signingMethod?: string
): SignerItem | null {
  const cleanedName = cleanString(name);
  const cleanedEmail = cleanString(email).toLowerCase();
  const cleanedMobile = cleanPhone(mobile);

  if (!cleanedName) return null;

  const identifier = isValidEmail(cleanedEmail)
    ? cleanedEmail
    : isValidPhone(cleanedMobile)
      ? cleanedMobile
      : "";

  if (!identifier) return null;

  return {
    identifier,
    name: cleanedName,
    reason,
    sign_type: mapSigningMethod(signingMethod),
  };
}

function findDuplicateIdentifiers(signers: SignerItem[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const signer of signers) {
    if (seen.has(signer.identifier)) {
      duplicates.add(signer.identifier);
    }
    seen.add(signer.identifier);
  }

  return Array.from(duplicates);
}

async function renderPdfFromHtml(html: string) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "14mm",
        right: "12mm",
        bottom: "14mm",
        left: "12mm",
      },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

function normalizeDigioAgreementStatus(parsed: any) {
  const digioStatus = String(
    parsed?.agreement_status || parsed?.status || ""
  )
    .trim()
    .toLowerCase();

  if (digioStatus === "completed" || digioStatus === "signed") {
    return "completed";
  }

  if (digioStatus === "partially_signed" || digioStatus === "partial") {
    return "partially_signed";
  }

  return "sent_for_signature";
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AgreementPayload;

    const clientId = cleanEnv(process.env.DIGIO_CLIENT_ID);
    const clientSecret = cleanEnv(process.env.DIGIO_CLIENT_SECRET);
    const baseUrl =
      cleanEnv(process.env.DIGIO_BASE_URL) || "https://ext.digio.in:444";

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Missing Digio configuration. Set DIGIO_CLIENT_ID and DIGIO_CLIENT_SECRET.",
        },
        { status: 500 }
      );
    }

    const agreement = body.agreement;
    const company = body.company;
    const ownership = body.ownership;

    if (!agreement) {
      return NextResponse.json(
        { success: false, message: "Agreement payload is missing." },
        { status: 400 }
      );
    }

    const dealerSigner = buildSigner(
      agreement.dealerSignerEmail,
      agreement.dealerSignerPhone,
      agreement.dealerSignerName,
      "dealer signer",
      agreement.dealerSigningMethod
    );

    const financierSigner = buildSigner(
      agreement.financierSignatory?.email,
      agreement.financierSignatory?.mobile,
      agreement.financierSignatory?.name,
      "financier signer",
      agreement.financierSignatory?.signingMethod
    );

    const itarangSigner1 = buildSigner(
      agreement.itarangSignatory1?.email,
      agreement.itarangSignatory1?.mobile,
      agreement.itarangSignatory1?.name,
      "iTarang signer 1",
      agreement.itarangSignatory1?.signingMethod
    );

    const itarangSigner2 = buildSigner(
      agreement.itarangSignatory2?.email,
      agreement.itarangSignatory2?.mobile,
      agreement.itarangSignatory2?.name,
      "iTarang signer 2",
      agreement.itarangSignatory2?.signingMethod
    );

    const signers = [
      dealerSigner,
      financierSigner,
      itarangSigner1,
      itarangSigner2,
    ].filter(Boolean) as SignerItem[];

    if (!dealerSigner) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Dealer signatory is invalid. Please provide valid dealer signer name and a valid email or mobile number.",
        },
        { status: 400 }
      );
    }

    if (!financierSigner) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Financier signatory is invalid. Please provide valid financier signer name and a valid email or mobile number.",
        },
        { status: 400 }
      );
    }

    if (!itarangSigner1 || !itarangSigner2) {
      return NextResponse.json(
        {
          success: false,
          message:
            "iTarang signatories are invalid. Please provide valid names and valid email or mobile for both signatories.",
        },
        { status: 400 }
      );
    }

    const duplicateIdentifiers = findDuplicateIdentifiers(signers);

    if (duplicateIdentifiers.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Duplicate signer email/mobile found: ${duplicateIdentifiers.join(
            ", "
          )}. Each signer must use a unique email or mobile.`,
        },
        { status: 400 }
      );
    }

    const html = buildTarangDealerAgreementHtml({
      company: {
        companyName: company?.companyName,
        companyAddress: company?.companyAddress,
        companyType: company?.companyType,
        gstNumber: company?.gstNumber,
        companyPanNumber: company?.companyPanNumber,
        companyCity: company?.companyCity,
        companyDistrict: company?.companyDistrict,
        companyState: company?.companyState,
        companyPinCode: company?.companyPinCode,
      },
      ownership: {
        ownerName: ownership?.ownerName,
        ownerPhone: ownership?.ownerPhone,
        ownerEmail: ownership?.ownerEmail,
        ownerAge: ownership?.ownerAge,
        ownerAddressLine1: ownership?.ownerAddressLine1,
        ownerCity: ownership?.ownerCity,
        ownerDistrict: ownership?.ownerDistrict,
        ownerState: ownership?.ownerState,
        ownerPinCode: ownership?.ownerPinCode,
        bankName: ownership?.bankName,
        accountNumber: ownership?.accountNumber,
        ifsc: ownership?.ifsc,
        beneficiaryName: ownership?.beneficiaryName,
        branch: ownership?.branch,
        accountType: ownership?.accountType,
      },
      agreement: {
        dateOfSigning: agreement.dateOfSigning,
        executionPlace: agreement.executionPlace,
        dealerSignerName: agreement.dealerSignerName,
        dealerSignerDesignation: agreement.dealerSignerDesignation,
        dealerSignerEmail: agreement.dealerSignerEmail,
        dealerSignerPhone: agreement.dealerSignerPhone,
        financierName: agreement.financierName,
        financerLegalEntityName: agreement.financerLegalEntityName,
        vehicleType: agreement.vehicleType,
        manufacturer: agreement.manufacturer,
        brand: agreement.brand,
        statePresence: agreement.statePresence,
        itarangSignatory1: agreement.itarangSignatory1,
        itarangSignatory2: agreement.itarangSignatory2,
        financierSignatory: agreement.financierSignatory,
      },
    });

    const pdfBuffer = await renderPdfFromHtml(html);
    const agreementBase64 = pdfBuffer.toString("base64");

    const appBaseUrl =
      cleanEnv(process.env.APP_URL) ||
      cleanEnv(process.env.NEXT_PUBLIC_APP_URL) ||
      "http://localhost:3000";

    const payload = {
      file_name: `${cleanString(company?.companyName) || "dealer"}-agreement.pdf`,
      file_data: agreementBase64,
      expire_in_days: 5,
      notify_signers: true,
      send_sign_link: true,
      include_authentication_url: true,
      sequential: true,
      signers,

    };

    console.log(
      "DIGIO DEBUG -> REQUEST URL:",
      `${baseUrl}/v2/client/document/uploadpdf`
    );
    console.log("DIGIO DEBUG -> SIGNERS:", signers);

    const digioResponse = await fetch(
      `${baseUrl}/v2/client/document/uploadpdf`,
      {
        method: "POST",
        headers: {
          Authorization: basicAuthHeader(clientId, clientSecret),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      }
    );

    const rawText = await digioResponse.text();

    console.log("DIGIO DEBUG -> STATUS:", digioResponse.status);
    console.log("DIGIO DEBUG -> RAW RESPONSE:", rawText);

    let parsed: any = null;
    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch {
      parsed = null;
    }

    if (!digioResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          message:
            parsed?.message ||
            parsed?.error_msg ||
            parsed?.error ||
            "Digio request failed",
          raw: parsed || rawText,
        },
        { status: digioResponse.status }
      );
    }

    const signingParties = Array.isArray(parsed?.signing_parties)
      ? parsed.signing_parties
      : [];

    const dealerParty =
      signingParties.find(
        (party: any) =>
          String(party?.reason || "").toLowerCase() === "dealer signer"
      ) || signingParties[0];

    const signingUrl =
      dealerParty?.authentication_url ||
      parsed?.signing_url ||
      parsed?.sign_url ||
      parsed?.redirect_url ||
      parsed?.authentication_url ||
      "";

    const normalizedStatus = normalizeDigioAgreementStatus(parsed);

    return NextResponse.json({
      success: true,
      data: {
        // Digio unique request id (sign request id)
        requestId:
          parsed?.id ||
          parsed?.request_id ||
          "",

        // Digio document id (used for download + audit trail)
        providerDocumentId:
          parsed?.document_id ||
          parsed?.documentId ||
          "",

        signingUrl,
        signerUrls: signingParties.map((party: any) => ({
          name: party?.name || "",
          reason: party?.reason || "",
          identifier: party?.identifier || "",
          authenticationUrl: party?.authentication_url || "",
          status: party?.status || "",
        })),
        status: normalizedStatus,
        rawResponse: rawText,
      },
    });
  } catch (error) {
    console.error("DIGIO CREATE AGREEMENT ERROR", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unexpected server error while creating Digio agreement.",
      },
      { status: 500 }
    );
  }
}