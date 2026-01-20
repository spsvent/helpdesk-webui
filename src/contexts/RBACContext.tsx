"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from "react";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { getGraphClient } from "@/lib/graphClient";
import {
  getUserPermissions,
  canEditTicket,
  canViewTicket,
  canAddComment,
  canDeleteTicket,
  isOwnTicket,
  getGroupMemberEmails,
} from "@/lib/rbacService";
import { UserPermissions, DEFAULT_PERMISSIONS } from "@/types/rbac";
import { Ticket } from "@/types/ticket";

interface RBACContextValue {
  permissions: UserPermissions;
  loading: boolean;
  error: string | null;
  groupMemberEmails: string[];

  // Helper functions
  canEdit: (ticket: Ticket) => boolean;
  canView: (ticket: Ticket) => boolean;
  canComment: (ticket: Ticket) => boolean;
  canDelete: () => boolean;
  isOwn: (ticket: Ticket) => boolean;
}

const RBACContext = createContext<RBACContextValue>({
  permissions: DEFAULT_PERMISSIONS,
  loading: true,
  error: null,
  groupMemberEmails: [],
  canEdit: () => false,
  canView: () => false,
  canComment: () => false,
  canDelete: () => false,
  isOwn: () => false,
});

export function useRBAC() {
  return useContext(RBACContext);
}

interface RBACProviderProps {
  children: ReactNode;
}

export function RBACProvider({ children }: RBACProviderProps) {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  const [permissions, setPermissions] = useState<UserPermissions>(DEFAULT_PERMISSIONS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupMemberEmails, setGroupMemberEmails] = useState<string[]>([]);

  // Fetch permissions when authenticated
  useEffect(() => {
    async function fetchPermissions() {
      if (!isAuthenticated || !accounts[0] || inProgress !== InteractionStatus.None) {
        setLoading(inProgress !== InteractionStatus.None);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const client = getGraphClient(instance, accounts[0]);
        const email = accounts[0].username;
        const displayName = accounts[0].name || email;

        const userPermissions = await getUserPermissions(client, email, displayName);
        setPermissions(userPermissions);

        // For regular users, also fetch group member emails for ticket visibility
        if (userPermissions.role === "user" && userPermissions.groupMemberships.length > 0) {
          try {
            const memberEmails = await getGroupMemberEmails(client, userPermissions.groupMemberships);
            setGroupMemberEmails(memberEmails);
          } catch (groupErr) {
            console.warn("Failed to fetch group members (RBAC will use own-tickets-only mode):", groupErr);
            // Continue without group member emails - user will only see own tickets
          }
        }
      } catch (err) {
        console.error("Failed to fetch permissions:", err);
        // Fallback: create basic user permissions with the user's email
        // This ensures they can at least see their own tickets
        const email = accounts[0].username;
        const displayName = accounts[0].name || email;
        setPermissions({
          ...DEFAULT_PERMISSIONS,
          email,
          displayName,
          role: "user",
        });
        setError("Limited permissions mode - some features may be unavailable");
      } finally {
        setLoading(false);
      }
    }

    fetchPermissions();
  }, [isAuthenticated, accounts, instance, inProgress]);

  // Helper functions wrapped with useCallback
  const canEdit = useCallback(
    (ticket: Ticket) => canEditTicket(permissions, ticket),
    [permissions]
  );

  const canView = useCallback(
    (ticket: Ticket) => canViewTicket(permissions, ticket, groupMemberEmails),
    [permissions, groupMemberEmails]
  );

  const canComment = useCallback(
    (ticket: Ticket) => canAddComment(permissions, ticket),
    [permissions]
  );

  const canDelete = useCallback(
    () => canDeleteTicket(permissions),
    [permissions]
  );

  const isOwn = useCallback(
    (ticket: Ticket) => isOwnTicket(permissions, ticket),
    [permissions]
  );

  const value: RBACContextValue = {
    permissions,
    loading,
    error,
    groupMemberEmails,
    canEdit,
    canView,
    canComment,
    canDelete,
    isOwn,
  };

  return <RBACContext.Provider value={value}>{children}</RBACContext.Provider>;
}
