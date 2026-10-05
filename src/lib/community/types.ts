import type { GongId } from "@/lib/audio/gong";
import type { Ear, GlassId, Receiver, Settings } from "@/lib/audio/types";

export type CommunityBowl = {
  frequency: number;
  size: number;
  height: number;
  glass: GlassId;
  gain: number;
  x: number;
  y: number;
  sing: number;
  muted: boolean;
  gong?: GongId;
};

export type TemplateKind = "track" | "daily" | "consensus";

export type CommunityCard = {
  id: string;
  title: string;
  description: string;
  plays: number;
  shares: number;
  kind: TemplateKind;
  author: string;
  bowls: number;
  createdAt: string;
  similarity?: number;
  sharePath: string | null;
  /** Same picture as the link preview. Null until the bath has a public slug. */
  image: string | null;
  /** True when the signed-in listener saved this bath. Never includes an email. */
  mine?: boolean;
};

export type CommunityTemplate = {
  id: string;
  title: string;
  description: string;
  plays: number;
  shares: number;
  kind: TemplateKind;
  day: string | null;
  parentId: string | null;
  parentTitle: string | null;
  author: string;
  createdAt: string;
  settings: Settings;
  receiver: Receiver;
  bowls: CommunityBowl[];
  ears: Ear[];
  userSlug: string | null;
  slug: string | null;
};

export type CommunityComment = {
  id: string;
  templateId: string;
  userId: string;
  author: string;
  body: string;
  createdAt: string;
};

export type PresetStat = {
  id: string;
  plays: number;
  saves: number;
  stemSaves: number;
  ups: number;
  downs: number;
};

export type Profile = {
  username: string;
  bio: string;
  website: string;
};

export type DashboardData = {
  profile: Profile | null;
  stats: { tracks: number; plays: number; shares: number };
  templates: CommunityCard[];
  daily: CommunityCard | null;
  latest: CommunityCard | null;
};
