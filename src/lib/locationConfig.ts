// SkyPark location options for tickets

export const LOCATION_OPTIONS = [
  "Admin Office",
  "Admission Restrooms",
  "Admissions",
  "Adventure Center",
  "Adventure Zipline",
  "Arrow's Adventure",
  "B-Rail",
  "Bike Park",
  "Billy's BBQ House",
  "Billy's Restrooms",
  "Birthday Room - Enchanted Forest",
  "Bridal Suite",
  "Campground",
  "CoachWorks",
  "Creekside",
  "Fantasy Forest",
  "Frozen Falls",
  "Gingerbread House Bakery",
  "Grounds Office",
  "Kringle's Coffee & Gifts",
  "Last Stop Shop (Exit Shop)",
  "Lunchbox",
  "Magic Tree Bouldering Room",
  "Merry Moments Photo Shoppe",
  "Park Wide",
  "Pavilion",
  "Pedal Pub",
  "Reindeer Adoption Room",
  "Reindeer Room (Speakeasy)",
  "Royal Encampment at Sky Trading",
  "Safety/Security",
  "Santa's House",
  "Santa's Village Mining Co",
  "Santa's Workshop",
  "Serrano Archery Range",
  "Silver Bells Arena",
  "Silver Bells Arena Concessions",
  "Sky Trading Co",
  "St. Nick's Patio and Grille",
  "St. Nicks Restrooms",
  "Terrace",
  "Top of the World",
  "Toy Test Track",
  "Upper Restrooms",
  "Village Green Breakroom",
  "Zipline",
  "Other",
  "N/A",
] as const;

export type Location = typeof LOCATION_OPTIONS[number];

export function getLocations(): readonly string[] {
  return LOCATION_OPTIONS;
}

// Locations that always sit at the bottom of the dropdown, in this order.
const PINNED_LAST = ["Other", "N/A"];

/** Merge built-in and admin-added locations: A–Z, de-duplicated, "Other"/"N/A" last. */
export function mergeLocations(custom: readonly string[]): string[] {
  const seen = new Set<string>();
  const named: string[] = [];
  for (const name of [...LOCATION_OPTIONS, ...custom]) {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key) || PINNED_LAST.some((p) => p.toLowerCase() === key)) continue;
    seen.add(key);
    named.push(name.trim());
  }
  named.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return [...named, ...PINNED_LAST];
}
