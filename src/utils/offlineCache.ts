import { storage } from "./storage";

export type StationMeta = {
  id: string;
  name: string;
  country?: string;
  tags?: string[];
  coverUrl?: string;
};

const CACHE_NAME = "soundsprint-meta-v1";
const META_KEY = "stationsMeta";
const META_VERSION_KEY = "stationsMetaVersion";
const META_VERSION = 1;

function toAbs(u?: string) {
  if (!u) return undefined;
  try {
    return new URL(u, window.location.origin).toString();
  } catch {
    return undefined;
  }
}

export function saveStationsMeta(stations: StationMeta[]) {
  storage.set(META_KEY, stations);
  storage.set(META_VERSION_KEY, META_VERSION);
}

export function loadStationsMeta(): StationMeta[] {
  const v = storage.get<number>(META_VERSION_KEY, 0);
  if (v !== META_VERSION) return [];
  return storage.get<StationMeta[]>(META_KEY, []);
}

export async function cacheCoverUrls(urls: string[]) {
  if (!("caches" in window)) return;

  const abs = urls.map(toAbs).filter(Boolean) as string[];

  const unique = Array.from(new Set(abs));

  if (!unique.length) return;

  try {
    const cache = await caches.open(CACHE_NAME);

    await Promise.all(
      unique.map(async (u) => {
        try {
          const existing = await cache.match(u);
          if (existing) return;

          const res = await fetch(u, { mode: "cors", cache: "force-cache" });
          if (!res.ok) return;

          await cache.put(u, res.clone());
        } catch {}
      }),
    );
  } catch {}
}

export async function warmOfflineStationCache(opts: {
  stations: StationMeta[];
  selectedId: string;
  recentIds: string[];
  favoriteIds: string[];
  extraCoverUrls?: string[];
}) {
  saveStationsMeta(opts.stations);

  const idSet = new Set<string>([
    opts.selectedId,
    ...opts.recentIds,
    ...opts.favoriteIds,
  ]);

  const covers: string[] = [];
  for (const s of opts.stations) {
    if (!idSet.has(s.id)) continue;
    if (s.coverUrl) covers.push(s.coverUrl);
  }

  if (opts.extraCoverUrls?.length) covers.push(...opts.extraCoverUrls);

  await cacheCoverUrls(covers);
}
