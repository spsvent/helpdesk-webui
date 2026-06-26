// Generic, idempotent SharePoint list bootstrap shared across form modules.
//
// Generalized from createAutoAssignList() in graphClient.ts so a module can stand
// up its own list+columns without hand-rolling the create/409-lookup/add-column
// dance. Used by the CDW module's ensureCdwList(). Lives in the shared layer so it
// outlives any single module and never couples to the Tickets list.

import { Client } from "@microsoft/microsoft-graph-client";

const SITE_ID = process.env.NEXT_PUBLIC_SHAREPOINT_SITE_ID || "";

// A SharePoint column-creation body, as accepted by the Graph
// POST /sites/{site}/lists/{list}/columns endpoint. Permissive on purpose — the
// caller passes the exact { name, text|choice|number|boolean|dateTime, ... } shape.
export type SharePointColumnDef = Record<string, unknown> & { name: string };

/**
 * Ensure a SharePoint list exists with the given columns, returning its id.
 *
 * Idempotent: if the list already exists it is found by displayName and reused;
 * columns that already exist are skipped. Safe to call on every "set up" action.
 */
export async function ensureList(
  client: Client,
  displayName: string,
  description: string,
  columns: SharePointColumnDef[]
): Promise<string> {
  if (!SITE_ID) throw new Error("NEXT_PUBLIC_SHAREPOINT_SITE_ID is not configured");

  let listId: string;
  try {
    const list = await client.api(`/sites/${SITE_ID}/lists`).post({
      displayName,
      description,
      list: { template: "genericList" },
    });
    listId = list.id;
    console.log(`[ensureList] Created list "${displayName}" with ID: ${listId}`);
  } catch (error: unknown) {
    const err = error as { statusCode?: number; message?: string };
    if (err.statusCode === 409 || err.message?.includes("already exists")) {
      const lists = await client
        .api(`/sites/${SITE_ID}/lists`)
        .filter(`displayName eq '${displayName.replace(/'/g, "''")}'`)
        .get();
      if (lists.value && lists.value.length > 0) {
        listId = lists.value[0].id;
        console.log(`[ensureList] Found existing list "${displayName}" with ID: ${listId}`);
      } else {
        throw new Error(`List creation conflict but "${displayName}" not found`);
      }
    } else {
      throw error;
    }
  }

  for (const column of columns) {
    try {
      await client.api(`/sites/${SITE_ID}/lists/${listId}/columns`).post(column);
      console.log(`[ensureList] Added column: ${column.name}`);
    } catch (error: unknown) {
      const err = error as { statusCode?: number; message?: string };
      if (err.statusCode === 409 || err.message?.includes("already exists")) {
        // Column already present — fine for an idempotent bootstrap.
      } else {
        throw error;
      }
    }
  }

  return listId;
}
