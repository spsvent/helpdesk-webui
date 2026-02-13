"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { debugCapture, formatDebugForTicket } from "@/lib/debugCapture";
import { useRBAC } from "@/contexts/RBACContext";

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
    id: "dark-mode",
    title: "Dark Mode",
    content: (
      <div className="space-y-4">
        <p>
          The Help Desk supports dark mode to reduce eye strain in low-light environments.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">
          Switching Color Modes
        </h4>
        <p>
          Click the color mode toggle button in the header (next to the Help link) to cycle through modes:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4 mt-3">
          <li>
            <strong>System (monitor icon):</strong> Automatically follows your device&apos;s light/dark preference
          </li>
          <li>
            <strong>Light (sun icon):</strong> Always use light mode
          </li>
          <li>
            <strong>Dark (moon icon):</strong> Always use dark mode
          </li>
        </ul>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-blue-800">
            <strong>Tip:</strong> Your color mode preference is saved automatically and will persist across sessions.
          </p>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">
          Seasonal Themes
        </h4>
        <p>
          The Help Desk features two color themes that change automatically based on the season:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4 mt-3">
          <li>
            <strong>Forest Adventure:</strong> Default green theme (most of the year)
          </li>
          <li>
            <strong>Santa&apos;s Village:</strong> Festive red theme (November 1 - January 7)
          </li>
        </ul>
        <p className="mt-2">
          Both themes support light and dark modes.
        </p>
      </div>
    ),
  },
  {
    id: "mobile-ipad",
    title: "Mobile & iPad",
    content: (
      <div className="space-y-4">
        <p>
          The Help Desk is optimized for mobile devices and iPads, and can be installed as an app on your device.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">
          Installing on iPad/iPhone
        </h4>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Open the Help Desk in Safari</li>
          <li>Tap the <strong>Share</strong> button (square with arrow)</li>
          <li>Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong></li>
          <li>Tap <strong>&quot;Add&quot;</strong> in the top right</li>
        </ol>
        <p className="mt-2">
          The Help Desk will now appear as an app icon on your home screen and launch in full-screen mode.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">
          Phone Layout
        </h4>
        <p>
          On phones (screens narrower than 768px), the layout adapts to single-panel views:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4 mt-3">
          <li>
            <strong>Ticket list view:</strong> Shows the list of tickets. Tap a ticket to view it.
          </li>
          <li>
            <strong>Ticket detail view:</strong> Use the &quot;← Back to Tickets&quot; button in the header to return to the list.
          </li>
          <li>
            <strong>Comments/Details toggle:</strong> When viewing a ticket, use the tabs at the top to switch between the Comments thread and the Details panel.
          </li>
        </ul>

        <h4 className="font-semibold text-text-primary mt-6">
          Tablet/iPad Layout
        </h4>
        <p>
          On tablets (768px and wider), you get the full split-panel experience:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4 mt-3">
          <li>
            <strong>Ticket list sidebar:</strong> Always visible on the left
          </li>
          <li>
            <strong>Comments &amp; Details:</strong> Both panels visible side-by-side
          </li>
          <li>
            <strong>Resizable sidebar:</strong> Drag the divider to adjust ticket list width
          </li>
        </ul>

        <h4 className="font-semibold text-text-primary mt-6">
          Mobile-Friendly Features
        </h4>
        <ul className="list-disc list-inside space-y-2 ml-4 mt-3">
          <li>
            <strong>Touch-optimized:</strong> Larger tap targets for easier interaction
          </li>
          <li>
            <strong>Compact headers:</strong> Information adapts to fit smaller screens
          </li>
          <li>
            <strong>Dark mode support:</strong> Works great in both light and dark modes
          </li>
        </ul>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-blue-800">
            <strong>Tip:</strong> For the best experience on iPad, use landscape orientation when viewing ticket details.
          </p>
        </div>
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
          <p><strong>Location</strong> (required): Where the issue is occurring</p>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">
          Smart Category Suggestions
        </h4>
        <p>
          As you type your title and description, the system will analyze your text and
          may suggest a category based on keywords:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4 mt-3">
          <li>
            <strong>Problem keywords:</strong> &quot;broken&quot;, &quot;not working&quot;, &quot;error&quot;, &quot;crashed&quot;, &quot;down&quot;, etc.
          </li>
          <li>
            <strong>Request keywords:</strong> &quot;need&quot;, &quot;new&quot;, &quot;install&quot;, &quot;access&quot;, &quot;permission&quot;, etc.
          </li>
        </ul>
        <p className="mt-2">
          If the system detects a mismatch, an amber suggestion box will appear. You can
          click &quot;Switch to [Category]&quot; to accept the suggestion, or &quot;Keep [Category]&quot; to dismiss it.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">
          Assignee Preview
        </h4>
        <p>
          After selecting a department, you&apos;ll see a preview of who will be assigned to your ticket.
          This shows:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4 mt-3">
          <li>The job title(s) of the person or team who will handle your ticket</li>
          <li>If assigned to a group, all team members and their job titles are listed</li>
        </ul>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-3">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> The assignee preview updates automatically as you change
            department selections, so you always know who will receive your ticket.
          </p>
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
          <li>Timestamp - relative for today (&quot;2h ago&quot;), &quot;Yesterday&quot;, or full date (Jan 28, 2026)</li>
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
          <li>
            <strong>Attachments:</strong> Upload, download, and manage file attachments
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
    id: "file-attachments",
    title: "File Attachments",
    content: (
      <div className="space-y-4">
        <p>
          You can attach files to tickets to provide screenshots, documents, or other
          supporting materials. Attachments are stored securely in SharePoint.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">Uploading Attachments</h4>
        <p>To upload a file to a ticket:</p>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Select the ticket you want to add files to</li>
          <li>In the Details panel on the right, scroll down to the <strong>Attachments</strong> section</li>
          <li>Either drag and drop files onto the upload zone, or click to browse for files</li>
          <li>Wait for the upload to complete</li>
        </ol>

        <h4 className="font-semibold text-text-primary mt-6">Supported File Types</h4>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 text-purple-500">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </span>
            <span className="text-sm">Images (PNG, JPG, GIF)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 text-red-500">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </span>
            <span className="text-sm">PDFs</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 text-blue-500">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </span>
            <span className="text-sm">Word docs (DOC, DOCX)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 text-green-500">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
            </span>
            <span className="text-sm">Excel files (XLS, XLSX, CSV)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-4 text-gray-500">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </span>
            <span className="text-sm">Text files (TXT, LOG)</span>
          </div>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">File Size Limits</h4>
        <p>
          The maximum file size for attachments is <strong>10 MB</strong> per file.
          Files larger than this will be rejected with an error message.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">Downloading Attachments</h4>
        <p>
          To download an attachment, hover over the file in the attachment list and click the
          download button (arrow icon). The file will be downloaded to your computer.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">Deleting Attachments</h4>
        <p>
          If you have edit permissions for the ticket, you can delete attachments by hovering
          over the file and clicking the trash icon. You&apos;ll be asked to confirm before the
          file is deleted.
        </p>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-yellow-800">
            <strong>Important:</strong> Deleted attachments cannot be recovered.
            Make sure you have a backup if needed before deleting.
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-blue-800">
            <strong>Tip:</strong> Attachments are helpful for providing screenshots of error
            messages, relevant documents, or any visual information that helps explain the issue.
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
    id: "approval-workflow",
    title: "Approval Workflow",
    content: (
      <div className="space-y-4">
        <p>
          Some tickets may require manager approval before proceeding. The approval
          workflow allows support staff to request approval from General Managers,
          who can then approve, deny, or request changes.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">Approval Status Badges</h4>
        <div className="space-y-3 mt-3">
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800 border border-yellow-300">
              Pending Approval
            </span>
            <span>Waiting for a manager to review and decide</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 border border-green-300">
              Approved
            </span>
            <span>A manager has approved this ticket</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800 border border-red-300">
              Denied
            </span>
            <span>A manager has denied the request</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-800 border border-orange-300">
              Changes Requested
            </span>
            <span>A manager has requested modifications before approval</span>
          </div>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">For Support Staff: Requesting Approval</h4>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Open a ticket you have permission to edit</li>
          <li>
            In the Details panel on the right, find the <strong>&quot;Request Approval&quot;</strong> button
          </li>
          <li>Click the button and confirm your request</li>
          <li>An email notification will be sent to all General Managers</li>
          <li>The ticket will show a &quot;Pending Approval&quot; badge</li>
        </ol>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-blue-800">
            <strong>Re-requesting Approval:</strong> If a ticket was previously approved, denied,
            or had changes requested, you can request approval again as the ticket evolves with
            new information. The button will show &quot;Re-request Approval&quot; in these cases.
          </p>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">For Managers: Reviewing Approvals</h4>
        <p>Managers can approve or deny tickets in three ways:</p>

        <div className="space-y-3 mt-3">
          <div className="p-3 border border-gray-200 rounded-lg">
            <p className="font-medium">1. Email Buttons</p>
            <p className="text-sm text-gray-600 mt-1">
              Click the Approve, Deny, or Request Changes button directly in the email notification.
              This will open the ticket in the Help Desk where you can add notes and confirm your decision.
            </p>
          </div>
          <div className="p-3 border border-gray-200 rounded-lg">
            <p className="font-medium">2. Pending Approvals Badge</p>
            <p className="text-sm text-gray-600 mt-1">
              Click the yellow &quot;Approvals&quot; badge in the header to see pending approval requests.
              The badge shows a count of tickets awaiting your decision.
            </p>
          </div>
          <div className="p-3 border border-gray-200 rounded-lg">
            <p className="font-medium">3. In-App on Any Ticket</p>
            <p className="text-sm text-gray-600 mt-1">
              As a manager, you can approve or deny any ticket directly from the Details panel,
              even without a formal approval request. This allows proactive approval when needed.
            </p>
          </div>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">Making an Approval Decision</h4>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Open the ticket requiring approval</li>
          <li>In the Details panel, you&apos;ll see the Approval Actions section</li>
          <li>Click <strong>Approve</strong>, <strong>Deny</strong>, or <strong>Changes</strong></li>
          <li>
            Add notes (required for Deny and Changes Requested, optional for Approve)
          </li>
          <li>Click Confirm to submit your decision</li>
        </ol>

        <h4 className="font-semibold text-text-primary mt-6">Approval History</h4>
        <p>
          The Details panel shows a timeline of approval activity including:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>Who requested approval and when</li>
          <li>The decision made (if any)</li>
          <li>Who made the decision and any notes they provided</li>
        </ul>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-yellow-800">
            <strong>Automatic Notes:</strong> All approval actions automatically create an internal
            note on the ticket documenting the decision, so there&apos;s always a record of what happened.
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
    id: "admin-ticket-management",
    title: "Admin: Managing Ticket Details",
    content: (
      <div className="space-y-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            <strong>Admin Only:</strong> These features are only available to administrators.
          </p>
        </div>

        <p>
          Administrators have additional editing capabilities in the ticket Details panel.
          Fields marked with <span className="text-brand-blue">(editable)</span> can be modified by admins.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">Editable Fields</h4>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>
            <strong>Assignee:</strong> Who is responsible for the ticket (searchable dropdown)
          </li>
          <li>
            <strong>Category:</strong> Request or Problem
          </li>
          <li>
            <strong>Department:</strong> Which team handles this (Tech, Operations, etc.)
          </li>
          <li>
            <strong>Sub-Category:</strong> More specific category within the department
          </li>
          <li>
            <strong>Specific Type:</strong> Most detailed classification (when available)
          </li>
        </ul>

        <h4 className="font-semibold text-text-primary mt-6">Searching for Assignees</h4>
        <p>
          The assignee field uses a searchable dropdown that lets you find users from your organization:
        </p>
        <ol className="list-decimal list-inside space-y-2 ml-4 mt-3">
          <li>Click on the assignee search box</li>
          <li>Start typing a name or email (at least 2 characters)</li>
          <li>Results will appear showing matching users</li>
          <li>Click on a user to select them</li>
          <li>Click the X button to clear the selection</li>
        </ol>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-blue-800">
            <strong>Tip:</strong> You can search by display name or email address.
            The dropdown shows the user&apos;s job title to help identify the right person.
          </p>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">Auto-Assignment Rules</h4>
        <p>
          When you change the department of a ticket, the system may suggest an automatic assignee
          based on configured rules. A blue suggestion box will appear:
        </p>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-blue-700">Auto-assign: jnunn@skyparksantasvillage.com</span>
            <span className="text-xs text-blue-600 font-medium cursor-pointer">Apply</span>
          </div>
        </div>

        <p className="mt-3">Click &quot;Apply&quot; to accept the suggestion, or search for a different user.</p>

        <h4 className="font-semibold text-text-primary mt-6">Current Auto-Assignment Rules</h4>
        <p className="text-sm text-text-secondary mt-2">
          Auto-assignment rules are configured by administrators in SharePoint. Each department
          has a designated contact who receives new tickets automatically. Contact your
          administrator to view or modify the current assignment rules.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">Saving Changes</h4>
        <p>
          After making changes to any fields, click the <strong>&quot;Save Changes&quot;</strong> button
          that appears at the bottom of the Details panel. Changes are not saved until you click this button.
        </p>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-yellow-800">
            <strong>Note:</strong> Changing the department or category may affect which team members
            can see and edit the ticket based on their permissions.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "admin-bulk-actions",
    title: "Admin: Bulk Actions",
    content: (
      <div className="space-y-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            <strong>Admin Only:</strong> Bulk actions are only available to administrators.
          </p>
        </div>

        <p>
          Administrators can perform actions on multiple tickets at once using the bulk actions
          feature. This saves time when you need to update status, priority, or assignee for
          several tickets.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">Selecting Tickets</h4>
        <p>When logged in as an admin, checkboxes appear next to each ticket in the list:</p>
        <ul className="list-disc list-inside space-y-2 ml-4 mt-3">
          <li>
            <strong>Single select:</strong> Click the checkbox next to a ticket to select it
          </li>
          <li>
            <strong>Range select:</strong> Hold <strong>Shift</strong> and click another checkbox
            to select all tickets between your last selection and the clicked checkbox
          </li>
          <li>
            <strong>Deselect:</strong> Click a selected checkbox again to deselect it
          </li>
        </ul>

        <h4 className="font-semibold text-text-primary mt-6">Bulk Action Toolbar</h4>
        <p>
          When you have one or more tickets selected, a purple toolbar appears above the ticket
          list showing how many tickets are selected and the available actions:
        </p>

        <div className="bg-brand-primary text-white px-4 py-2 rounded-lg mt-3">
          <span className="font-medium">3 tickets selected</span>
          <span className="ml-4 px-3 py-1 bg-white/20 rounded text-sm">Set Status</span>
          <span className="ml-2 px-3 py-1 bg-white/20 rounded text-sm">Set Priority</span>
          <span className="ml-2 px-3 py-1 bg-white/20 rounded text-sm">Reassign</span>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">Available Bulk Actions</h4>
        <div className="space-y-4 mt-3">
          <div className="p-3 border border-gray-200 rounded-lg">
            <p className="font-medium">Set Status</p>
            <p className="text-sm text-gray-600 mt-1">
              Change the status of all selected tickets to New, In Progress, On Hold, Resolved, or Closed.
            </p>
          </div>
          <div className="p-3 border border-gray-200 rounded-lg">
            <p className="font-medium">Set Priority</p>
            <p className="text-sm text-gray-600 mt-1">
              Change the priority of all selected tickets to Low, Normal, High, or Urgent.
            </p>
          </div>
          <div className="p-3 border border-gray-200 rounded-lg">
            <p className="font-medium">Reassign</p>
            <p className="text-sm text-gray-600 mt-1">
              Reassign all selected tickets to a different user. Type at least 2 characters
              to search for users by name or email.
            </p>
          </div>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">Using Bulk Actions</h4>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Select the tickets you want to update using the checkboxes</li>
          <li>Click one of the action buttons in the toolbar (Set Status, Set Priority, or Reassign)</li>
          <li>Select the new value from the dropdown menu</li>
          <li>The action will be applied to all selected tickets</li>
          <li>A confirmation will show how many tickets were updated successfully</li>
        </ol>

        <h4 className="font-semibold text-text-primary mt-6">Clearing Selection</h4>
        <p>
          Click the <strong>X</strong> button on the right side of the toolbar to clear all
          selections and hide the bulk action toolbar.
        </p>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-blue-800">
            <strong>Tip:</strong> Use shift-click to quickly select a range of tickets.
            For example, select the first ticket, then shift-click the tenth ticket to
            select all ten at once.
          </p>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-yellow-800">
            <strong>Note:</strong> If some tickets fail to update (e.g., due to permission
            issues), the toolbar will show how many succeeded and how many failed. Successfully
            updated tickets will reflect their new values immediately.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "merging-tickets",
    title: "Merging Tickets",
    content: (
      <div className="space-y-4">
        <p>
          When duplicate tickets are submitted for the same issue, you can merge them
          to consolidate all comments and close the duplicate. This keeps your ticket
          history organized and avoids losing any information.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">Who Can Merge Tickets?</h4>
        <div className="space-y-3 mt-3">
          <div className="flex items-start gap-3 p-3 border border-blue-200 bg-blue-50 rounded-lg">
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 shrink-0">
              Support
            </span>
            <div className="text-sm">
              <p className="font-medium">Single ticket merge</p>
              <p className="text-gray-600 mt-1">Can merge tickets from the ticket detail view.</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 border border-purple-200 bg-purple-50 rounded-lg">
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 shrink-0">
              Admin
            </span>
            <div className="text-sm">
              <p className="font-medium">Single merge + Bulk merge</p>
              <p className="text-gray-600 mt-1">Can merge from ticket detail view and also bulk merge multiple tickets from the ticket list.</p>
            </div>
          </div>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">Merging from Ticket Detail</h4>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Open the ticket you want to merge (the duplicate)</li>
          <li>
            In the Details panel on the right, click the <strong>&quot;Merge Ticket&quot;</strong> button
          </li>
          <li>Search for the target ticket by number, title, or requester name</li>
          <li>Select the target ticket from the results</li>
          <li>Review the confirmation message and click <strong>&quot;Confirm Merge&quot;</strong></li>
        </ol>

        <h4 className="font-semibold text-text-primary mt-6">Bulk Merging (Admin Only)</h4>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Select 2 or more tickets using the checkboxes in the ticket list</li>
          <li>
            Click the <strong>&quot;Merge&quot;</strong> button in the bulk action toolbar
          </li>
          <li>Choose which ticket should be the <strong>primary</strong> (the one that stays open)</li>
          <li>Confirm the merge &mdash; all other selected tickets will be merged into the primary</li>
        </ol>

        <h4 className="font-semibold text-text-primary mt-6">What Happens When Tickets Are Merged</h4>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>
            All comments from the duplicate ticket are <strong>copied</strong> to the primary ticket,
            each prefixed with the original author and timestamp
          </li>
          <li>
            A reference note is added to both tickets indicating the merge
          </li>
          <li>
            The duplicate ticket is <strong>closed</strong> automatically
          </li>
          <li>
            The merge is recorded in the Activity Log
          </li>
        </ul>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-blue-800">
            <strong>Tip:</strong> The merge search only shows open tickets (not Closed or Resolved)
            to prevent merging into inactive tickets.
          </p>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-yellow-800">
            <strong>Note:</strong> You cannot merge a ticket that is already closed. If you need to
            merge a closed ticket, reopen it first by changing its status.
          </p>
        </div>
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
  {
    id: "outlook-rules",
    title: "Organizing Help Desk Emails",
    content: (
      <div className="space-y-4">
        <p>
          If you receive Help Desk notification emails and want to keep your inbox organized,
          you can create an Outlook rule to automatically move these emails to a dedicated folder.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">Creating the Folder</h4>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>In Outlook, right-click on <strong>Inbox</strong> in the folder list</li>
          <li>Select <strong>New Folder</strong></li>
          <li>Name it something like &quot;Help Desk&quot; or &quot;Support Tickets&quot;</li>
          <li>Press Enter to create the folder</li>
        </ol>

        <h4 className="font-semibold text-text-primary mt-6">Creating the Rule in Outlook Desktop</h4>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Go to <strong>File → Manage Rules &amp; Alerts</strong></li>
          <li>Click <strong>New Rule...</strong></li>
          <li>Select <strong>&quot;Apply rule on messages I receive&quot;</strong> and click Next</li>
          <li>
            Check <strong>&quot;with specific words in the subject&quot;</strong>
          </li>
          <li>
            Click <strong>&quot;specific words&quot;</strong> and add: <code className="bg-gray-100 px-1 rounded">[Ticket #</code>
          </li>
          <li>Click <strong>Add</strong>, then <strong>OK</strong>, then <strong>Next</strong></li>
          <li>
            Check <strong>&quot;move it to the specified folder&quot;</strong>
          </li>
          <li>Click <strong>&quot;specified&quot;</strong> and select your Help Desk folder</li>
          <li>Click <strong>Next</strong>, then <strong>Finish</strong></li>
          <li>Click <strong>Apply</strong> and <strong>OK</strong></li>
        </ol>

        <h4 className="font-semibold text-text-primary mt-6">Creating the Rule in Outlook on the Web</h4>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>
            Click the <strong>Settings</strong> gear icon in the top right
          </li>
          <li>Click <strong>View all Outlook settings</strong> at the bottom</li>
          <li>Go to <strong>Mail → Rules</strong></li>
          <li>Click <strong>+ Add new rule</strong></li>
          <li>Name the rule (e.g., &quot;Help Desk Emails&quot;)</li>
          <li>
            Under &quot;Add a condition&quot;, select <strong>Subject includes</strong>
          </li>
          <li>
            Enter: <code className="bg-gray-100 px-1 rounded">[Ticket #</code>
          </li>
          <li>
            Under &quot;Add an action&quot;, select <strong>Move to</strong>
          </li>
          <li>Select your Help Desk folder</li>
          <li>Click <strong>Save</strong></li>
        </ol>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-blue-800">
            <strong>Tip:</strong> All Help Desk emails include the ticket number in the subject line
            (e.g., &quot;[Ticket #123] Your ticket has been updated&quot;). This makes it easy to filter
            them with a single rule.
          </p>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">Alternative: Filter by Sender</h4>
        <p>
          You can also filter by the sender email address if you prefer. Help Desk emails
          come from the system&apos;s notification address. Ask your administrator for the exact
          sender address if you&apos;d like to use this method.
        </p>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-yellow-800">
            <strong>Note:</strong> After creating the rule, existing emails won&apos;t be moved automatically.
            You can run the rule manually on existing messages, or just let it organize new emails going forward.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "teams-notifications",
    title: "Teams Notifications",
    content: (
      <div className="space-y-4">
        <p>
          The Help Desk can automatically post notifications to Microsoft Teams channels
          when certain ticket events occur. This helps teams stay informed about new
          and updated tickets without needing to constantly check the Help Desk.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">What Triggers a Teams Notification?</h4>
        <p>
          Teams notifications are sent for tickets with <strong>Normal, High, or Urgent</strong>{" "}
          priority. Low priority tickets do not trigger Teams notifications.
        </p>

        <div className="space-y-3 mt-3">
          <div className="flex items-start gap-3 p-3 border border-blue-200 bg-blue-50 rounded-lg">
            <span className="px-2 py-1 rounded text-xs font-medium bg-blue-500 text-white shrink-0">
              New Ticket
            </span>
            <div className="text-sm">
              <p className="font-medium">When a new ticket is created</p>
              <p className="text-gray-600">
                Posts a card with ticket ID, title, priority, category, department,
                requester, location, and description preview.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg">
            <span className="px-2 py-1 rounded text-xs font-medium bg-gray-500 text-white shrink-0">
              Status Change
            </span>
            <div className="text-sm">
              <p className="font-medium">When a ticket status is updated</p>
              <p className="text-gray-600">
                Shows the old status → new status transition and who made the change.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 border border-orange-200 bg-orange-50 rounded-lg">
            <span className="px-2 py-1 rounded text-xs font-medium bg-orange-500 text-white shrink-0">
              Priority Escalation
            </span>
            <div className="text-sm">
              <p className="font-medium">When priority is increased</p>
              <p className="text-gray-600">
                Posts an attention-grabbing card when priority is escalated (e.g., Normal → High).
                De-escalations do not trigger notifications.
              </p>
            </div>
          </div>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">Department-Specific Channels</h4>
        <p>
          Each department (Tech, Operations, HR, etc.) can have its own dedicated Teams channel.
          Notifications are routed to the appropriate channel based on the ticket&apos;s department.
        </p>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-blue-800">
            <strong>Note:</strong> If your department doesn&apos;t have a Teams channel configured,
            no notification will be sent. Contact your administrator to set up Teams integration
            for your department.
          </p>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">Adaptive Cards</h4>
        <p>
          Teams notifications use Microsoft Adaptive Cards for rich formatting. Each card includes:
        </p>
        <ul className="list-disc list-inside space-y-2 ml-4 mt-3">
          <li>Color-coded header indicating the event type</li>
          <li>Ticket ID and title</li>
          <li>Key details (priority, status, department)</li>
          <li>A &quot;View Ticket&quot; button that links directly to the ticket in the Help Desk</li>
        </ul>

        <h4 className="font-semibold text-text-primary mt-6">Minimum Priority Threshold</h4>
        <p>
          Each Teams channel can be configured with a minimum priority threshold. For example,
          a channel might only receive notifications for High and Urgent tickets, ignoring
          Normal priority. This helps reduce noise in channels that only need to see critical issues.
        </p>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-yellow-800">
            <strong>Important:</strong> Teams notifications are &quot;fire-and-forget&quot; - if a
            notification fails to post (e.g., due to network issues), it won&apos;t block the
            ticket operation. The ticket will still be created or updated successfully.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "admin-deployment",
    title: "Admin: Deployment & Environment Setup",
    content: (
      <div className="space-y-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            <strong>Admin Only:</strong> This section covers deployment configuration
            for administrators setting up or maintaining the Help Desk application.
          </p>
        </div>

        <p>
          The Help Desk uses Azure Static Web Apps with GitHub Actions for deployment.
          Environment variables are configured in two places depending on when they&apos;re needed.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">Build-Time vs Runtime Variables</h4>
        <div className="space-y-3 mt-3">
          <div className="p-3 border border-blue-200 bg-blue-50 rounded-lg">
            <p className="font-medium">Build-Time (NEXT_PUBLIC_*)</p>
            <p className="text-sm text-gray-600 mt-1">
              Variables starting with <code className="bg-blue-100 px-1 rounded">NEXT_PUBLIC_</code> are
              baked into the app at build time. These must be configured in <strong>GitHub Actions</strong>.
            </p>
          </div>
          <div className="p-3 border border-gray-200 rounded-lg">
            <p className="font-medium">Runtime</p>
            <p className="text-sm text-gray-600 mt-1">
              Server-side variables can be configured in Azure Portal, but this app uses static export
              so most configuration is build-time.
            </p>
          </div>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">Configuring GitHub Secrets</h4>
        <p>
          Sensitive values (API keys, function URLs) should be stored as GitHub repository secrets:
        </p>
        <ol className="list-decimal list-inside space-y-2 ml-4 mt-3">
          <li>Go to your GitHub repository</li>
          <li>Navigate to <strong>Settings → Secrets and variables → Actions</strong></li>
          <li>Click <strong>New repository secret</strong></li>
          <li>Add each secret with its name and value</li>
        </ol>

        <h4 className="font-semibold text-text-primary mt-6">Required GitHub Secrets</h4>
        <div className="overflow-x-auto mt-3">
          <table className="min-w-full text-sm border border-gray-200 rounded-lg">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Secret Name</th>
                <th className="px-4 py-2 text-left font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              <tr>
                <td className="px-4 py-2 font-mono text-xs">AZURE_STATIC_WEB_APPS_API_TOKEN_*</td>
                <td className="px-4 py-2">Auto-generated deployment token</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono text-xs">NEXT_PUBLIC_COMMENTS_LIST_ID</td>
                <td className="px-4 py-2">SharePoint Comments list GUID</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono text-xs">NEXT_PUBLIC_EMAIL_FUNCTION_URL</td>
                <td className="px-4 py-2">Azure Function URL for sending emails (includes API key)</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono text-xs">NEXT_PUBLIC_ESCALATION_FUNCTION_URL</td>
                <td className="px-4 py-2">Azure Function URL for escalation checks (includes API key)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">GitHub Actions Workflow</h4>
        <p>
          The workflow file is located at <code className="bg-gray-100 px-1 rounded">.github/workflows/azure-static-web-apps-*.yml</code>.
          Non-sensitive environment variables are configured directly in this file:
        </p>
        <div className="bg-gray-900 text-green-400 p-3 rounded-lg font-mono text-xs mt-3 overflow-x-auto">
          <pre>{`env:
  NEXT_PUBLIC_CLIENT_ID: "your-client-id"
  NEXT_PUBLIC_TENANT_ID: "your-tenant-id"
  NEXT_PUBLIC_SHAREPOINT_SITE_ID: "site-id"
  NEXT_PUBLIC_TICKETS_LIST_ID: "list-guid"
  NEXT_PUBLIC_AUTO_ASSIGN_LIST_ID: "list-guid"
  NEXT_PUBLIC_ESCALATION_LIST_ID: "list-guid"
  NEXT_PUBLIC_ACTIVITY_LOG_LIST_ID: "list-guid"
  # Secrets referenced like this:
  NEXT_PUBLIC_EMAIL_FUNCTION_URL: \${{ secrets.NEXT_PUBLIC_EMAIL_FUNCTION_URL }}`}</pre>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">Adding a New SharePoint List</h4>
        <p>When you create a new SharePoint list through the app (e.g., AutoAssign Rules, Escalation Rules):</p>
        <ol className="list-decimal list-inside space-y-2 ml-4 mt-3">
          <li>Note the list ID shown after creation</li>
          <li>Add the environment variable to your local <code className="bg-gray-100 px-1 rounded">.env.local</code></li>
          <li>Add the same variable to the GitHub Actions workflow file</li>
          <li>Commit and push to trigger a rebuild</li>
        </ol>

        <h4 className="font-semibold text-text-primary mt-6">Finding SharePoint List IDs</h4>
        <p>To find an existing list&apos;s ID:</p>
        <ol className="list-decimal list-inside space-y-2 ml-4 mt-3">
          <li>Go to your SharePoint site → Site Contents</li>
          <li>Click on the list</li>
          <li>Click the gear icon → <strong>List Settings</strong></li>
          <li>Look at the URL - find <code className="bg-gray-100 px-1 rounded">List=%7B...%7D</code></li>
          <li>The GUID is between the encoded braces (decode %7B as {"{"} and %7D as {"}"})</li>
        </ol>

        <h4 className="font-semibold text-text-primary mt-6">Triggering a Rebuild</h4>
        <p>
          After changing environment variables, you must trigger a new build for changes to take effect:
        </p>
        <div className="bg-gray-900 text-green-400 p-3 rounded-lg font-mono text-sm mt-3">
          git commit --allow-empty -m &quot;Trigger rebuild&quot; &amp;&amp; git push
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-blue-800">
            <strong>Tip:</strong> For a complete deployment guide including Azure AD setup,
            SharePoint configuration, and Azure Functions, see the{" "}
            <code className="bg-blue-100 px-1 rounded">DEPLOYMENT.md</code> file in the repository.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "admin-teams-config",
    title: "Admin: Teams Channel Configuration",
    content: (
      <div className="space-y-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800">
            <strong>Admin Only:</strong> This section is for administrators who configure
            Teams channel mappings.
          </p>
        </div>

        <p>
          Teams notifications are configured through a SharePoint list called{" "}
          <strong>TeamsChannels</strong>. Each item in the list maps a department to a
          specific Teams channel.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">SharePoint List Structure</h4>
        <div className="overflow-x-auto mt-3">
          <table className="min-w-full text-sm border border-gray-200 rounded-lg">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Column</th>
                <th className="px-4 py-2 text-left font-medium">Type</th>
                <th className="px-4 py-2 text-left font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              <tr>
                <td className="px-4 py-2 font-mono text-xs">Title</td>
                <td className="px-4 py-2">Text</td>
                <td className="px-4 py-2">Friendly name (e.g., &quot;Tech Support Channel&quot;)</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono text-xs">Department</td>
                <td className="px-4 py-2">Text</td>
                <td className="px-4 py-2">Must match ticket problemType exactly (Tech, Operations, HR)</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono text-xs">TeamId</td>
                <td className="px-4 py-2">Text</td>
                <td className="px-4 py-2">Microsoft Teams Team ID (GUID)</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono text-xs">ChannelId</td>
                <td className="px-4 py-2">Text</td>
                <td className="px-4 py-2">Channel ID (format: 19:xxx@thread.tacv2)</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono text-xs">IsActive</td>
                <td className="px-4 py-2">Yes/No</td>
                <td className="px-4 py-2">Enable or disable notifications for this channel</td>
              </tr>
              <tr>
                <td className="px-4 py-2 font-mono text-xs">MinPriority</td>
                <td className="px-4 py-2">Choice</td>
                <td className="px-4 py-2">Minimum priority to notify (Low, Normal, High, Urgent)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">Finding Team and Channel IDs</h4>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Open Microsoft Teams and navigate to the team and channel</li>
          <li>Click the three dots (...) next to the channel name</li>
          <li>Select &quot;Get link to channel&quot;</li>
          <li>The link contains both IDs in encoded format</li>
          <li>
            Alternatively, use the{" "}
            <a
              href="https://developer.microsoft.com/en-us/graph/graph-explorer"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-blue hover:underline"
            >
              Microsoft Graph Explorer
            </a>{" "}
            to query your teams and channels
          </li>
        </ol>

        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-red-800 font-semibold">⚠️ Critical: Decode URL-Encoded Channel IDs</p>
          <p className="text-sm text-red-700 mt-2">
            When copying the ChannelId from a Teams link, you <strong>must decode</strong> URL-encoded characters
            or notifications will go to the wrong channel:
          </p>
          <ul className="list-disc list-inside text-sm text-red-700 mt-2 ml-2">
            <li><code className="bg-red-100 px-1 rounded">%3A</code> → <code className="bg-red-100 px-1 rounded">:</code> (colon)</li>
            <li><code className="bg-red-100 px-1 rounded">%40</code> → <code className="bg-red-100 px-1 rounded">@</code> (at sign)</li>
          </ul>
          <div className="mt-3 text-sm text-red-700">
            <strong>Example:</strong>
            <div className="font-mono text-xs mt-1 bg-red-100 p-2 rounded">
              ❌ Wrong: 19%3A1234abcd5678%40thread.tacv2<br />
              ✅ Correct: 19:1234abcd5678@thread.tacv2
            </div>
          </div>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">Azure AD Permissions</h4>
        <p>
          The Help Desk app registration requires the <strong>ChannelMessage.Send</strong>{" "}
          delegated permission to post messages to Teams channels.
        </p>
        <ol className="list-decimal list-inside space-y-2 ml-4 mt-3">
          <li>Go to Azure Portal → App Registrations → Your App</li>
          <li>Navigate to API Permissions</li>
          <li>Add <strong>Microsoft Graph → Delegated → ChannelMessage.Send</strong></li>
          <li>Grant admin consent for the organization</li>
        </ol>

        <h4 className="font-semibold text-text-primary mt-6">Environment Variables</h4>
        <p>
          Set the following environment variables to configure Teams notifications:
        </p>
        <div className="bg-gray-900 text-green-400 p-3 rounded-lg font-mono text-sm mt-3 space-y-2">
          <div># Enable Teams notifications (disabled by default)</div>
          <div>NEXT_PUBLIC_TEAMS_NOTIFICATIONS_ENABLED=true</div>
          <div></div>
          <div># Only notify for tickets created on/after this date (YYYY-MM-DD)</div>
          <div># Prevents notification floods for migrated/old tickets</div>
          <div>NEXT_PUBLIC_TEAMS_NOTIFICATIONS_START_DATE=2026-01-23</div>
          <div></div>
          <div># SharePoint list ID for channel configuration</div>
          <div>NEXT_PUBLIC_TEAMS_CHANNELS_LIST_ID=your-list-guid-here</div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-yellow-800">
            <strong>Important:</strong> Teams notifications are <strong>disabled by default</strong>.
            You must set <code className="bg-yellow-100 px-1 rounded">NEXT_PUBLIC_TEAMS_NOTIFICATIONS_ENABLED=true</code>{" "}
            to enable them. This prevents accidental notification floods during setup or migration.
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-blue-800">
            <strong>Tip:</strong> Use the <code className="bg-blue-100 px-1 rounded">NEXT_PUBLIC_TEAMS_NOTIFICATIONS_START_DATE</code>{" "}
            variable to prevent notifications for old or migrated tickets. Set it to today&apos;s date
            when you&apos;re ready to go live, and only tickets created from that point forward will
            trigger Teams notifications.
          </p>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">Testing</h4>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Create a TeamsChannels list item for a test department</li>
          <li>Set IsActive to Yes and MinPriority to Normal</li>
          <li>Create a Normal priority ticket in that department</li>
          <li>Verify the notification appears in the Teams channel</li>
          <li>Create a Low priority ticket - it should NOT post to Teams</li>
        </ol>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-blue-800">
            <strong>Tip:</strong> Configuration changes are cached for 5 minutes.
            After updating the SharePoint list, wait a few minutes for the cache
            to refresh, or sign out and back in.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "attaching-files",
    title: "Attaching Files",
    content: (
      <div className="space-y-4">
        <p>
          You can attach files to tickets both during creation and on existing tickets.
          Files are stored securely in SharePoint and accessible to anyone who can view
          the ticket.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">
          Attaching Files During Ticket Creation
        </h4>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>
            Fill out the new ticket form as usual (title, description, etc.)
          </li>
          <li>
            Scroll down to the <strong>Attachments</strong> section before submitting
          </li>
          <li>
            Click to browse for files, or drag and drop files into the upload zone
          </li>
          <li>
            Selected files will appear as staged items &mdash; you can review and
            remove them before submitting
          </li>
          <li>
            Click <strong>&quot;Submit Ticket&quot;</strong> to create the ticket with
            the attached files
          </li>
        </ol>

        <h4 className="font-semibold text-text-primary mt-6">
          Attaching Files to Existing Tickets
        </h4>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>Select the ticket you want to add files to</li>
          <li>
            In the <strong>Details panel</strong> on the right, scroll down to the{" "}
            <strong>Attachments</strong> section
          </li>
          <li>
            Drag and drop files onto the upload zone, or click to browse for files
          </li>
          <li>Wait for the upload to complete</li>
        </ol>

        <h4 className="font-semibold text-text-primary mt-6">Supported File Types</h4>
        <ul className="list-disc list-inside space-y-2 ml-4">
          <li>
            <strong>Images:</strong> PNG, JPG, GIF, and other common image formats
          </li>
          <li>
            <strong>PDFs:</strong> PDF documents
          </li>
          <li>
            <strong>Documents:</strong> Word (DOC, DOCX), text files (TXT)
          </li>
          <li>
            <strong>Spreadsheets:</strong> Excel (XLS, XLSX), CSV files
          </li>
          <li>
            <strong>Other:</strong> Most common file types are accepted
          </li>
        </ul>

        <h4 className="font-semibold text-text-primary mt-6">File Size Limit</h4>
        <p>
          The maximum file size is <strong>4 MB per file</strong>. Files larger than
          this will be rejected with an error message.
        </p>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-blue-800">
            <strong>Tip:</strong> Files are staged before upload &mdash; you can review
            and remove any files before submitting. This prevents accidental uploads
            and lets you double-check that you have the right files attached.
          </p>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-yellow-800">
            <strong>Note:</strong> Attachments are helpful for providing screenshots
            of error messages, relevant documents, receipts, or any visual information
            that helps explain the issue or request.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "purchase-requests",
    title: "Purchase Requests",
    content: (
      <div className="space-y-4">
        <p>
          Purchase requests allow employees to request the purchase of items or
          services. These requests follow a multi-step approval and fulfillment
          workflow that includes manager approval, purchasing, and inventory
          receiving.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">
          Creating a Purchase Request
        </h4>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>
            Click <strong>&quot;+ New Ticket&quot;</strong> in the header
          </li>
          <li>
            Select <strong>&quot;Request&quot;</strong> as the category
          </li>
          <li>
            Check the <strong>&quot;This is a Purchase Request&quot;</strong> checkbox
            that appears
          </li>
          <li>Fill out the standard ticket fields (title, description, department, etc.)</li>
          <li>Complete the purchase-specific fields (see below)</li>
          <li>
            Click <strong>&quot;Submit Ticket&quot;</strong> to submit your purchase request
          </li>
        </ol>

        <h4 className="font-semibold text-text-primary mt-6">
          Purchase Request Fields
        </h4>
        <div className="ml-4 mt-3 space-y-3">
          <p>
            <strong>Quantity</strong> (required): How many items you need
          </p>
          <p>
            <strong>Estimated Cost Per Item</strong> (required): The approximate cost
            of each item
          </p>
          <p>
            <strong>Justification</strong> (required): Why this purchase is needed
          </p>
          <p>
            <strong>Item Link/URL</strong> (optional): A link to the item online
          </p>
          <p>
            <strong>Project</strong> (optional): The project this purchase is
            associated with
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-blue-800">
            <strong>Tip:</strong> The estimated total cost is calculated automatically
            by multiplying the quantity by the estimated cost per item. This helps
            managers quickly evaluate the request.
          </p>
        </div>

        <h4 className="font-semibold text-text-primary mt-6">
          Purchase Request Workflow
        </h4>
        <p>
          Purchase requests follow a multi-step workflow. Each step sends email
          notifications to the relevant parties:
        </p>
        <div className="space-y-3 mt-3">
          <div className="p-3 border border-gray-200 rounded-lg">
            <p className="font-medium">1. Employee Submits Request</p>
            <p className="text-sm text-gray-600 mt-1">
              The employee creates a purchase request ticket with item details,
              quantity, cost estimate, and justification. The General Manager is
              notified.
            </p>
          </div>
          <div className="p-3 border border-gray-200 rounded-lg">
            <p className="font-medium">2. General Manager Reviews</p>
            <p className="text-sm text-gray-600 mt-1">
              The General Manager can take one of the following actions:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4 mt-2 text-sm text-gray-600">
              <li><strong>Approve:</strong> Sends the request to the purchasing team</li>
              <li><strong>Deny:</strong> Rejects the request with a reason</li>
              <li><strong>Approve with Changes:</strong> Approves with modifications noted</li>
              <li><strong>Approve &amp; Order:</strong> Approves and marks the item as already ordered</li>
            </ul>
          </div>
          <div className="p-3 border border-gray-200 rounded-lg">
            <p className="font-medium">3. Purchaser Places Order</p>
            <p className="text-sm text-gray-600 mt-1">
              The purchasing team places the order and records the vendor name,
              order confirmation number, actual cost, and expected delivery date.
              The inventory team is notified.
            </p>
          </div>
          <div className="p-3 border border-gray-200 rounded-lg">
            <p className="font-medium">4. Inventory Confirms Receipt</p>
            <p className="text-sm text-gray-600 mt-1">
              The inventory team confirms that the item has been received,
              recording the received date and any notes about condition or
              discrepancies. The original requester is notified.
            </p>
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-yellow-800">
            <strong>Note:</strong> Email notifications are sent at each step of the
            workflow, keeping all relevant parties informed of the purchase
            request&apos;s progress.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "purchase-queue",
    title: "Purchase Queue (Purchasers)",
    content: (
      <div className="space-y-4">
        <p>
          The Purchase Queue shows approved purchase requests that are waiting to be
          ordered. This view is primarily used by the purchasing team to manage and
          fulfill approved requests.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">
          Viewing the Purchase Queue
        </h4>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>
            In the ticket list, click the <strong>&quot;Purchase Queue&quot;</strong>{" "}
            preset view button
          </li>
          <li>
            The list will filter to show only approved purchase requests that have
            not yet been ordered
          </li>
          <li>
            Click on a purchase request ticket to see the full purchase details in
            the right panel
          </li>
        </ol>

        <h4 className="font-semibold text-text-primary mt-6">
          Marking a Purchase as Ordered
        </h4>
        <p>
          When you have placed the order for a purchase request, record the order
          details:
        </p>
        <ol className="list-decimal list-inside space-y-2 ml-4 mt-3">
          <li>Open the purchase request ticket from the Purchase Queue</li>
          <li>
            In the right panel, click <strong>&quot;Mark as Purchased&quot;</strong>
          </li>
          <li>Fill in the required order details:</li>
        </ol>

        <div className="ml-8 mt-3 space-y-3">
          <p>
            <strong>Vendor Name</strong> (required): The supplier or vendor where the
            order was placed
          </p>
          <p>
            <strong>Order Confirmation Number</strong> (required): The order or
            confirmation number from the vendor
          </p>
          <p>
            <strong>Actual Cost</strong> (required): The actual total cost of the
            order
          </p>
          <p>
            <strong>Expected Delivery Date</strong> (required): When the order is
            expected to arrive
          </p>
          <p>
            <strong>Notes</strong> (optional): Any additional information about the
            order
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-blue-800">
            <strong>Tip:</strong> Once marked as purchased, the inventory team is
            automatically notified via email so they can prepare to receive the order.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "receiving-orders",
    title: "Receiving Orders (Inventory)",
    content: (
      <div className="space-y-4">
        <p>
          The Incoming Orders view shows purchased items that are waiting to be
          received. This view is used by the inventory team to track and confirm
          delivery of ordered items.
        </p>

        <h4 className="font-semibold text-text-primary mt-6">
          Viewing Incoming Orders
        </h4>
        <ol className="list-decimal list-inside space-y-2 ml-4">
          <li>
            In the ticket list, click the <strong>&quot;Incoming Orders&quot;</strong>{" "}
            preset view button
          </li>
          <li>
            The list will filter to show only purchased items that have not yet been
            received
          </li>
          <li>
            Click on a ticket to see the full purchase and order details in the
            right panel
          </li>
        </ol>

        <h4 className="font-semibold text-text-primary mt-6">
          Confirming Receipt of an Order
        </h4>
        <p>
          When an ordered item arrives, confirm its receipt:
        </p>
        <ol className="list-decimal list-inside space-y-2 ml-4 mt-3">
          <li>Open the ticket from the Incoming Orders view</li>
          <li>
            Review the purchase and order details (vendor, confirmation number,
            expected delivery date)
          </li>
          <li>
            Click <strong>&quot;Mark as Received&quot;</strong> in the right panel
          </li>
          <li>Fill in the receipt details:</li>
        </ol>

        <div className="ml-8 mt-3 space-y-3">
          <p>
            <strong>Received Date</strong> (defaults to today): The date the item was
            received
          </p>
          <p>
            <strong>Notes</strong> (optional): Any notes about condition,
            discrepancies, or other observations
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-blue-800">
            <strong>Tip:</strong> Once marked as received, the original requester is
            automatically notified via email that their purchase has arrived.
          </p>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-yellow-800">
            <strong>Note:</strong> Use the Notes field to document any issues with the
            delivery, such as damaged items, incorrect quantities, or other
            discrepancies. This creates a record for follow-up if needed.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: "report-issue",
    title: "Report an Issue",
    content: "REPORT_ISSUE_PLACEHOLDER",
  },
];

function ReportIssueSection() {
  const router = useRouter();
  const errorCount = debugCapture.getErrorCount();

  const handleReportIssue = () => {
    // Log the action
    debugCapture.logAction("Report Issue clicked", "From help page");

    // Get the debug bundle
    const debugText = formatDebugForTicket();

    // Store pre-fill data in sessionStorage
    const preFillData = {
      title: "Help Desk Application Issue",
      description: `Please describe the issue you encountered:\n\n---\n\n${debugText}`,
      category: "Problem",
      priority: "Normal",
      problemType: "Tech",
      problemTypeSub: "HelpDesk",
    };

    sessionStorage.setItem("newTicketPreFill", JSON.stringify(preFillData));

    // Navigate to new ticket page
    router.push("/new");
  };

  return (
    <div className="space-y-4">
      <p>
        Encountered a bug or issue with the Help Desk application itself? Use the
        button below to automatically create a support ticket with diagnostic
        information attached.
      </p>

      <h4 className="font-semibold text-text-primary mt-6">
        What Gets Captured
      </h4>
      <p>
        When you click &quot;Report Issue&quot;, the following diagnostic information is
        automatically included in your ticket:
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li>
          <strong>Console Errors:</strong> JavaScript errors and warnings that
          occurred during your session
        </li>
        <li>
          <strong>Page Information:</strong> Current URL, screen size, and browser
          details
        </li>
        <li>
          <strong>Recent Actions:</strong> Navigation and key actions you took
          before the issue
        </li>
        <li>
          <strong>Network Failures:</strong> Any API requests that failed
        </li>
        <li>
          <strong>Session Duration:</strong> How long you&apos;ve been using the app
        </li>
      </ul>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
        <p className="text-sm text-yellow-800">
          <strong>Privacy Note:</strong> No passwords, personal data, or sensitive
          ticket content is captured. Only technical debugging information is
          included.
        </p>
      </div>

      <h4 className="font-semibold text-text-primary mt-6">
        Current Session Status
      </h4>
      <div className="bg-bg-card border border-border rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-text-secondary">Errors captured this session:</p>
            <p className={`text-2xl font-bold ${errorCount > 0 ? "text-red-600" : "text-green-600"}`}>
              {errorCount}
            </p>
          </div>
          <button
            onClick={handleReportIssue}
            className="px-6 py-3 bg-brand-primary text-white rounded-lg font-medium hover:bg-brand-primary-light transition-colors flex items-center gap-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            Report Issue
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
        <p className="text-sm text-blue-800">
          <strong>Tip:</strong> Before clicking &quot;Report Issue&quot;, try to reproduce
          the problem if possible. This ensures the relevant errors are captured
          in the diagnostic report.
        </p>
      </div>

      <h4 className="font-semibold text-text-primary mt-6">
        What to Include in Your Description
      </h4>
      <p>
        After clicking the button, you&apos;ll be taken to the new ticket form with
        debug information pre-filled. Please also describe:
      </p>
      <ol className="list-decimal list-inside space-y-2 ml-4">
        <li>What you were trying to do when the issue occurred</li>
        <li>What you expected to happen</li>
        <li>What actually happened (error messages, unexpected behavior)</li>
        <li>Whether the issue happens consistently or intermittently</li>
      </ol>
    </div>
  );
}

// Staff Resources section - only shown to admin and support staff
const staffResourcesSection: HelpSection = {
  id: "staff-resources",
  title: "Staff Resources",
  content: (
    <div className="space-y-4">
      <p>
        Documentation and guides for Support Staff and Administrators.
      </p>

      <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
        <p className="text-sm text-green-800">
          <strong>Note:</strong> This section is only visible to Support Staff and Administrators.
        </p>
      </div>

      <h4 className="font-semibold text-text-primary mt-6">
        Support Staff User Guide
      </h4>
      <p>
        Comprehensive guide covering ticket management, workflows, and standard operating procedures for support staff.
      </p>
      <ul className="list-disc list-inside space-y-2 ml-4">
        <li>Standard Operating Procedures (SOP) for ticket handling</li>
        <li>Ticket creation authorization policies</li>
        <li>Request vs. Problem workflow differences</li>
        <li>Project and purchase approval requirements</li>
        <li>Step-by-step instructions with screenshots</li>
      </ul>

      <div className="flex gap-3 mt-4">
        <a
          href="/support-user-guide.html"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-lg hover:bg-brand-primary-dark transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          View Guide
        </a>
        <a
          href="/support-user-guide.html"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 border border-border text-text-primary rounded-lg hover:bg-gray-50 transition-colors"
          onClick={(e) => {
            e.preventDefault();
            const printWindow = window.open('/support-user-guide.html', '_blank');
            if (printWindow) {
              printWindow.onload = () => {
                printWindow.print();
              };
            }
          }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print Guide
        </a>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
        <p className="text-sm text-blue-800">
          <strong>Tip:</strong> The guide is optimized for double-sided printing on 8.5&quot; x 11&quot; paper. Use your browser&apos;s print function or click &quot;Print Guide&quot; above.
        </p>
      </div>
    </div>
  ),
};

export default function HelpPage() {
  const [activeSection, setActiveSection] = useState("getting-started");
  const { permissions, loading } = useRBAC();

  // Build sections list - include staff resources for admin and support roles
  const isStaff = !loading && (permissions.role === "admin" || permissions.role === "support");
  const allSections = isStaff ? [...helpSections, staffResourcesSection] : helpSections;

  return (
    <div className="min-h-screen flex flex-col bg-bg-subtle">
      {/* Header */}
      <header className="bg-bg-card border-b border-border px-6 py-3 flex items-center justify-between">
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
        <aside className="w-64 border-r border-border bg-bg-card overflow-y-auto">
          <nav className="p-4">
            <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-3">
              Topics
            </h2>
            <ul className="space-y-1">
              {allSections.map((section) => (
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
            {allSections.map((section) => (
              <div
                key={section.id}
                className={activeSection === section.id ? "block" : "hidden"}
              >
                <h2 className="text-2xl font-bold text-text-primary mb-6">
                  {section.title}
                </h2>
                <div className="prose prose-slate max-w-none text-text-primary">
                  {section.id === "report-issue" ? (
                    <ReportIssueSection />
                  ) : (
                    section.content
                  )}
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
