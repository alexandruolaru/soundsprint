export type Station = {
  id: string;
  name: string;
  streamUrl: string;
  tags?: string[];
  country?: string;
  coverUrl?: string;
  category?: "hits" | "rock" | "news" | "chill" | "dance" | "culture" | "classical" | "urban"  | "oldies" | "manele";
  language?: "RO" | "EN";
};

export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";

export type StreamInfo = {
  formatLabel: string;   
  mime?: string;         
  bitrateKbps?: number | null; 
};
