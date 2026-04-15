export type NowPlaying = {
  raw: string;            // "Artist - Track" sau orice trimite streamul
  artist?: string;
  title?: string;
  stationName?: string;
  at: number;             // Date.now()
};

function parseArtistTitle(s: string) {
  const x = (s || "").trim();
  // multe trimit "Artist - Title"
  const parts = x.split(" - ");
  if (parts.length >= 2) {
    const artist = parts.shift()!.trim();
    const title = parts.join(" - ").trim();
    return { artist, title };
  }
  return { title: x };
}

/**
 * Încearcă să citească ICY metadata din stream (best-effort).
 * - cere "Icy-MetaData: 1"
 * - citește header "icy-metaint"
 * - parcurge streamul până prinde un metadatas block cu StreamTitle
 *
 * Limitări:
 * - trebuie CORS permis pe stream
 * - unele stream-uri nu au metadata
 */
export async function readIcyNowPlayingOnce(
  url: string,
  signal?: AbortSignal,
): Promise<NowPlaying | null> {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      mode: "cors",
      cache: "no-store",
      signal: ctrl.signal,
      headers: {
        // cerem explicit metadata
        "Icy-MetaData": "1",
      },
    });

    // dacă CORS/stream nu permite, res poate fi blocked / headers inaccesibile
    const metaintStr = res.headers.get("icy-metaint");
    const metaint = metaintStr ? parseInt(metaintStr, 10) : 0;
    if (!metaint || !Number.isFinite(metaint) || metaint <= 0) return null;

    const reader = res.body?.getReader();
    if (!reader) return null;

    let bytesUntilMeta = metaint;
    const decoder = new TextDecoder("utf-8");

    // citim max ~1MB ca să nu ținem conexiune mult
    let totalRead = 0;
    const MAX_READ = 1_000_000;

    while (totalRead < MAX_READ) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      totalRead += value.byteLength;

      let offset = 0;

      while (offset < value.byteLength) {
        if (bytesUntilMeta > 0) {
          const take = Math.min(bytesUntilMeta, value.byteLength - offset);
          offset += take;
          bytesUntilMeta -= take;
          continue;
        }

        // urmează 1 byte length (len * 16)
        const lenByte = value[offset];
        offset += 1;
        const metaLen = lenByte * 16;

        if (metaLen === 0) {
          bytesUntilMeta = metaint;
          continue;
        }

        // dacă nu avem suficient în chunk, mai citim
        let metaBytes = value.subarray(offset, offset + metaLen);
        if (metaBytes.byteLength < metaLen) {
          // colectăm restul
          const chunks: Uint8Array[] = [metaBytes];
          let remaining = metaLen - metaBytes.byteLength;

          while (remaining > 0) {
            const nxt = await reader.read();
            if (nxt.done || !nxt.value) break;
            totalRead += nxt.value.byteLength;

            const take = Math.min(remaining, nxt.value.byteLength);
            chunks.push(nxt.value.subarray(0, take));
            remaining -= take;

            // dacă am “mâncat” doar parte din nxt.value, restul e pierdut – ok pt best-effort
            // (dacă vrei full corect, facem buffer ring; dar pt now playing e ok)
          }

          const merged = new Uint8Array(chunks.reduce((a, c) => a + c.byteLength, 0));
          let p = 0;
          for (const c of chunks) {
            merged.set(c, p);
            p += c.byteLength;
          }
          metaBytes = merged;
          offset += metaBytes.byteLength; // aprox
        } else {
          offset += metaLen;
        }

        const metaStr = decoder.decode(metaBytes).replace(/\0/g, "");
        // format tipic: StreamTitle='Artist - Track';StreamUrl='';
        const m = /StreamTitle='([^']*)'/.exec(metaStr);
        if (m && m[1]) {
          const raw = m[1].trim();
          if (!raw) {
            bytesUntilMeta = metaint;
            continue;
          }
          const parsed = parseArtistTitle(raw);
          return {
            raw,
            ...parsed,
            at: Date.now(),
          };
        }

        bytesUntilMeta = metaint;
      }
    }

    return null;
  } catch {
    return null;
  } finally {
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}
