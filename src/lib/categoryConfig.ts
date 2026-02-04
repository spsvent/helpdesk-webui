// Category hierarchy configuration for tickets
// 3-level cascading structure: ProblemType -> ProblemTypeSub -> ProblemTypeSub2

export const CATEGORY_HIERARCHY: Record<string, Record<string, string[]>> = {
  Tech: {
    Audio: ["Parkwide", "Local"],
    "Display/Video": ["Digital Signage", "Monitor/TV", "Projector"],
    Communications: ["Radio/Walkie-Talkie", "Phone System", "Intercom/PA"],
    "Security Systems": [
      "Camera/CCTV",
      "Access Control (door locks, key cards)",
      "Alarm System",
    ],
    Printers: ["Receipt Printer", "Label Printer", "Office Printer", "Photo Printer"],
    "Lighting Control": ["Show Lighting", "Automated/Programmed Lighting"],
    POS: ["Hardware - POS", "Software - POS"],
    IT: ["Hardware - IT", "Software - IT", "Networking", "Photo System"],
    HelpDesk: ["Bug Report", "Feature Request", "Usability Issue"],
    "User Access": ["Password Reset", "Account Creation/Removal", "Permissions Request"],
    Other: [],
  },
  Operations: {
    "Dangerous Condition": [],
    Plumbing: [],
    Electrical: [],
    Equipment: ["Maintenance", "New Equipment Request"],
    Other: [],
  },
  "Grounds Keeping": {
    "Vegetation Management": [
      "Tree Care",
      "Shrub & Hedge Maintenance",
      "Flower Beds & Plantings",
      "Weed Control",
      "Plant Disease/Pest Damage",
      "Overgrowth/Encroachment",
    ],
    "Wildlife Control": [
      "Pest Animals",
      "Nesting/Hive Removal",
      "Animal Damage",
      "Wildlife Sighting/Concern",
      "Deceased Animal Removal",
    ],
    "Water Features": ["Pond Maintenance", "Drainage Problem"],
    "Turf & Soil": [
      "Damage/Bare Spots",
      "Erosion",
      "Grading/Leveling",
      "Soil Compaction",
      "Mulch/Ground Cover",
    ],
    "Hardscape & Pathways": [
      "Walkway/Path/Trail Repair",
      "Fencing Issue",
      "Retaining Wall",
      "Signage",
    ],
    "Debris & Hazards": [
      "Fallen Branch/Limb",
      "Storm Damage",
      "Safety Hazard",
      "General Cleanup",
    ],
    Furniture: [
      "Bench/Seating",
      "Table",
      "Trash Receptacle",
      "Planter/Container",
      "Shade Structure",
      "Damaged/Broken Furniture",
      "Missing Furniture",
    ],
    "General Grounds": ["Lost Item", "Out of Place Item", "Other/Miscellaneous"],
  },
  Janitorial: {
    "Cleaning Services": [
      "Restroom Cleaning",
      "Surface/Floor Cleaning",
      "Spill/Biohazard Cleanup",
    ],
    "Supplies & Waste": [
      "Restock (paper, soap, sanitizer)",
      "Supply Request",
      "Trash/Recycling Full",
      "Dispenser/Equipment Issue",
    ],
    "General Janitorial": ["Lost Item", "Out of Place Item", "Other/Miscellaneous"],
  },
  Marketing: {
    "Graphic Design/Sign Request": [],
  },
  HR: {},
  "Customer Service": {},
  Inventory: {
    "Stock Issues": [
      "Low Stock Alert",
      "Out of Stock",
      "Overstock/Excess",
      "Damaged Goods",
      "Expired Items",
    ],
    "Receiving": [
      "Shipment Arrival",
      "Missing Items",
      "Incorrect Items",
      "Damaged in Transit",
    ],
    "Stock Transfer": [
      "Location Transfer Request",
      "Inter-Department Request",
    ],
    "Counting & Audits": [
      "Cycle Count Request",
      "Discrepancy Found",
      "Audit Support",
    ],
    "Equipment & Supplies": [
      "Warehouse Equipment Issue",
      "Storage Issue",
      "Supply Request",
    ],
    Other: [],
  },
  Other: {},
};

// Pre-computed category lookups (avoids repeated Object.keys() calls)
const PROBLEM_TYPES = Object.keys(CATEGORY_HIERARCHY);
const PROBLEM_TYPE_SUBS: Record<string, string[]> = {};
const HAS_SUB_CATEGORIES: Record<string, boolean> = {};

for (const problemType of PROBLEM_TYPES) {
  const subs = CATEGORY_HIERARCHY[problemType];
  const subKeys = subs ? Object.keys(subs) : [];
  PROBLEM_TYPE_SUBS[problemType] = subKeys;
  HAS_SUB_CATEGORIES[problemType] = subKeys.length > 0;
}

// Get all ProblemType options (top level)
export function getProblemTypes(): string[] {
  return PROBLEM_TYPES;
}

// Get ProblemTypeSub options for a given ProblemType
export function getProblemTypeSubs(problemType: string): string[] {
  return PROBLEM_TYPE_SUBS[problemType] || [];
}

// Get ProblemTypeSub2 options for a given ProblemType and ProblemTypeSub
export function getProblemTypeSub2s(
  problemType: string,
  problemTypeSub: string
): string[] {
  const subs = CATEGORY_HIERARCHY[problemType];
  if (!subs) return [];
  return subs[problemTypeSub] || [];
}

// Check if a ProblemType has sub-categories
export function hasSubCategories(problemType: string): boolean {
  return HAS_SUB_CATEGORIES[problemType] ?? false;
}

// Check if a ProblemTypeSub has sub2 categories
export function hasSub2Categories(
  problemType: string,
  problemTypeSub: string
): boolean {
  const subs = CATEGORY_HIERARCHY[problemType];
  if (!subs) return false;
  const sub2s = subs[problemTypeSub];
  return sub2s ? sub2s.length > 0 : false;
}
