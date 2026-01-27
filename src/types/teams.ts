// Teams channel configuration from SharePoint list
export interface TeamsChannelConfig {
  id: string;
  title: string;              // Friendly name (e.g., "Tech Support Channel")
  department: string;         // Matches ticket.problemType (Tech, Operations, HR, etc.)
  subDepartment?: string;     // Optional: Matches ticket.problemTypeSub (e.g., "POS Software")
  teamId: string;             // Microsoft Teams Team ID (GUID)
  channelId: string;          // Channel ID (format: 19:xxx@thread.tacv2)
  isActive: boolean;          // Enable/disable notifications
  minPriority: TeamsMinPriority; // Minimum priority to notify
}

// Minimum priority levels for Teams notifications
export type TeamsMinPriority = "Low" | "Normal" | "High" | "Urgent";

// Priority order for comparison
export const PRIORITY_ORDER: Record<TeamsMinPriority, number> = {
  Low: 0,
  Normal: 1,
  High: 2,
  Urgent: 3,
};

// Adaptive Card structure for Teams messages
export interface AdaptiveCardBody {
  type: "AdaptiveCard";
  $schema: string;
  version: string;
  body: AdaptiveCardElement[];
  actions?: AdaptiveCardAction[];
}

// Adaptive Card element types
export type AdaptiveCardElement =
  | AdaptiveCardTextBlock
  | AdaptiveCardContainer
  | AdaptiveCardColumnSet
  | AdaptiveCardFactSet
  | AdaptiveCardImage
  | AdaptiveCardActionSet;

export interface AdaptiveCardTextBlock {
  type: "TextBlock";
  text: string;
  size?: "small" | "default" | "medium" | "large" | "extraLarge";
  weight?: "lighter" | "default" | "bolder";
  color?: "default" | "dark" | "light" | "accent" | "good" | "warning" | "attention";
  wrap?: boolean;
  spacing?: "none" | "small" | "default" | "medium" | "large" | "extraLarge";
  isSubtle?: boolean;
  maxLines?: number;
  horizontalAlignment?: "left" | "center" | "right";
  separator?: boolean;
}

export interface AdaptiveCardContainer {
  type: "Container";
  items: AdaptiveCardElement[];
  style?: "default" | "emphasis" | "good" | "attention" | "warning" | "accent";
  bleed?: boolean;
  padding?: "none" | "small" | "default" | "medium" | "large" | "extraLarge";
  spacing?: "none" | "small" | "default" | "medium" | "large" | "extraLarge";
  separator?: boolean;
}

export interface AdaptiveCardColumnSet {
  type: "ColumnSet";
  columns: AdaptiveCardColumn[];
}

export interface AdaptiveCardColumn {
  type: "Column";
  width: string | number;
  items: AdaptiveCardElement[];
  verticalContentAlignment?: "top" | "center" | "bottom";
  spacing?: "none" | "small" | "default" | "medium" | "large" | "extraLarge";
}

export interface AdaptiveCardFactSet {
  type: "FactSet";
  facts: AdaptiveCardFact[];
}

export interface AdaptiveCardFact {
  title: string;
  value: string;
}

export interface AdaptiveCardAction {
  type: "Action.OpenUrl" | "Action.Submit";
  title: string;
  url?: string;
  style?: "default" | "positive" | "destructive";
}

export interface AdaptiveCardImage {
  type: "Image";
  url: string;
  size?: "auto" | "stretch" | "small" | "medium" | "large";
  style?: "default" | "person";
  altText?: string;
  width?: string;
  height?: string;
}

export interface AdaptiveCardActionSet {
  type: "ActionSet";
  actions: AdaptiveCardAction[];
}

// SharePoint list item for Teams channel config
export interface TeamsChannelSharePointItem {
  id: string;
  fields: {
    Title: string;
    Department: string;
    SubDepartment?: string;
    TeamId: string;
    ChannelId: string;
    IsActive: boolean;
    MinPriority?: string;
  };
}

// Map SharePoint list item to TeamsChannelConfig
export function mapToTeamsChannelConfig(item: TeamsChannelSharePointItem): TeamsChannelConfig {
  return {
    id: item.id,
    title: item.fields.Title || "",
    department: item.fields.Department || "",
    subDepartment: item.fields.SubDepartment || undefined,
    teamId: item.fields.TeamId || "",
    channelId: item.fields.ChannelId || "",
    isActive: item.fields.IsActive ?? false,
    minPriority: (item.fields.MinPriority as TeamsMinPriority) || "Normal",
  };
}
