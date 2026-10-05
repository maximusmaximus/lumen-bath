import { randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generatePairingCode(): string {
  const bytes = randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return code;
}

export function generateAgentToken(): string {
  return `lmn_agt_${randomBytes(24).toString("hex")}`;
}

export async function createPairingSession(userId: string): Promise<{ code: string; expiresAt: Date }> {
  const { getSql } = await import("../db.ts");
  const sql = await getSql();
  const code = generatePairingCode();
  const agentToken = generateAgentToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  await sql`
    insert into agent_pairings (code, user_id, agent_token, created_at, expires_at)
    values (${code}, ${userId}, ${agentToken}, now(), ${expiresAt.toISOString()})
  `;

  return { code, expiresAt };
}

export async function claimPairingCode(codeRaw: string): Promise<{
  ok: boolean;
  agentToken?: string;
  userId?: string;
  username?: string;
  error?: string;
}> {
  const code = codeRaw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 6) {
    return { ok: false, error: "Invalid pairing code format. Expected 6 alphanumeric characters." };
  }

  const { getSql } = await import("../db.ts");
  const sql = await getSql();
  const rows = await sql<{
    code: string;
    user_id: string;
    agent_token: string;
    expires_at: string;
    claimed_at: string | null;
  }>`
    select code, user_id, agent_token, expires_at, claimed_at
    from agent_pairings
    where code = ${code}
  `;

  const pairing = rows[0];
  if (!pairing) {
    return { ok: false, error: "Pairing code not found or invalid." };
  }

  if (new Date(pairing.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "Pairing code has expired. Please generate a new code in your profile." };
  }

  if (pairing.claimed_at) {
    return { ok: false, error: "Pairing code has already been claimed." };
  }

  await sql`
    update agent_pairings
    set claimed_at = now()
    where code = ${code}
  `;

  // Fetch username from profiles if available
  const profileRows = await sql<{ username: string }>`
    select username from profiles where user_id = ${pairing.user_id}
  `;
  const username = profileRows[0]?.username ?? "listener";

  return {
    ok: true,
    agentToken: pairing.agent_token,
    userId: pairing.user_id,
    username,
  };
}

export async function resolveUserFromAgentToken(agentToken: string): Promise<{ userId: string; username: string } | null> {
  if (!agentToken || !agentToken.startsWith("lmn_agt_")) return null;

  const { getSql } = await import("../db.ts");
  const sql = await getSql();
  const rows = await sql<{ user_id: string }>`
    select user_id from agent_pairings where agent_token = ${agentToken}
  `;

  const match = rows[0];
  if (!match) return null;

  const profileRows = await sql<{ username: string }>`
    select username from profiles where user_id = ${match.user_id}
  `;
  const username = profileRows[0]?.username ?? "listener";

  return { userId: match.user_id, username };
}
