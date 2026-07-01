// Paged list-item fetch shared across form modules.
//
// Graph caps SharePoint list reads at ~200 items per page regardless of $top and
// returns the rest behind @odata.nextLink, so a single GET silently truncates a
// large list. Any read that needs the WHOLE list (queues, idempotency sets,
// module list views) must follow nextLink to the end — this helper is that loop.

import { Client } from "@microsoft/microsoft-graph-client";
import { SharePointListItem, SharePointListResponse } from "./spTypes";

// Fetch every item behind `endpoint`, following @odata.nextLink until exhausted.
export async function fetchAllListItems(client: Client, endpoint: string): Promise<SharePointListItem[]> {
  const items: SharePointListItem[] = [];
  let url = endpoint;
  for (;;) {
    const res: SharePointListResponse = await client.api(url).get();
    items.push(...(res.value || []));
    const next = res["@odata.nextLink"];
    if (!next) break;
    url = next;
  }
  return items;
}
