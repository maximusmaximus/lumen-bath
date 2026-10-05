import { useEffect, useRef, useState } from "react";
import { setChamberStage } from "@/components/chamber";
import { bathEngine } from "@/lib/audio/engine";
import { castBus, isBye, isHello, isRecord, isSnap, isTouch, resolveRole, type CastMsg, type CastRole, type CastSnap } from "@/lib/cast/protocol";
import { isGong } from "@/lib/audio/gong";
import { useCast } from "@/lib/cast/session";
import { soundscapeTitle, useBath } from "@/stores/bath";
import { useP2PRoom } from "@/lib/multiplayer";

function snapFrom(waves: boolean): CastSnap {
  const state = useBath.getState();
  return {
    kind: "snap",
    waves,
    playing: state.playing,
    bowls: state.bowls,
    settings: state.settings,
    ears: state.ears,
    receiver: state.receiver,
    activeEarId: state.activeEarId,
    selectedId: state.selectedId,
    focus: state.focus,
    selection: state.selection,
    presetId: state.presetId,
    originPresetId: state.originPresetId,
    activeName: state.activeName,
    previewEarId: state.previewEarId,
    cycleThrough: state.cycleThrough,
    cycleSeconds: state.cycleSeconds,
    domes: state.domes,
  };
}

async function hearStage(): Promise<boolean> {
  const state = useBath.getState();
  if (bathEngine.isRunning() && bathEngine.contextState() === "running") return true;
  await bathEngine.startFromGesture(state.bowls, state.settings, soundscapeTitle(state), state.receiver, state.ears, state.activeEarId, state.domes);
  const audible = bathEngine.isRunning() && bathEngine.contextState() === "running";
  if (audible) useBath.getState().setPlaying(true);
  return audible;
}

export function CastLink({ room, host, waves, onWaves }: { room: string; host: boolean; waves: boolean; onWaves: (open: boolean) => void }) {
  const p2p = useP2PRoom({ room, name: host ? "host" : "join" });
  const wavesRef = useRef(waves);
  const roleRef = useRef<CastRole | null>(null);
  const hostRef = useRef(host);
  const lastSnap = useRef("");
  const lastRimPost = useRef(0);
  const [role, setRole] = useState<CastRole | null>(null);
  wavesRef.current = waves;
  roleRef.current = role;
  hostRef.current = host;

  function publish(msg: CastMsg, reliable = true) {
    const liveRim = msg.kind === "touch" && msg.mode === "rim";
    const now = Date.now();
    if (!liveRim || now - lastRimPost.current > 120) {
      if (liveRim) lastRimPost.current = now;
      void fetch("/api/cast", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ room, from: p2p.selfId, kind: msg.kind, payload: msg }),
      }).catch(() => undefined);
    }
    if (reliable) p2p.send(msg);
    else p2p.broadcast(msg);
  }

  async function accept(data: unknown) {
    if (isBye(data)) {
      useCast.getState().stop();
      return;
    }
    if (isHello(data)) {
      const next = resolveRole({ w: window.innerWidth, h: window.innerHeight, host: hostRef.current }, data);
      roleRef.current = next;
      setRole(next);
      useCast.getState().setLinked(true);
      if (next === "control") publish(snapFrom(wavesRef.current), false);
      return;
    }
    if (roleRef.current !== "display") return;
    if (isTouch(data)) {
      const ok = await hearStage();
      if (!ok) return;
      if (data.mode === "gong" && isGong(data.mallet)) bathEngine.gong(data.bowlId, data.mallet);
      else bathEngine.rim(data.bowlId, data.mode === "rim" ? (data.amount ?? 0) : 0);
      return;
    }
    if (isSnap(data)) {
      const key = JSON.stringify(data);
      if (key === lastSnap.current) return;
      lastSnap.current = key;
      useBath.getState().applyCast(data);
      onWaves(data.waves);
      return;
    }
    if (!isRecord(data)) return;
    if (data.on) {
      const ok = await hearStage();
      if (ok && !bathEngine.isRecording()) await bathEngine.startRecording();
      return;
    }
    if (bathEngine.isRecording()) bathEngine.stopRecording();
  }

  const acceptRef = useRef(accept);
  acceptRef.current = accept;
  const publishRef = useRef(publish);
  publishRef.current = publish;

  useEffect(() => {
    useCast.getState().setPeers(p2p.peers);
  }, [p2p.peers]);

  useEffect(() => {
    useCast.getState().setRole(role);
    castBus.role = role;
    setChamberStage(role === "display");
  }, [role]);

  useEffect(() => {
    return () => {
      castBus.role = null;
      castBus.send = null;
      setChamberStage(false);
      useCast.getState().setRole(null);
    };
  }, []);

  useEffect(() => {
    castBus.send = (msg: CastMsg, reliable = true) => publishRef.current(msg, reliable);
    return () => {
      castBus.send = null;
    };
  }, []);

  useEffect(() => {
    const hello = () => {
      publishRef.current({ kind: "hello", w: window.innerWidth, h: window.innerHeight, host: hostRef.current });
    };
    hello();
    const timer = window.setInterval(hello, 1200);
    window.addEventListener("resize", hello);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("resize", hello);
    };
  }, []);

  useEffect(() => {
    if (p2p.peers.some((peer) => peer.connectionState === "connected")) {
      publishRef.current({ kind: "hello", w: window.innerWidth, h: window.innerHeight, host: hostRef.current });
    }
  }, [p2p.peers, host]);

  useEffect(() => {
    return p2p.onMessage((_from, data) => {
      void acceptRef.current(data);
    });
  }, [p2p.onMessage]);

  useEffect(() => {
    let since = 0;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const res = await fetch(`/api/cast?room=${encodeURIComponent(room)}&peer=${encodeURIComponent(p2p.selfId)}&since=${since}`);
        if (!res.ok || stop) return;
        const body = (await res.json()) as { events?: { id: number; payload: unknown }[] };
        for (const event of body.events ?? []) {
          since = Math.max(since, event.id);
          if (stop) return;
          await acceptRef.current(event.payload);
        }
      } catch {
        /* the next poll retries */
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 280);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [room, p2p.selfId]);

  useEffect(() => {
    if (role !== "control") return;
    let timer = 0;
    let pending = false;
    const flush = () => {
      pending = false;
      publishRef.current(snapFrom(wavesRef.current), false);
    };
    const schedule = () => {
      if (pending) return;
      pending = true;
      timer = window.setTimeout(flush, 80);
    };
    const unsub = useBath.subscribe(schedule);
    schedule();
    return () => {
      unsub();
      window.clearTimeout(timer);
    };
  }, [role, waves]);

  const playing = useBath((state) => state.playing);
  useEffect(() => {
    if (role !== "display") return;
    if (playing) {
      void hearStage();
      return;
    }
    if (bathEngine.isRunning()) bathEngine.stop();
  }, [role, playing]);

  return null;
}
