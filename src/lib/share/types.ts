import type { Ear, Receiver, Settings } from "@/lib/audio/types";
import type { CommunityBowl } from "@/lib/community/types";

export type ShareView = {
  kind: "preset" | "track";
  id: string | null;
  userSlug: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  settings: Settings;
  receiver: Receiver;
  bowls: CommunityBowl[];
  ears: Ear[];
  presetId: string | null;
};
