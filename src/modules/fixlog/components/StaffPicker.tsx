"use client";

import { useEffect, useRef, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { getGraphClient, searchUsers } from "@/shared/graph";

export interface StationStaff {
  name: string;
  email?: string; // set only when picked from the directory
}

// "Who was working the station": directory search, but a typed name is kept as-is
// because seasonal staff often have no Microsoft account.
export default function StaffPicker({
  value,
  onChange,
}: {
  value: StationStaff | null;
  onChange: (v: StationStaff | null) => void;
}) {
  const { instance, accounts } = useMsal();
  const [text, setText] = useState(value?.name || "");
  const [results, setResults] = useState<{ displayName: string; email: string }[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // Keep the box in step when the parent resets/loads the value.
  useEffect(() => {
    setText(value?.name || "");
  }, [value?.name]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function handleType(v: string) {
    setText(v);
    // Typing replaces any directory pick: a free-text name carries no email.
    onChange(v.trim() ? { name: v } : null);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2 || !accounts[0]) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const users = await searchUsers(getGraphClient(instance, accounts[0]), v.trim(), 8);
        setResults(users.map((u) => ({ displayName: u.displayName, email: u.email })));
        setOpen(true);
      } catch {
        setResults([]);
      }
    }, 300);
  }

  return (
    <div ref={box} className="relative">
      <input
        type="text"
        value={text}
        onChange={(e) => handleType(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        placeholder="Name of the person at the station"
        autoComplete="off"
        className="w-full px-3 py-2 border border-border rounded-lg bg-bg-card text-text-primary text-base sm:text-sm"
      />
      {value?.email && (
        <p className="mt-1 text-xs text-text-secondary">{value.email}</p>
      )}
      {open && results.length > 0 && (
        <ul className="absolute z-40 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-border bg-bg-card shadow-lg">
          {results.map((u) => (
            <li key={u.email || u.displayName}>
              <button
                type="button"
                onClick={() => {
                  onChange({ name: u.displayName, email: u.email || undefined });
                  setText(u.displayName);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-bg-subtle"
              >
                <span className="block text-sm text-text-primary">{u.displayName}</span>
                {u.email && <span className="block text-xs text-text-secondary">{u.email}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
