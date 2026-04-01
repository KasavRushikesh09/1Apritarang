export function parseAadhaarText(rawText: string) {
  if (!rawText) return {};

  const text = rawText
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const result: any = {
    fullName: null,
    fatherName: null,
    dob: null,
    gender: null,
    aadhaarNumber: null,
    phone: null,
    address: null,
    pincode: null,
  };

  // -------------------------
  // Aadhaar Number
  // -------------------------
  const aadhaarMatch = text.match(/\b\d{4}\s?\d{4}\s?\d{4}\b/);
  if (aadhaarMatch) {
    result.aadhaarNumber = aadhaarMatch[0].replace(/\s/g, "");
  }

  // -------------------------
  // DOB
  // -------------------------
  const dobMatch = text.match(/DOB[:\s]*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i);
  if (dobMatch) {
    const [day, month, year] = dobMatch[1].split("/");
    result.dob = `${year}-${month}-${day}`;
  }

  // -------------------------
  // Gender
  // -------------------------
  const genderMatch = text.match(/\b(Male|Female)\b/i);
  if (genderMatch) {
    result.gender = genderMatch[0];
  }

  // -------------------------
  // Phone
  // -------------------------
  const phoneMatch = text.match(/\b[6-9]\d{9}\b/);
  if (phoneMatch) {
    result.phone = phoneMatch[0];
  }

  // -------------------------
  // Father Name (S/O, D/O, W/O)
  // -------------------------
  const fatherMatch = text.match(/S\/O[:\s]*([A-Za-z\s]+)/i)
    || text.match(/D\/O[:\s]*([A-Za-z\s]+)/i)
    || text.match(/W\/O[:\s]*([A-Za-z\s]+)/i);

  if (fatherMatch) {
    result.fatherName = fatherMatch[1].trim();
  }

  // -------------------------
  // Name (line before DOB)
  // -------------------------
  const nameMatch = text.match(/([A-Z][a-z]+\s[A-Z][a-z]+\s[A-Z][a-z]+)\sDOB/i);
  if (nameMatch) {
    result.fullName = nameMatch[1];
  }

  // Fallback name detection
  if (!result.fullName) {
    const possibleName = text.match(/\b[A-Z][a-z]+\s[A-Z][a-z]+\s[A-Z][a-z]+\b/);
    if (possibleName) result.fullName = possibleName[0];
  }

  // -------------------------
  // Pincode
  // -------------------------
  const pinMatch = text.match(/\b\d{6}\b/);
  if (pinMatch) {
    result.pincode = pinMatch[0];
  }

  // -------------------------
  // Address Block
  // -------------------------
  const addressMatch = text.match(/To\s(.+?)\s\d{6}/i);
  if (addressMatch) {
    result.address = addressMatch[1].trim() + " " + result.pincode;
  }

  return result;
}