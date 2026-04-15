import type { Station } from "../types";
import { Star } from "lucide-react";

type Props = {
  station: Station;
  active: boolean;
  isFavorite: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
};

export function StationCard({
  station,
  active,
  isFavorite,
  onSelect,
  onToggleFavorite,
}: Props) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      }}
      className={[
        "w-full flex items-center justify-between p-4 rounded-2xl border transition select-none cursor-pointer",
        "hover:shadow-sm",
        active
          ? "border-white/20 bg-white/10 text-white"
          : "border-white/10 bg-white/5 text-slate-100 hover:bg-white/10 hover:border-white/20",
      ].join(" ")}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Logo */}
        <div
          className={[
            "w-12 h-12 rounded-2xl border flex items-center justify-center overflow-hidden shrink-0",
            active
              ? "border-white/20 bg-white/10"
              : "border-white/10 bg-white/5",
          ].join(" ")}
        >
          {station.coverUrl ? (
            <img
              src={station.coverUrl}
              alt={`${station.name} logo`}
              className="w-full h-full object-contain"
              loading="lazy"
            />
          ) : (
            <div className="text-xs text-white/60">—</div>
          )}
        </div>

        {/* Text */}
        <div className="min-w-0">
          <div className="font-semibold truncate">{station.name}</div>
          <div
            className={[
              "text-sm truncate",
              active ? "text-slate-200" : "text-slate-300",
            ].join(" ")}
          >
            {station.country}
            {station.tags?.length ? ` • ${station.tags.join(", ")}` : ""}
          </div>
        </div>
      </div>

      {/* Favorite */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        className={[
          "ml-3 p-2 rounded-xl transition",
          "hover:bg-white/10",
          isFavorite
            ? "text-amber-400"
            : active
              ? "text-white/80"
              : "text-white/60",
        ].join(" ")}
        title={isFavorite ? "Remove from favorites" : "Add to favorites"}
        aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      >
        <Star size={18} fill={isFavorite ? "currentColor" : "none"} />
      </button>
    </div>
  );
}
