---
name: lumen-bath
description: Natural language crystal singing-bowl sound bath generation, user profile pairing, and x402 audio export service.
---

# Lumen Bath Agent Skill & MCP Reference

This skill equips AI agents to interact with **Lumen Bath**, an acoustic crystal singing-bowl studio. Agents can compose sound baths using natural language without placing coordinates manually, pair with user accounts via their profile dashboard, manage saved templates, and use the **x402 payment protocol** to download studio-master audio tracks (MP3 and FLAC with spatial stems) on an hourly rate basis.

---

## 1. Natural Language Scene Generation

Users do not need to position bowls or horns by hand. Agents use `lumen_generate_scene` to translate high-level mood, intentions, and harmonic goals into physical room acoustic arrangements.

### Acoustic Elements
- **Crystal Singing Bowls (3 to 20):**
  - **Glass Materials:** `quartz` (pure sine), `frosted` (even partials), `gold` (warm octave), `platinum` (bright odd partials), `rose` (intimate rounded 2nd harmonic), `obsidian` (dark foundation), `aqua` (airy halo), `emerald` (lush balance), `phantom` (inclusions), `selenite` (ethereal whisper).
  - **Frequencies:** 48 Hz to 960 Hz.
  - **Mallets:** `felt`, `wood`, `leather`, `rubber`, `crystal`.
- **Rooms (15 Shapes):**
  - `rotunda`, `golden`, `shoebox`, `chapel`, `nave`, `cube`, `corridor`, `dome`, `fan`, `cave`, `court`, `gilded`, `octagon`, `apse`, `ellipse`.
  - Configures decay, early reflections, diffusion, absorption, flutter, slap, bloom, and standing wave modes.
- **Listening Horns & Spatial Stems:**
  - Primary listening ear horn (Left/Right horns with yaw aim, pitch tilt, and cone aperture).
  - Up to 7 additional stem horns for multi-track surround recording or cycle-through listening.
- **Overhead Return Domes (Up to 4):**
  - Face-down suspended shells that catch rising waves and return them downward with height delay, cavity frequency resonance, and dispersion.
- **Breathing Loop Modes:**
  - `continuous`, `breath` (sinusoidal inhale/exhale swell), `tide` (ocean wave ebb and flow), `mallet` (transient percussive decay), `canon` (staggered phase).
- **Binaural Beats:**
  - Carrier tone (e.g. 108 Hz, 216 Hz, 432 Hz) with binaural beat modulation:
    - Delta (0.5 – 3 Hz): Deep sleep and release.
    - Theta (4 – 7 Hz): Deep meditation and hypnagogic vision.
    - Alpha (8 – 12 Hz): Calm relaxed focus.
    - Schumann Resonance (7.83 Hz): Earth resonance.

### Layout Geometries
- `circle`: Concentric ring around the listener horns.
- `spiral`: Golden-ratio logarithmic spiral.
- `front_arc`: Orchestral crescent focused toward the listener horns.
- `stereo_antiphonal`: Left vs. Right alternating complementary harmonic pairs.
- `sanctuary`: Four corner quadrants with central grounding bowls.

### Harmonic Tuning Presets
- `chakra`: 7 chakra bowls (194.18Hz Root to 486Hz Crown).
- `solfeggio`: Ancient solfeggio series (174, 285, 396, 417, 528, 639, 741, 852, 963 Hz).
- `planetary`: Orbital frequencies (Earth Om 136.1Hz, Sun 126.22Hz, Moon 210.42Hz).
- `fifths`: Pythagorean pure 3:2 fifths.
- `deep_drone`: Grounding sub-bass obsidian and gold bowls (64Hz - 160Hz).
- `angelic`: High-octave platinum and selenite shimmer (432Hz - 864Hz).

---

## 2. User Profile Pairing Workflow

Agents can pair with a human listener's web account:
1. The user logs into Lumen Bath and opens the **Dashboard** (`/dash`).
2. The user navigates to the **Agent (MCP)** tab and clicks **Generate Pairing Code**.
3. A 6-character code (e.g., `8K2P4W`) valid for 15 minutes is displayed.
4. The agent calls:
   ```json
   {
     "name": "lumen_pair_profile",
     "arguments": { "code": "8K2P4W" }
   }
   ```
5. The agent receives an `agentToken` (`lmn_agt_...`) and links directly to the user's profile.
6. The agent can now create, save (`lumen_save_template`), and load private and community templates under the user's name.

