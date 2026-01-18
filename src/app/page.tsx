"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMsal, useIsAuthenticated } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { loginRequest } from "@/lib/msalConfig";
import { getGraphClient, getTickets } from "@/lib/graphClient";
import { Ticket } from "@/types/ticket";
import TicketList from "@/components/TicketList";
import TicketDetail from "@/components/TicketDetail";

export default function Home() {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle login
  const handleLogin = async () => {
    try {
      await instance.loginRedirect(loginRequest);
    } catch (e) {
      console.error("Login failed:", e);
    }
  };

  // Handle logout
  const handleLogout = () => {
    instance.logoutRedirect();
  };

  // Fetch tickets when authenticated
  useEffect(() => {
    const fetchTickets = async () => {
      if (!isAuthenticated || !accounts[0]) return;

      setLoading(true);
      setError(null);

      try {
        const client = getGraphClient(instance, accounts[0]);
        const ticketList = await getTickets(client);
        setTickets(ticketList);
      } catch (e) {
        console.error("Failed to fetch tickets:", e);
        setError("Failed to load tickets. Please check your permissions.");
      } finally {
        setLoading(false);
      }
    };

    fetchTickets();
  }, [isAuthenticated, accounts, instance]);

  // Show loading while MSAL initializes
  if (inProgress !== InteractionStatus.None) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-blue mx-auto"></div>
          <p className="mt-4 text-text-secondary">Authenticating...</p>
        </div>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-subtle">
        <div className="bg-white p-8 rounded-lg shadow-lg text-center max-w-md">
          <h1 className="text-2xl font-bold text-text-primary mb-2">
            SkyPark Help Desk
          </h1>
          <p className="text-text-secondary mb-6">
            Sign in with your Microsoft account to view and manage support tickets.
          </p>
          <button
            onClick={handleLogin}
            className="bg-brand-blue hover:bg-brand-blue-light text-white px-6 py-3 rounded-lg font-medium transition-colors"
          >
            Sign in with Microsoft
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-border px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-text-primary">
            SkyPark Help Desk
          </h1>
          <Link
            href="/new"
            className="px-4 py-1.5 bg-brand-blue text-white text-sm rounded-lg font-medium hover:bg-brand-blue-light transition-colors"
          >
            + New Ticket
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/help"
            className="text-sm text-text-secondary hover:text-text-primary"
          >
            Help
          </Link>
          <span className="text-sm text-text-secondary">
            {accounts[0]?.name || accounts[0]?.username}
          </span>
          <button
            onClick={handleLogout}
            className="text-sm text-text-secondary hover:text-text-primary"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex min-h-0">
        {/* Ticket list sidebar */}
        <aside className="w-80 border-r border-border bg-white overflow-hidden flex flex-col">
          <div className="p-4 border-b border-border">
            <h2 className="font-semibold text-text-primary">Tickets</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-text-secondary">
                Loading tickets...
              </div>
            ) : error ? (
              <div className="p-4 text-center text-red-600">{error}</div>
            ) : (
              <TicketList
                tickets={tickets}
                selectedId={selectedTicket?.id}
                onSelect={setSelectedTicket}
              />
            )}
          </div>
        </aside>

        {/* Ticket detail */}
        <main className="flex-1 bg-bg-subtle overflow-y-auto">
          {selectedTicket ? (
            <TicketDetail
              ticket={selectedTicket}
              onUpdate={(updated) => {
                setSelectedTicket(updated);
                setTickets((prev) =>
                  prev.map((t) => (t.id === updated.id ? updated : t))
                );
              }}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-text-secondary">
              Select a ticket to view details
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
