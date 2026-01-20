"use client";

import Link from "next/link";
import { useState } from "react";

interface HelpSection {
  id: string;
  title: string;
  content: React.ReactNode;
}

const helpSections: HelpSection[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    content: (
      <div className="space-y-4">
        <p>
          Welcome to the SkyPark Help Desk! This application allows you to submit,
          view, and manage support tickets for the organization.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">Signing In</h4>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>
            Click the <strong>&quot;Sign in with Microsoft&quot;</strong> button on the
            login page
          </li>
          <li>Enter your SkyPark organizational credentials</li>
          <li>
            After successful authentication, you&apos;ll be redirected to the main
            dashboard
          </li>
        </ol>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> You must have a valid SkyPark Microsoft
            account with appropriate permissions to access the help desk.
          </p>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">
          Interface Overview
        </h4>
        <p>The main interface is divided into key areas:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>
            <strong>Header:</strong> Contains the &quot;+ New Ticket&quot; button, Help link,
            your name, and sign-out
          </li>
          <li>
            <strong>Ticket List (Left Sidebar):</strong> Displays all tickets in
            a scrollable list
          </li>
          <li>
            <strong>Ticket Detail (Main Area):</strong> Shows the selected
            ticket&apos;s conversation and details
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: "submitting-tickets",
    title: "Submitting a New Ticket",
    content: (
      <div className="space-y-4">
        <p>
          You can submit a new support ticket directly from the Help Desk application.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">
          How to Submit a Ticket
        </h4>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>
            Click the <strong>&quot;+ New Ticket&quot;</strong> button in the header
          </li>
          <li>Fill out the ticket form with the following information:</li>
        </ol>

        <div className="ml-8 mt-3 space-y-3">
          <p><strong>Title</strong> (required): A brief summary of your issue</p>
          <p><strong>Description</strong> (required): Detailed explanation of the problem or request</p>
          <p><strong>Category</strong>: Select &quot;Request&quot; for new features/access, or &quot;Problem&quot; for something broken</p>
          <p><strong>Department</strong>: Which team should handle this (Tech, Operations, HR, etc.)</p>
          <p><strong>Priority</strong>: How urgent is this issue (see Priority Levels below)</p>
          <p><strong>Location</strong> (optional): Where the issue is occurring</p>
        </div>

        <ol className="list-decimal list-inside space-y-2 ml-4" start={3}>
          <li>
            Click <strong>&quot;Submit Ticket&quot;</strong> to create your ticket
          </li>
          <li>You&apos;ll be redirected to the main page where you can view your new ticket</li>
        </ol>

        <h4 className="font-semibold text-text-primary mt-6">
          Priority Levels
        </h4>
        <div className="space-y-3 mt-3">
          <div className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg">
            <span className="text-gray-500 font-medium shrink-0">Low</span>
            <span className="text-sm">Nice to have, no rush. Will be addressed as time permits.</span>
          </div>
          <div className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg">
            <span className="text-blue-600 font-medium shrink-0">Normal</span>
            <span className="text-sm">Standard priority. Addressed within normal workflow.</span>
          </div>
          <div className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg">
            <span className="text-orange-600 font-semibold shrink-0">High</span>
            <span className="text-sm">Important issue requiring prompt attention.</span>
          </div>
          <div className="flex items-start gap-3 p-3 border border-red-200 bg-red-50 rounded-lg">
            <span className="text-red-600 font-bold shrink-0">Urgent</span>
            <div className="text-sm">
              <p className="font-medium text-red-800">Drop everything - full company resources.</p>
              <p className="mt-1 text-red-700">Only use for critical business impact:</p>
              <ul className="list-disc list-inside ml-2 mt-1">
                <li>Complete system outages</li>
                <li>Safety concerns</li>
                <li>Revenue-impacting issues</li>
                <li>Time-sensitive events</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-yellow-800">
            <strong>Important:</strong> Please use Urgent priority sparingly.
            Overuse of Urgent priority reduces its effectiveness and can delay
            truly critical issues.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "viewing-tickets",
    title: "Viewing Tickets",
    content: (
      <div className="space-y-4">
        <p>
          The ticket list on the left sidebar shows all support tickets. Each
          ticket card displays key information at a glance.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">
          Ticket List Information
        </h4>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>
            <strong>Title:</strong> The ticket subject/title
          </li>
          <li>
            <strong>Status Badge:</strong> Current status (New, In Progress,
            On Hold, Resolved, Closed)
          </li>
          <li>
            <strong>Problem Type:</strong> Category of the issue
          </li>
          <li>
            <strong>Requester:</strong> Who submitted the ticket
          </li>
          <li>
            <strong>Time:</strong> When the ticket was created
          </li>
          <li>
            <strong>Priority Flag:</strong> Red &quot;URGENT&quot; or orange &quot;HIGH&quot; label
            for elevated priority tickets
          </li>
        </ul>

        <h4 className="font-semibold text-text-primary mt-6">
          Selecting a Ticket
        </h4>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Scroll through the ticket list to find the ticket you need</li>
          <li>Click on any ticket to view its full details</li>
          <li>
            The selected ticket will be highlighted with a blue left border
          </li>
          <li>The main area will update to show the ticket&apos;s conversation</li>
        </ol>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-yellow-800">
            <strong>Tip:</strong> Look for the red &quot;URGENT&quot; or orange &quot;HIGH&quot;
            labels to quickly identify elevated priority tickets.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "filtering-searching",
    title: "Filtering & Searching Tickets",
    content: (
      <div className="space-y-4">
        <p>
          The ticket list includes powerful filtering and search capabilities to help
          you quickly find the tickets you need.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">Search Bar</h4>
        <p>
          Type in the search bar to instantly filter tickets. Search matches against:
        </p>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li>Ticket title</li>
          <li>Ticket description</li>
          <li>Requester name</li>
        </ul>
        <p className="mt-2 text-sm text-text-secondary">
          Search results update as you type (with a small delay to avoid flickering).
        </p>

        <h4 className="font-semibold text-text-primary mt-6">Quick View Buttons</h4>
        <p>
          Use the preset view buttons for common filtering needs:
        </p>
        <div className="space-y-2 mt-3">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 text-xs rounded-full bg-brand-blue text-white">Active Tickets</span>
            <span className="text-sm">Default view - hides resolved/closed, urgent on top</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 text-xs rounded-full bg-gray-100 text-gray-600">By Priority</span>
            <span className="text-sm">Sorted by urgency level, then by date</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 text-xs rounded-full bg-gray-100 text-gray-600">All Tickets</span>
            <span className="text-sm">Shows everything including resolved/closed</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 text-xs rounded-full bg-gray-100 text-gray-600">Open Only</span>
            <span className="text-sm">New and In Progress tickets only</span>
          </div>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">Advanced Filters</h4>
        <p>
          Click the <strong>Filters</strong> button to expand the filter panel with more options:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4 mt-3">
          <li>
            <strong>Status:</strong> Select one or more status types (New, In Progress, On Hold, Resolved, Closed)
          </li>
          <li>
            <strong>Priority:</strong> Filter by priority level (Urgent, High, Normal, Low)
          </li>
          <li>
            <strong>Department:</strong> Cascading dropdowns for ProblemType → Sub-category → Specific type
          </li>
          <li>
            <strong>Category:</strong> Filter by Request or Problem
          </li>
          <li>
            <strong>Date Range:</strong> Today, Last 7 days, Last 30 days, or All time
          </li>
        </ul>

        <h4 className="font-semibold text-text-primary mt-6">Sort Options</h4>
        <p>Use the sort dropdown to change how tickets are ordered:</p>
        <div className="space-y-2 mt-3 ml-4">
          <p><strong>Smart (urgent on top):</strong> Urgent tickets first, then by date, with higher priority shown first for same-day tickets</p>
          <p><strong>By priority:</strong> All urgent first, then high, normal, low</p>
          <p><strong>Newest first:</strong> Most recently created tickets first</p>
          <p><strong>Oldest first:</strong> Oldest tickets first</p>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">Clearing Filters</h4>
        <p>
          When you have active filters, two buttons appear at the bottom of the filter panel:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4 mt-3">
          <li>
            <strong>Reset to default:</strong> Returns to the &quot;Active Tickets&quot; view (hides resolved/closed)
          </li>
          <li>
            <strong>Show all tickets:</strong> Clears ALL filters to show every ticket
          </li>
        </ul>

        <h4 className="font-semibold text-text-primary mt-6">Archived Tickets</h4>
        <p>
          To improve performance, resolved and closed tickets older than 90 days are not loaded
          by default. To view these older tickets:
        </p>
        <ol className="list-decimal list-inside space-y-2 ml-4 mt-3">
          <li>Click the <strong>&quot;Load archived tickets (90+ days old)&quot;</strong> button at the bottom of the filter area</li>
          <li>Wait for the archived tickets to load</li>
          <li>Switch to &quot;All Tickets&quot; view to see them</li>
        </ol>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-blue-800">
            <strong>Tip:</strong> The filter badge on the Filters button shows how many
            filters are currently active. This helps you know when filtered results
            might be hiding tickets.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "ticket-details",
    title: "Ticket Details View",
    content: (
      <div className="space-y-4">
        <p>
          When you select a ticket, the main area displays a Jira-style
          conversation view with all the ticket information.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">Header Section</h4>
        <p>At the top of the ticket view you&apos;ll see:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>
            <strong>Ticket Title:</strong> The full title of the ticket
          </li>
          <li>
            <strong>Status Badge:</strong> Color-coded status indicator
          </li>
          <li>
            <strong>Ticket ID:</strong> Unique identifier (e.g., #123)
          </li>
          <li>
            <strong>Problem Type:</strong> Category of the issue
          </li>
          <li>
            <strong>Priority:</strong> Color-coded priority level (LOW, NORMAL, HIGH, URGENT)
          </li>
        </ul>

        <h4 className="font-semibold text-text-primary mt-6">
          Conversation Thread
        </h4>
        <p>
          The conversation thread shows the ticket history in chronological
          order:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>
            <strong>Description (Blue Border):</strong> The original ticket
            description from the requester
          </li>
          <li>
            <strong>Comments:</strong> All responses and updates
          </li>
          <li>
            <strong>Internal Notes (Yellow Background):</strong> Staff-only
            comments not visible to requesters
          </li>
        </ul>

        <p className="mt-4">Each conversation entry shows:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>User avatar and name</li>
          <li>Timestamp (relative time like &quot;2 hours ago&quot;)</li>
          <li>Any applicable badges (Description, Internal, Status Change)</li>
          <li>The full message content</li>
        </ul>

        <h4 className="font-semibold text-text-primary mt-6">
          Details Panel (Right Sidebar)
        </h4>
        <p>The right sidebar shows ticket metadata:</p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>
            <strong>Status:</strong> Dropdown to change ticket status
          </li>
          <li>
            <strong>Priority:</strong> Dropdown to change priority (Low, Normal, High, Urgent)
          </li>
          <li>
            <strong>Assignee:</strong> Who is working on the ticket
          </li>
          <li>
            <strong>Requester:</strong> Who submitted the ticket
          </li>
          <li>
            <strong>Category &amp; Problem Type:</strong> Issue classification
          </li>
          <li>
            <strong>Location:</strong> Where the issue occurred (if applicable)
          </li>
          <li>
            <strong>Dates:</strong> Created, Last Updated, and Due Date
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: "adding-comments",
    title: "Adding Comments",
    content: (
      <div className="space-y-4">
        <p>
          You can add comments to any ticket to provide updates, ask questions,
          or document progress.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">
          To Add a Comment
        </h4>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Select the ticket you want to comment on</li>
          <li>
            Scroll to the bottom of the conversation thread to find the comment
            input box
          </li>
          <li>Type your message in the text area</li>
          <li>
            Click <strong>&quot;Post Comment&quot;</strong> to submit
          </li>
        </ol>

        <h4 className="font-semibold text-text-primary mt-6">
          Internal Notes vs. Public Comments
        </h4>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="mb-3">
            <strong>Internal Notes</strong> are only visible to staff members
            and are not shown to the person who submitted the ticket. Use these
            for:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>Private discussions between team members</li>
            <li>Technical troubleshooting notes</li>
            <li>Sensitive information that shouldn&apos;t be shared externally</li>
          </ul>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">
          To Create an Internal Note
        </h4>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Type your message in the comment box</li>
          <li>
            Check the <strong>&quot;Internal note (hidden from requester)&quot;</strong>{" "}
            checkbox
          </li>
          <li>
            Click <strong>&quot;Post Comment&quot;</strong>
          </li>
        </ol>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-yellow-800">
            <strong>Important:</strong> Internal notes are displayed with a
            yellow background and &quot;Internal&quot; badge to clearly distinguish them
            from public comments.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "updating-tickets",
    title: "Updating Ticket Status & Priority",
    content: (
      <div className="space-y-4">
        <p>
          You can update a ticket&apos;s status and priority from the Details panel
          on the right side of the ticket view.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">
          Changing Ticket Status
        </h4>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Select the ticket you want to update</li>
          <li>
            In the Details panel on the right, find the <strong>Status</strong>{" "}
            dropdown
          </li>
          <li>Click the dropdown and select the new status</li>
          <li>
            Click the <strong>&quot;Save Changes&quot;</strong> button that appears
          </li>
        </ol>

        <h4 className="font-semibold text-text-primary mt-6">
          Available Status Options
        </h4>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-500"></span>
            <span>
              <strong>New:</strong> Just submitted
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-green-500"></span>
            <span>
              <strong>In Progress:</strong> Being worked on
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
            <span>
              <strong>On Hold:</strong> Paused/waiting
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
            <span>
              <strong>Resolved:</strong> Issue fixed
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-slate-500"></span>
            <span>
              <strong>Closed:</strong> Ticket complete
            </span>
          </div>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">
          Changing Priority
        </h4>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>
            In the Details panel, find the <strong>Priority</strong> dropdown
          </li>
          <li>
            Select from <strong>Low</strong>, <strong>Normal</strong>, <strong>High</strong>, or <strong>Urgent</strong>
          </li>
          <li>
            Click <strong>&quot;Save Changes&quot;</strong> to apply
          </li>
        </ol>

        <h4 className="font-semibold text-text-primary mt-6">
          Priority Levels
        </h4>
        <div className="space-y-2 mt-3">
          <div className="flex items-center gap-2">
            <span className="text-gray-500 font-medium">Low:</span>
            <span>Nice to have, no rush</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-blue-600 font-medium">Normal:</span>
            <span>Standard priority</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-orange-600 font-semibold">High:</span>
            <span>Needs prompt attention</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-red-600 font-bold">Urgent:</span>
            <span>Critical - drop everything</span>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> The Save Changes button only appears when you
            have unsaved changes. Your changes are not saved until you click
            this button.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "understanding-badges",
    title: "Understanding Status Badges",
    content: (
      <div className="space-y-4">
        <p>
          Throughout the application, colored badges indicate ticket status and
          comment types. Here&apos;s what each color means:
        </p>

        <h4 className="font-semibold text-text-primary mt-6">Status Badges</h4>
        <div className="space-y-3 mt-3">
          <div className="flex items-center gap-3">
            <span className="px-2 py-1 rounded text-xs font-medium bg-blue-500 text-white">
              New
            </span>
            <span>Newly submitted ticket, not yet addressed</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-2 py-1 rounded text-xs font-medium bg-green-500 text-white">
              In Progress
            </span>
            <span>Someone is actively working on this ticket</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-500 text-white">
              On Hold
            </span>
            <span>Work paused - waiting for info, resources, or external factors</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-2 py-1 rounded text-xs font-medium bg-emerald-500 text-white">
              Resolved
            </span>
            <span>Issue has been fixed, awaiting confirmation</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-2 py-1 rounded text-xs font-medium bg-slate-500 text-white">
              Closed
            </span>
            <span>Ticket is complete and archived</span>
          </div>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">Priority Indicators</h4>
        <div className="space-y-3 mt-3">
          <div className="flex items-center gap-3">
            <span className="text-gray-500 text-xs font-medium">LOW</span>
            <span>Lowest priority - no rush</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-blue-600 text-xs font-medium">NORMAL</span>
            <span>Standard priority</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-orange-600 text-xs font-semibold">HIGH</span>
            <span>Elevated priority - needs prompt attention</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-red-600 text-xs font-bold">URGENT</span>
            <span>Critical priority - immediate action required</span>
          </div>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">
          Comment Type Badges
        </h4>
        <div className="space-y-3 mt-3">
          <div className="flex items-center gap-3">
            <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">
              Description
            </span>
            <span>The original ticket description</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
              Internal
            </span>
            <span>Staff-only note (not visible to requester)</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">
              Status Change
            </span>
            <span>Automatic entry when status was changed</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-800">
              Assignment
            </span>
            <span>Automatic entry when ticket was assigned</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "permissions",
    title: "Permissions & Visibility",
    content: (
      <div className="space-y-4">
        <p>
          The Help Desk uses role-based access control (RBAC) to determine what
          tickets you can see and edit based on your role and group memberships.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">User Roles</h4>
        <div className="space-y-3 mt-3">
          <div className="flex items-start gap-3 p-3 border border-purple-200 bg-purple-50 rounded-lg">
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 shrink-0">
              Admin
            </span>
            <div className="text-sm">
              <p className="font-medium">Full access to all tickets</p>
              <p className="text-gray-600 mt-1">Can view, edit, and delete any ticket. See all details.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 border border-blue-200 bg-blue-50 rounded-lg">
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 shrink-0">
              Support
            </span>
            <div className="text-sm">
              <p className="font-medium">Department-based access</p>
              <p className="text-gray-600 mt-1">Can view all tickets. Can edit tickets assigned to their department.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg">
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 shrink-0">
              User
            </span>
            <div className="text-sm">
              <p className="font-medium">Limited access</p>
              <p className="text-gray-600 mt-1">Can view own tickets and tickets from team members. Can add comments to own tickets.</p>
            </div>
          </div>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">Team-Based Visibility</h4>
        <p>
          Regular users can see tickets created by other members of their Entra ID groups.
          This allows team members to view and collaborate on each other&apos;s requests.
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-3">
          <p className="text-sm text-blue-800">
            <strong>Example:</strong> If you and a coworker are both in the &quot;Marketing Team&quot;
            group, you&apos;ll be able to see each other&apos;s tickets even though you&apos;re both regular users.
          </p>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">Read-Only Mode</h4>
        <p>
          If you see a <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">Read only</span> badge
          on a ticket, it means you can view the ticket but don&apos;t have permission to edit its status or priority.
          You may still be able to add comments depending on your role.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">Your Ticket Badge</h4>
        <p>
          Tickets you created will show a <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">Your ticket</span> badge.
          You always have the ability to add comments to your own tickets.
        </p>
      </div>
    ),
  },
  {
    id: "admin-rbac",
    title: "Admin: Managing Visibility Groups",
    content: (
      <div className="space-y-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            <strong>Admin Only:</strong> This section is for administrators who manage
            which groups can share ticket visibility.
          </p>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">How Visibility Groups Work</h4>
        <p>
          The Help Desk uses a SharePoint list called <strong>RBACGroups</strong> to control
          which Entra ID groups are considered for ticket visibility sharing. Only groups
          in this list will allow members to see each other&apos;s tickets.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">Adding a New Visibility Group</h4>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>
            Open the{" "}
            <a
              href="https://skyparksv.sharepoint.com/sites/helpdesk/Lists/RBACGroups"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-blue hover:underline"
            >
              RBACGroups SharePoint List
            </a>
          </li>
          <li>Click <strong>+ New</strong> to add a new item</li>
          <li>Fill in the following fields:</li>
        </ol>

        <div className="ml-8 mt-3 space-y-3 bg-gray-50 p-4 rounded-lg">
          <p><strong>Title:</strong> A friendly name for the group (e.g., &quot;Marketing Team&quot;)</p>
          <p><strong>Group ID:</strong> The Entra ID group GUID (find this in Azure Portal → Groups)</p>
          <p><strong>Group Type:</strong> Select <strong>&quot;visibility&quot;</strong> for team ticket sharing</p>
          <p><strong>Is Active:</strong> Set to <strong>Yes</strong> to enable</p>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">Group Types</h4>
        <div className="space-y-3 mt-3">
          <div className="flex items-start gap-3">
            <span className="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded shrink-0">visibility</span>
            <span className="text-sm">Members can see each other&apos;s tickets (for regular users/teams)</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded shrink-0">department</span>
            <span className="text-sm">Support staff group - can edit tickets in their department</span>
          </div>
          <div className="flex items-start gap-3">
            <span className="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded shrink-0">admin</span>
            <span className="text-sm">Full admin access to all tickets</span>
          </div>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">Finding a Group ID</h4>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Go to <a href="https://portal.azure.com" target="_blank" rel="noopener noreferrer" className="text-brand-blue hover:underline">Azure Portal</a></li>
          <li>Navigate to <strong>Groups</strong></li>
          <li>Search for and select the group</li>
          <li>Copy the <strong>Object ID</strong> (a GUID like &quot;146e05ff-0c79-4bf3-b22f-1777838cf9c1&quot;)</li>
        </ol>

        <h4 className="font-semibold text-text-primary mt-6">When Changes Take Effect</h4>
        <p>
          Changes to the RBACGroups list take effect within <strong>5 minutes</strong> due to caching.
          Users may need to sign out and back in, or wait for the cache to refresh.
        </p>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-blue-800">
            <strong>Important:</strong> Admin and support staff tickets are excluded from
            group-based visibility. If an admin creates a ticket, regular team members
            won&apos;t see it through group sharing (only the admin themselves or other admins/support can see it).
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "tips",
    title: "Tips & Best Practices",
    content: (
      <div className="space-y-4">
        <h4 className="font-semibold text-text-primary">
          Efficient Ticket Management
        </h4>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>
            <strong>Check priority labels:</strong> Look for red URGENT or orange HIGH
            labels in the ticket list to identify elevated priority tickets
          </li>
          <li>
            <strong>Update status promptly:</strong> Change status to &quot;In
            Progress&quot; when you start working on a ticket
          </li>
          <li>
            <strong>Use internal notes:</strong> Document troubleshooting steps
            that shouldn&apos;t be visible to the requester
          </li>
          <li>
            <strong>Check dates:</strong> Pay attention to due dates in the
            Details panel
          </li>
        </ul>

        <h4 className="font-semibold text-text-primary mt-6">
          Submitting Good Tickets
        </h4>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Write a clear, descriptive title</li>
          <li>Include all relevant details in the description</li>
          <li>Select the correct department so it gets routed properly</li>
          <li>Use the appropriate priority level - reserve Urgent for true emergencies</li>
          <li>Include the location if it&apos;s relevant to the issue</li>
        </ul>

        <h4 className="font-semibold text-text-primary mt-6">
          Communication Best Practices
        </h4>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Be clear and concise in your comments</li>
          <li>
            When asking for more information, be specific about what you need
          </li>
          <li>Use internal notes for technical details or team discussions</li>
          <li>
            Update the ticket status when waiting for information (use
            &quot;On Hold&quot;)
          </li>
        </ul>

        <h4 className="font-semibold text-text-primary mt-6">
          Status Workflow
        </h4>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-sm">Recommended status progression:</p>
          <div className="flex flex-wrap items-center gap-2 mt-2 text-sm">
            <span className="px-2 py-1 rounded bg-blue-500 text-white">New</span>
            <span>→</span>
            <span className="px-2 py-1 rounded bg-green-500 text-white">
              In Progress
            </span>
            <span>→</span>
            <span className="px-2 py-1 rounded bg-yellow-500 text-white">
              On Hold
            </span>
            <span className="text-gray-400">(if waiting)</span>
            <span>→</span>
            <span className="px-2 py-1 rounded bg-emerald-500 text-white">
              Resolved
            </span>
            <span>→</span>
            <span className="px-2 py-1 rounded bg-slate-500 text-white">
              Closed
            </span>
          </div>
        </div>
      </div>
    ),
  },
];

export default function HelpPage() {
  const [activeSection, setActiveSection] = useState("getting-started");

  return (
    <div className="min-h-screen flex flex-col bg-bg-subtle">
      {/* Header */}
      <header className="bg-white border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-brand-blue hover:text-brand-blue-light transition-colors"
          >
            ← Back to Tickets
          </Link>
          <h1 className="text-xl font-semibold text-text-primary">
            Help &amp; Documentation
          </h1>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex">
        {/* Navigation sidebar */}
        <aside className="w-64 border-r border-border bg-white overflow-y-auto">
          <nav className="p-4">
            <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
              Topics
            </h2>
            <ul className="space-y-1">
              {helpSections.map((section) => (
                <li key={section.id}>
                  <button
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                      activeSection === section.id
                        ? "bg-blue-50 text-brand-blue font-medium"
                        : "text-text-secondary hover:bg-gray-50 hover:text-text-primary"
                    }`}
                  >
                    {section.title}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* Content area */}
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-3xl">
            {helpSections.map((section) => (
              <div
                key={section.id}
                className={activeSection === section.id ? "block" : "hidden"}
              >
                <h2 className="text-2xl font-bold text-text-primary mb-6">
                  {section.title}
                </h2>
                <div className="prose prose-slate max-w-none text-text-primary">
                  {section.content}
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
