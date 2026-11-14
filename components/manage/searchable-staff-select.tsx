"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronsUpDown, Search } from "lucide-react";

export type SearchableStaffOption = {
  id: string;
  label: string;
  /** 額外可搜尋文字（證號、職稱等） */
  keywords?: string;
};

type Props = {
  value: string;
  options: SearchableStaffOption[];
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  emptyText?: string;
  name?: string;
  className?: string;
};

function matchesQuery(option: SearchableStaffOption, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${option.label} ${option.keywords || ""} ${option.id}`.toLowerCase();
  return hay.includes(q);
}

export function SearchableStaffSelect({
  value,
  options,
  onChange,
  placeholder = "— 請選擇 —",
  disabled = false,
  emptyText = "找不到符合的人員",
  name,
  className = "",
}: Props) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () => options.find((item) => item.id === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(
    () => options.filter((item) => matchesQuery(item, query)),
    [options, query],
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  return (
    <div ref={rootRef} className={`relative mt-1 ${className}`}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className="flex w-full items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-left text-sm disabled:opacity-50"
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
          setQuery("");
        }}
      >
        <span className={selected ? "truncate text-foreground" : "truncate text-muted-foreground"}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open && !disabled ? (
        <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-md border bg-card shadow-md">
          <div className="flex items-center gap-2 border-b px-2 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              className="w-full bg-transparent py-1 text-sm outline-none"
              placeholder="輸入姓氏或姓名搜尋…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && filtered[0]) {
                  event.preventDefault();
                  onChange(filtered[0].id);
                  setOpen(false);
                  setQuery("");
                }
              }}
            />
          </div>
          <div id={listId} role="listbox" className="max-h-52 overflow-auto">
            <button
              type="button"
              role="option"
              className="w-full border-b px-3 py-2 text-left text-sm text-muted-foreground hover:bg-secondary/60"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange("");
                setOpen(false);
                setQuery("");
              }}
            >
              {placeholder}
            </button>
            {filtered.map((item) => {
              const active = item.id === value;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`w-full border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-secondary/60 ${
                    active ? "bg-primary/10 font-medium" : ""
                  }`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(item.id);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  {item.label}
                </button>
              );
            })}
            {!filtered.length ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">{emptyText}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
