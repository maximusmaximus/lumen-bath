import { create } from "zustand";
import type { PeerInfo } from "@/lib/multiplayer";
import { cleanCastCode, makeCastCode, roomForCode, type CastRole } from "@/lib/cast/protocol";

type CastSession = {
  open: boolean;
  room: string | null;
  code: string | null;
  host: boolean;
  role: CastRole | null;
  peers: PeerInfo[];
  linked: boolean;
  setOpen: (open: boolean) => void;
  setRole: (role: CastRole | null) => void;
  setPeers: (peers: PeerInfo[]) => void;
  setLinked: (linked: boolean) => void;
  hostCast: () => void;
  join: (raw: string) => void;
  stop: () => void;
  adoptUrl: (raw: string | undefined) => void;
};

export const useCast = create<CastSession>((set, get) => ({
  open: false,
  room: null,
  code: null,
  host: false,
  role: null,
  peers: [],
  linked: false,
  setOpen: (open) => set({ open }),
  setRole: (role) => set({ role }),
  setPeers: (peers) => set({ peers }),
  setLinked: (linked) => set({ linked }),
  hostCast: () => {
    if (get().room && get().host) {
      set({ open: true });
      return;
    }
    const code = makeCastCode();
    set({ open: true, host: true, code, room: roomForCode(code), role: null, peers: [], linked: false });
  },
  join: (raw) => {
    const code = cleanCastCode(raw);
    if (!code) return;
    set({ open: true, host: false, code, room: roomForCode(code), role: null, peers: [], linked: false });
  },
  stop: () => set({ open: false, room: null, code: null, host: false, role: null, peers: [], linked: false }),
  adoptUrl: (raw) => {
    if (!raw || get().room) return;
    const code = cleanCastCode(raw);
    if (!code) return;
    set({ open: true, host: false, code, room: roomForCode(code), linked: false });
  },
}));
