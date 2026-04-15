import type { Station } from "../types";
import { StationCard } from "./StationCard";
import { Search, SlidersHorizontal, X, Star } from "lucide-react";
import { useMemo, useState, useEffect } from "react";
type Props = {
  stations: Station[];
  selectedId: string;
  favorites: string[];
  onSelect: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  title?: string;
};

export function StationList({
  stations,
  selectedId,
  favorites,
  onSelect,
  onToggleFavorite,
  title = "Stations",
}: Props) {
  const [q, setQ] = useState("");
  const [onlyFav, setOnlyFav] = useState(false);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cat, setCat] = useState<string>("all");
  const [tag, setTag] = useState<string>("all");

  const allCats = useMemo(() => {
    const set = new Set<string>();
    stations.forEach((s) => s.category && set.add(s.category));
    return ["all", ...Array.from(set).sort()];
  }, [stations]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    stations.forEach((s) => (s.tags ?? []).forEach((t) => set.add(t)));
    return ["all", ...Array.from(set).sort()];
  }, [stations]);

  const activeFiltersCount =
    (onlyFav ? 1 : 0) + (cat !== "all" ? 1 : 0) + (tag !== "all" ? 1 : 0);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    return stations.filter((s) => {
      if (onlyFav && !favorites.includes(s.id)) return false;
      if (cat !== "all" && s.category !== cat) return false;
      if (tag !== "all" && !(s.tags ?? []).includes(tag)) return false;

      if (!query) return true;
      const hay =
        `${s.name} ${s.country} ${(s.tags ?? []).join(" ")} ${s.category ?? ""}`.toLowerCase();
      return hay.includes(query);
    });
  }, [stations, favorites, q, onlyFav, cat, tag]);

  const clearFilters = () => {
    setOnlyFav(false);
    setCat("all");
    setTag("all");
  };
const [listOpen, setListOpen] = useState(() => window.innerWidth >= 640);
useEffect(() => {
  const onResize = () => {
    // pe sm+ o ținem deschisă
    if (window.innerWidth >= 640) setListOpen(true);
  };
  window.addEventListener("resize", onResize);
  return () => window.removeEventListener("resize", onResize);
}, []);

 return (
  <div className="p-3 sm:p-4">
    {/* Header */}
    <div className="mb-3 flex items-start sm:items-center justify-between gap-2">
      <div className="min-w-0">
        {title?.trim() ? (
          <h2 className="text-base sm:text-lg font-semibold text-slate-100 truncate">
            {title}
          </h2>
        ) : null}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Favorites toggle */}
        <button
          type="button"
          onClick={() => setOnlyFav((v) => !v)}
          className={[
            "inline-flex items-center justify-center gap-2 rounded-xl border transition",
            "h-10 w-10 sm:h-auto sm:w-auto sm:px-3 sm:py-2",
            onlyFav
              ? "bg-white/15 border-white/20 text-white"
              : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10",
          ].join(" ")}
          title="Favorites"
          aria-label="Favorites"
        >
          <Star
            size={16}
            className={onlyFav ? "text-amber-300" : "text-white/60"}
          />
          <span className="hidden sm:inline text-xs">Fav</span>
        </button>

        {/* Filters button */}
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className="relative inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition h-10 w-10 sm:h-auto sm:w-auto sm:px-3 sm:py-2"
          title="Filters"
          aria-label="Filters"
        >
          <SlidersHorizontal size={16} className="text-white/70" />
          <span className="hidden sm:inline text-xs text-white/80">Filters</span>

          {activeFiltersCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-white/20 border border-white/20 text-white">
              {activeFiltersCount}
            </span>
          )}
        </button>
      </div>
    </div>

    {/* Search */}
    <div className="mb-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
      <Search size={16} className="text-white/60 shrink-0" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search stations…"
        className="w-full bg-transparent outline-none text-sm text-slate-100 placeholder:text-white/35"
      />
      {q && (
        <button
          type="button"
          onClick={() => setQ("")}
          className="p-1 rounded-lg hover:bg-white/10 shrink-0"
          title="Clear"
          aria-label="Clear"
        >
          <X size={16} className="text-white/60" />
        </button>
      )}
    </div>

    {/* Filters panel */}
    {filtersOpen && (
      <div className="mb-3 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Category */}
          <label className="text-xs text-white/70">
            Category
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2 text-sm text-white outline-none"
            >
              {allCats.map((c) => (
                <option key={c} value={c} className="bg-slate-950">
                  {c === "all" ? "All categories" : c}
                </option>
              ))}
            </select>
          </label>

          {/* Tag */}
          <label className="text-xs text-white/70">
            Tag
            <select
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/30 px-3 py-2 text-sm text-white outline-none"
            >
              {allTags.map((t) => (
                <option key={t} value={t} className="bg-slate-950">
                  {t === "all" ? "All tags" : `#${t}`}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs px-3 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white/80 transition"
          >
            Clear
          </button>

          <button
            type="button"
            onClick={() => setFiltersOpen(false)}
            className="text-xs px-3 py-2 rounded-xl border border-white/10 bg-white/10 hover:bg-white/15 text-white transition"
          >
            Done
          </button>
        </div>
      </div>
    )}
{/* Mobile toggle */}
<div className="sm:hidden mb-3">
  <button
    type="button"
    onClick={() => setListOpen((v) => !v)}
    className="w-full inline-flex items-center justify-between px-4 py-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition"
  >
    <span className="text-sm text-white/90 font-medium">Stations</span>
    <span className="text-xs text-white/60">
      {listOpen ? "Hide" : "Show"} ({filtered.length})
    </span>
  </button>
</div>

    {/* List */}
  {/* List */}
{listOpen && (
  <div className="space-y-3 pr-1 overflow-y-auto max-h-[50vh] sm:max-h-[420px]">
    {filtered.map((s) => (
      <StationCard
        key={s.id}
        station={s}
        active={s.id === selectedId}
        isFavorite={favorites.includes(s.id)}
        onSelect={() => {
          onSelect(s.id);
          // pe mobil închide lista după select
          if (window.innerWidth < 640) setListOpen(false);
        }}
        onToggleFavorite={() => onToggleFavorite(s.id)}
      />
    ))}

    {filtered.length === 0 && (
      <div className="text-sm text-white/60 py-6 text-center">
        No stations match your filters.
      </div>
    )}
  </div>
)}

  </div>
);

}
