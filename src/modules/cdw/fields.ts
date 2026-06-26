// The CDW worksheet, expressed as data so the form renders and validates from one
// place. Mirrors the paper "Campaign & Creative Development Worksheet".

export type CdwFieldType = "text" | "textarea" | "date" | "person";

export interface CdwFieldDef {
  // Key into the form values bag. For "person" fields this is the base key; the
  // form stores a { displayName, email } object and writes <key>Name/<key>Email.
  key: string;
  label: string;
  type: CdwFieldType;
  required?: boolean;
  help?: string;
  placeholder?: string;
}

// Ordered to match the worksheet. Optional sections (Secondary Info, Additional
// Details) say so in their help text, mirroring the paper form.
export const CDW_FIELDS: CdwFieldDef[] = [
  { key: "title", label: "Project Name", type: "text", required: true, placeholder: "Name of this creative project" },
  { key: "deadline", label: "Deadline", type: "date", required: true },
  { key: "projectManager", label: "Project Manager", type: "person", required: true, help: "Who owns this project?" },
  { key: "pmContact", label: "PM Contact Info", type: "text", help: "Best way to reach the PM (phone / email)" },
  { key: "campaign", label: "Campaign", type: "textarea", help: "Is this creative project connected to a bigger campaign, event or strategy?" },
  { key: "quickTake", label: "Quick Take", type: "textarea", required: true, help: "Quick description of the project or creative need." },
  { key: "communicationPriorities", label: "Communication Priorities", type: "textarea", help: "List the three main communication priorities in order of importance — 1, 2, 3." },
  { key: "callToAction", label: "Call to Action", type: "textarea", help: "What action do we want the audience to take?" },
  { key: "secondaryInfo", label: "Secondary Info Needed", type: "textarea", help: "Any additional legal or informational details? Leave blank if none." },
  { key: "audience", label: "Audience", type: "textarea", help: "Who is the audience? What relevant information should the designer know?" },
  { key: "specifications", label: "Specifications", type: "textarea", help: "Size? Final file format?" },
  { key: "additionalDetails", label: "Additional Details", type: "textarea", help: "Anything else the designer should know about this project or event. Leave blank if none." },
  { key: "projectTimeline", label: "Project Timeline", type: "textarea", help: "Include all due dates (if multiple), time for revisions, and when it needs to be live." },
  { key: "approvalsNote", label: "Approvals", type: "textarea", help: "Who else needs to see this project besides the PM? Will the designer handle approvals or the PM?" },
  { key: "finalRecipient", label: "Send the approved final to", type: "person", required: true, help: "Who should be given the final deliverable once this brief is approved?" },
];

// Keys that are "person" pickers — the form holds a {displayName,email} object.
export const CDW_PERSON_KEYS = CDW_FIELDS.filter((f) => f.type === "person").map((f) => f.key);
