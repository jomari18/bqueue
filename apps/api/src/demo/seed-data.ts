// Fictional people and words for the demo barangay (spec 1.2: every name is made up).
import type { DocumentCode } from "@bq/shared";

export const FIRST_NAMES = {
  MALE: ["Jose", "Antonio", "Ramon", "Eduardo", "Carlo", "Miguel", "Paolo", "Rafael", "Dante", "Noel", "Arnel", "Jerome", "Renato", "Bayani", "Lito"],
  FEMALE: ["Maria", "Rosario", "Lorna", "Teresita", "Angelica", "Kristine", "Marites", "Liwayway", "Corazon", "Jasmine", "Rowena", "Imelda", "Divina", "Pilar", "Celia"],
} as const;

export const SURNAMES = [
  "Santos", "Reyes", "Cruz", "Bautista", "Ocampo", "Garcia", "Mendoza", "Torres", "Castillo", "Flores",
  "Villanueva", "Ramos", "Aquino", "Navarro", "Salazar", "Mercado", "Domingo", "Gutierrez", "Pascual", "Lim",
];

/** Purposes as residents type them, plus the quick chips of spec 3.2. */
export const PURPOSES = ["Employment", "School requirement", "Bank account", "Travel", "Scholarship", "Loan application"];

export const BUSINESS_NAMES = ["Sari-sari Store", "Carinderia", "Bigasan", "Ukay-ukay", "Vulcanizing Shop", "Water Refilling"];

export const DOCUMENT_TYPES: {
  code: DocumentCode;
  nameEn: string;
  nameFil: string;
  feeCentavos: number;
  validityDays: number;
  processingDays: number;
  needsBusinessName: boolean;
}[] = [
  { code: "CLEARANCE", nameEn: "Barangay Clearance", nameFil: "Barangay Clearance", feeCentavos: 10000, validityDays: 180, processingDays: 1, needsBusinessName: false },
  { code: "RESIDENCY", nameEn: "Certificate of Residency", nameFil: "Sertipiko ng Paninirahan", feeCentavos: 7500, validityDays: 180, processingDays: 1, needsBusinessName: false },
  { code: "INDIGENCY", nameEn: "Certificate of Indigency", nameFil: "Sertipiko ng Kahirapan", feeCentavos: 0, validityDays: 180, processingDays: 1, needsBusinessName: false },
  { code: "BUSINESS", nameEn: "Business Clearance", nameFil: "Business Clearance", feeCentavos: 50000, validityDays: 365, processingDays: 3, needsBusinessName: true },
  { code: "BRGY_ID", nameEn: "Barangay ID", nameFil: "Barangay ID", feeCentavos: 5000, validityDays: 365, processingDays: 2, needsBusinessName: false },
];
