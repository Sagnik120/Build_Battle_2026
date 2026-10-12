"use client";

import { useQuery } from "@tanstack/react-query";
import { subDays } from "date-fns";
import { CalendarIcon, CheckIcon, ChevronDownIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFilters } from "@/hooks/use-filters";
import { api } from "@/lib/api";
import { SENTIMENT_META, SENTIMENT_ORDER } from "@/lib/constants";
import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Option {
  value: string;
  label: string;
  count?: number;
  group?: string;
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  searchable = false,
}: {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  searchable?: boolean;
}) {
  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  const groups = [...new Set(options.map((o) => o.group ?? ""))];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-8 gap-1.5 rounded-full", selected.length > 0 && "border-foreground/40")}>
          {label}
          {selected.length > 0 && (
            <span className="tabular rounded-full bg-foreground px-1.5 text-[10px] leading-4 font-semibold text-background">{selected.length}</span>
          )}
          <ChevronDownIcon className="size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <Command>
          {searchable && <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />}
          <CommandList className="max-h-72">
            <CommandEmpty>No matches.</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group} heading={group || undefined}>
                {options
                  .filter((o) => (o.group ?? "") === group)
                  .map((option) => {
                    const active = selected.includes(option.value);
                    return (
                      <CommandItem key={option.value} value={`${option.label} ${option.value}`} onSelect={() => toggle(option.value)}>
                        <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", active && "border-foreground bg-foreground text-background")}>
                          {active && <CheckIcon className="size-3" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                        {option.count !== undefined && <span className="tabular text-xs text-muted-foreground">{formatNumber(option.count)}</span>}
                      </CommandItem>
                    );
                  })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const PRESETS = [
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

function DateRange({ min, max }: { min: string | null; max: string | null }) {
  const { filters, setFilters } = useFilters();
  const active = Boolean(filters.date_from || filters.date_to);
  const label = active
    ? `${filters.date_from ? formatDate(filters.date_from, "d MMM") : "Start"} – ${filters.date_to ? formatDate(filters.date_to, "d MMM yy") : "now"}`
    : "All time";
  const anchor = max ? new Date(max) : new Date();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-8 gap-1.5 rounded-full", active && "border-foreground/40")}>
          <CalendarIcon className="size-3.5 text-muted-foreground" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <Button variant={active ? "outline" : "default"} size="sm" className="h-7 rounded-full" onClick={() => setFilters({ date_from: null, date_to: null })}>
            All time
          </Button>
          {PRESETS.map((preset) => (
            <Button
              key={preset.days}
              variant="outline"
              size="sm"
              className="h-7 rounded-full"
              onClick={() => setFilters({ date_from: subDays(anchor, preset.days - 1).toISOString().slice(0, 10), date_to: null })}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1 text-xs text-muted-foreground">
            From
            <Input type="date" className="h-8" min={min ?? undefined} max={max ?? undefined} value={filters.date_from ?? ""} onChange={(e) => setFilters({ date_from: e.target.value || null })} />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">
            To
            <Input type="date" className="h-8" min={min ?? undefined} max={max ?? undefined} value={filters.date_to ?? ""} onChange={(e) => setFilters({ date_to: e.target.value || null })} />
          </label>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** One filter row above the content; state lives in the URL. */
export function FilterBar({ children }: { children?: React.ReactNode }) {
  const { filters, setFilters, clear, activeCount } = useFilters();
  const { data: facets } = useQuery({ queryKey: ["facets"], queryFn: api.facets, staleTime: 60_000 });

  return (
    <div className="no-print mb-5 flex flex-wrap items-center gap-2">
      <DateRange min={facets?.date_min ?? null} max={facets?.date_max ?? null} />
      <MultiSelect
        label="Category"
        selected={filters.category}
        onChange={(category) => setFilters({ category })}
        options={(facets?.categories ?? []).map((c) => ({ value: c.value, label: c.value, count: c.count }))}
      />
      <MultiSelect
        label="Sentiment"
        selected={filters.sentiment}
        onChange={(sentiment) => setFilters({ sentiment })}
        options={SENTIMENT_ORDER.map((s) => ({ value: s, label: SENTIMENT_META[s].label }))}
      />
      <MultiSelect
        label="Theme"
        searchable
        selected={filters.theme.map(String)}
        onChange={(theme) => setFilters({ theme: theme.map(Number) })}
        options={(facets?.themes ?? []).map((t) => ({
          value: String(t.id),
          label: t.label,
          count: t.count,
          group: t.polarity === "praise" ? "What customers like" : t.kind === "known" ? "Issues" : "Emerging",
        }))}
      />
      {(facets?.sources.length ?? 0) > 1 && (
        <MultiSelect
          label="Source"
          selected={filters.source}
          onChange={(source) => setFilters({ source })}
          options={(facets?.sources ?? []).map((s) => ({ value: s.value, label: s.value, count: s.count }))}
        />
      )}
      <Button
        variant={filters.complaints_only ? "default" : "outline"}
        size="sm"
        className="h-8 rounded-full"
        aria-pressed={filters.complaints_only}
        onClick={() => setFilters({ complaints_only: !filters.complaints_only })}
      >
        Complaints only
      </Button>
      {activeCount > 0 && (
        <Button variant="ghost" size="sm" className="h-8 gap-1 rounded-full text-muted-foreground" onClick={clear}>
          <XIcon className="size-3.5" />
          Clear
        </Button>
      )}
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  );
}

// InsightFlow build iteration: commit 248
