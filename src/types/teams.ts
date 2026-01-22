// Teams channel configuration from SharePoint list
export interface TeamsChannelConfig {
  id: string;
  title: string;              // Friendly name (e.g., "Tech Support Channel")
  department: string;         // Matches ticket.problemType (Tech, Operations, HR, etc.)
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
  | AdaptiveCardFactSet;

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
}

export interface AdaptiveCardContainer {
  type: "Container";
  items: AdaptiveCardElement[];
  style?: "default" | "emphasis" | "good" | "attention" | "warning" | "accent";
  bleed?: boolean;
  padding?: "none" | "small" | "default" | "medium" | "large" | "extraLarge";
}

export interface AdaptiveCardColumnSet {
  type: "ColumnSet";
  columns: AdaptiveCardColumn[];
}

export interface AdaptiveCardColumn {
  type: "Column";
  width: string | number;
  items: AdaptiveCardElement[];
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
  type: "Action.OpenUrl";
  title: string;
  url: string;
}

// SharePoint list item for Teams channel config
export interface TeamsChannelSharePointItem {
  id: string;
  fields: {
    Title: string;
    Department: string;
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
    teamId: item.fields.TeamId || "",
    channelId: item.fields.ChannelId || "",
    isActive: item.fields.IsActive ?? false,
    minPriority: (item.fields.MinPriority as TeamsMinPriority) || "Normal",
  };
}
