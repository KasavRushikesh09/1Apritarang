type ParsedAadhaar = {
  fullName?: string | null;
  fatherName?: string | null;
  dob?: string | null;
  gender?: string | null;
  aadhaarNumber?: string | null;
  phone?: string | null;
  address?: string | null;
  pincode?: string | null;
};

function cleanSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function titleCase(value: string): string {
  return cleanSpaces(value)
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeText(rawText: string): { text: string; lines: string[] } {
  const lines = rawText
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .split("\n")
    .map((line) => cleanSpaces(line))
    .filter(Boolean);

  return {
    text: cleanSpaces(lines.join(" ")),
    lines,
  };
}

function formatDob(raw: string): string | null {
  const cleaned = raw.replace(/[^\d/.-]/g, "");
  const match = cleaned.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

function pickLikelyName(lines: string[]): string | null {
  for (const line of lines) {
    const cleaned = line.replace(/[^A-Za-z\s]/g, "").trim();
    if (!cleaned) continue;

    const words = cleaned.split(" ").filter(Boolean);
    if (words.length >= 2 && words.length <= 4) {
      const good = words.every((w) => /^[A-Za-z]+$/.test(w) && w.length >= 2);
      if (good) return titleCase(cleaned);
    }
  }
  return null;
}

function extractAddress(lines: string[], pincode?: string | null): string | null {
  let startIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (
      lower.startsWith("to ") ||
      lower.startsWith("address") ||
      lower.includes("s/o") ||
      lower.includes("d/o") ||
      lower.includes("w/o") ||
      lower.includes("tal") ||
      lower.includes("vtc") ||
      lower.includes("district") ||
      lower.includes("state") ||
      lower.includes("pin")
    ) {
      startIndex = i;
      break;
    }
  }

  if (startIndex === -1) return null;

  const stopWords = [
    "government of india",
    "unique identification authority of india",
    "uidai",
    "help@uidai",
    "www.uidai",
    "aadhaar",
  ];

  const addressParts: string[] = [];

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    if (stopWords.some((word) => lower.includes(word))) continue;
    if (/\b\d{4}\s?\d{4}\s?\d{4}\b/.test(line)) continue;

    addressParts.push(line.replace(/^to\s*/i, ""));
  }

  let address = cleanSpaces(addressParts.join(", ").replace(/,+/g, ", "));
  address = address.replace(/\s+,/g, ",").trim();

  if (!address) return null;
  if (pincode && !address.includes(pincode)) {
    address = `${address}, ${pincode}`;
  }

  return address;
}

export function parseAadhaarText(rawText: string): ParsedAadhaar {
  if (!rawText) return {};

  const { text, lines } = normalizeText(rawText);

  const result: ParsedAadhaar = {
    fullName: null,
    fatherName: null,
    dob: null,
    gender: null,
    aadhaarNumber: null,
    phone: null,
    address: null,
    pincode: null,
  };

  // Aadhaar Number
  const aadhaarMatch = text.match(/\b\d{4}\s?\d{4}\s?\d{4}\b/);
  if (aadhaarMatch) {
    result.aadhaarNumber = aadhaarMatch[0].replace(/\s/g, "");
  }

  // DOB
  const dobMatch =
    text.match(/\bDOB[:\s-]*([0-9]{2}[\/.-][0-9]{2}[\/.-][0-9]{4})/i) ||
    text.match(/\bDate of Birth[:\s-]*([0-9]{2}[\/.-][0-9]{2}[\/.-][0-9]{4})/i);
  if (dobMatch) {
    result.dob = formatDob(dobMatch[1]);
  }

  // Gender
  const genderMatch = text.match(/\b(Male|Female|M|F)\b/i);
  if (genderMatch) {
    const g = genderMatch[0].toLowerCase();
    result.gender = g === "m" ? "Male" : g === "f" ? "Female" : titleCase(genderMatch[0]);
  }

  // Phone
  const phoneMatch = text.match(/\b[6-9]\d{9}\b/);
  if (phoneMatch) {
    result.phone = phoneMatch[0];
  }

  // Father / Husband Name
  const fatherMatch =
    text.match(/\bS\/O[:\s-]*([A-Za-z\s]+?)(?=\b(?:Tal|VTC|PO|District|State|PIN|Pincode|DOB|Male|Female)\b|$)/i) ||
    text.match(/\bD\/O[:\s-]*([A-Za-z\s]+?)(?=\b(?:Tal|VTC|PO|District|State|PIN|Pincode|DOB|Male|Female)\b|$)/i) ||
    text.match(/\bW\/O[:\s-]*([A-Za-z\s]+?)(?=\b(?:Tal|VTC|PO|District|State|PIN|Pincode|DOB|Male|Female)\b|$)/i);

  if (fatherMatch) {
    result.fatherName = titleCase(fatherMatch[1]);
  }

  // Full Name
  const nameBeforeDob =
    text.match(/\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,3})\s+(?:DOB|Date of Birth)\b/) ||
    text.match(/\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){1,3})\s+(?:Male|Female)\b/);

  if (nameBeforeDob) {
    result.fullName = titleCase(nameBeforeDob[1]);
  }

  if (!result.fullName) {
    const nameBeforeFather = text.match(/\bTo\s+([A-Za-z\s]+?)\s+S\/O\b/i);
    if (nameBeforeFather) {
      result.fullName = titleCase(nameBeforeFather[1]);
    }
  }

  if (!result.fullName) {
    result.fullName = pickLikelyName(lines);
  }

  // Pincode
  const pinMatches = text.match(/\b\d{6}\b/g);
  if (pinMatches?.length) {
    result.pincode = pinMatches[pinMatches.length - 1];
  }

  // Address
  result.address = extractAddress(lines, result.pincode);

  return result;
}