> **Note on Account Linking:** Users can link their normal login account so that any soundscapes their agent creates are saved to their profile and dashboard. However, downloading exported song tracks still requires payment via x402.

---

## 3. x402 Audio Export & Download System

Agents can produce, quote, pay for, and download studio-quality master audio without human manual intervention, using the **x402 (HTTP 402 Payment Required)** protocol.

### Pricing & Specifications
| Format | Hourly Rate | Minute Rate | Bitrate & Specification | Features |
|---|---|---|---|---|
| **MP3** | **$20.00 / hr** | ~$0.33 / min | **320 kbps CBR** stereo (48kHz) | ID3v2 tags, embedded APIC cover art |
| **FLAC** | **$45.00 / hr** | $0.75 / min | **24-bit / 48kHz lossless** studio master | Vorbis comments, embedded PICTURE cover art, optional multi-track spatial stems ZIP |

### Step-by-Step Agent Workflow

#### 1. Browse Available Tracks & Presets
Call `lumen_list_templates` to view current house presets and community fan creations with acoustic descriptions, bowl counts, and duration choices.

#### 2. Add to Cart & Get Quote
Call `lumen_export_quote_cart`:
```json
{
  "format": "flac",
  "durationMinutes": 60,
  "includeStems": true,
  "templateId": "hall-canopy"
}
```
Returns duration-based price quote:
```json
{
  "amountUsd": "45.00",
  "amountCents": 4500,
  "hourlyRate": "$45.00 / hour",
  "bitrateSpec": "FLAC 24-bit / 48kHz lossless master + spatial stem tracks (packaged as ZIP)"
}
```

#### 3. Create x402 Order
Call `lumen_create_x402_order`. The server responds with **HTTP 402 Payment Required**:
```json
{
  "status": 402,
  "orderId": "ord_a1b2c3d4e5f6",
  "pricing": { "amountUsd": "45.00", "amountCents": 4500 },
  "x402": {
    "paymentToken": "x402_tok_...",
    "settleUrl": "/api/export/settle?orderId=ord_a1b2c3d4e5f6"
  }
}
```

#### 4. Settle Payment
The agent settles the payment via the payment token (or payment network proof):
Call `lumen_settle_x402_order`:
```json
{
  "orderId": "ord_a1b2c3d4e5f6",
  "paymentToken": "x402_tok_..."
}
```
The server confirms payment and queues the audio rendering pipeline:
```json
{
  "status": "rendering",
  "etaSeconds": 15,
  "notification": "Payment confirmed. Preparing 60-minute FLAC audio file... Estimated wait: 15 seconds."
}
```

#### 5. Track Progress & ETA Notification
Call `lumen_check_order_status`:
- Informs the agent and user of progress % and estimated remaining wait time.
- When ready, returns `status: "ready"` and `downloadUrl: "/api/export/download?orderId=..."`.

#### 6. Download Track & Stems
Call `lumen_get_download` (or `GET /api/export/download?orderId=...`).
The download includes:
- **Audio Integrity:** Pure 320 kbps MP3 or 24-bit 48kHz lossless FLAC.
- **Embedded Cover Art:** The template's OG snapshot / blueprint artwork embedded as front cover art (`APIC` in MP3, `METADATA_BLOCK_PICTURE` type 3 in FLAC).
- **Complete Metadata:** Title, Artist, Album ("Lumen Bath Master Series"), Year, Genre, Track Number, and acoustic commentary (room shape, bowls, frequency info).
- **Spatial Stems:** When FLAC with stems is selected, a ZIP file is delivered containing:
  - `01_Master_Mix.flac`
  - `02_Ear_1_Main_Horns.flac`
  - `03_Stem_Ear2.flac` ...
  - `cover.png`
  - `metadata.json`

---

## 4. MCP Server Configuration

### Claude Desktop (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "lumen-bath": {
      "command": "node",
      "args": ["C:/Users/maxin/.gemini/antigravity/scratch/lumen-bath/bin/lumen-mcp.mjs"],
      "env": {
        "DATABASE_URL": ""
      }
    }
  }
}
```

### Cursor (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "lumen-bath": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "C:/Users/maxin/.gemini/antigravity/scratch/lumen-bath"
    }
  }
}
```

### HTTP / SSE Access
Agents without local stdio can query the web MCP endpoint directly:
`POST /api/mcp` with standard JSON-RPC 2.0 payloads.
