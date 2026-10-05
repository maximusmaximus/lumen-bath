# Lumen Bath

A crystal singing-bowl studio you walk around. Bowls ring in a room. Hollow horns collect the sound where they stand, including height and aim. Face-down domes send rising waves back down. What you hear is the room, not a stereo mix pasted on top of it.

Headphones make left and right easier to place. A first visit opens a preset or a fan bath at random.

The listener’s manual is [GUIDE.md](GUIDE.md). The same tour lives in the app: the **i** on the canvas, and the **i** beside each control.

## Run it

```bash
npm install
npm run dev
```

The dev server listens on port 8080. With no database configured, the app uses embedded Postgres (PGLite) and still saves baths in that process. Set `DATABASE_URL` to a Neon (or any Postgres) connection string when you want a real database. Migrations run as part of `npm run build`.

```bash
npm test
npm run typecheck
npm run build
```

## Environment

None of these are required to play a bath locally. Set them on the host when you want the matching feature. Do not put keys in source.

| Variable | What it does |
|---|---|
| `DATABASE_URL` | Postgres. Unset uses PGLite. |
| `VENICE_API_KEY` | Weekly preset drafts and feedback review. `VENICE_INFERENCE_KEY` is accepted as an alias. The model is `grok-4-7`. |
| `GITHUB_TOKEN` or `GH_TOKEN` | Issues and draft pull requests from the bug and feature buttons, and the durable copy of saved baths. |
| `GITHUB_LIBRARY_REPO` | `owner/repo` for that copy. Defaults to `maximusmaximus/lumen-bath`. |
| `GITHUB_FEEDBACK_REPO` | `owner/repo` for filed notes. Falls back to the library repo. |

Saved baths, profiles, and weekly notes are mirrored onto the `library` branch so a database reset does not erase them. That branch is data, not the site. Emails and secrets are stripped before the write.

## What a bath is

- **Bowls.** Glass, pitch, size, height, gain, and an optional mallet. Three to twenty. They cannot pass through each other, an ear, or the floor.
- **Ears.** Two hollow horns, Left and Right. The wide mouth faces the sound. A horn gathers the wave that reaches that point, including wall bounces and dome returns. That is the channel you hear.
- **Stems.** Extra ears for recording. You hear the first ear until you promote a stem or Cycle through reaches it. A download keeps each stem as its own left and right. A live stream stays stereo.
- **Domes.** Face-down shells, up to four. A rising wave that meets the opening comes back down. Scale runs up to the hall floor. From outside the shell it stays nearly clear.
- **Rooms.** Fifteen shapes, from Rotunda and Shoebox to Golden hall, Octagon, Apse, and Ellipse. Each shape sets decay, early reflections, flutter, slap, standing waves, air loss, bloom, and envelopment. You can move every one of those after.

## Share a view

**Share** sits at the bottom right of the desktop view. It takes a snapshot of the scene you are looking at, including the camera, waves, and whether playback or Cycle through is on. Name it and sign in. The link is `/s/<your-name>/<title>.html`.

Anyone who opens that link lands on the same arrangement and the same camera. The snapshot is the Open Graph image and the icon on the Fan Created card. Browsers will not start audio by themselves, so a shared bath that was playing starts on the first click.

House presets live under `/s/lumen/<preset-id>.html`.

## Presets and Fan Created

**Presets** and **Fan Created** sit on the second line of the header.

Presets ship with the app, including five dome baths: Hall Canopy, Note Cup, Split Return, Late Ceiling, and Soft Frost. Sort by New, Features, Loved, Played, or Name, or tap a tag. Thumbs at the bottom corners step through them. Move more than one bowl or ear and the thumbs tuck away. The small thumb on the left brings them back.

Fan Created baths are ones people saved. The card shows the author’s username, never an email, and the snapshot as its icon. Change one and save a new bath. A bath you saved can be renamed or updated in place.

## Cast

**Cast** pairs this screen with another by a code or a QR code. The larger screen drops its menus and draws the room in ultra HD when the machine can. The smaller one keeps the controls, including waves, Cycle through, and a pad of every bowl, ear, and stem. Slide around a bowl to rim it. Tap to strike it. Hold to keep one of five mallets for the session. Record on the small screen and both save the file. The large one downloads it without an extra prompt.

## Listening mode

Leave the screen alone. Menus, boxes, and labels fade and the view slowly turns. After three minutes the room, the floor, and the ears fade and only the bowls keep spinning. After thirteen minutes the bowls fade too and only the three-dimensional wave shells remain. Move, click, or press a key and the room comes back.

## Feedback

The bug button and the spark button on the left of the bath open a note. Complete the picture check, then send it. The note is filed as an issue on this repository. Venice reads it. A small, safe change can open a draft pull request for review. It does not merge by itself. Private notes for the owner stay in Dash, under Admin.

## Map

| Path | Role |
|---|---|
| `src/components/chamber.tsx` | The room, bowls, horns, domes, and wave shells. |
| `src/lib/audio/engine.ts` | Web Audio: glass, hall, and the cones that collect it. |
| `src/lib/audio/space.ts` | Positions, horn aim, and what a cone gathers. |
| `src/lib/audio/waves.ts` | Wave fronts, wall bounces, and dome returns. |
| `src/lib/audio/dome.ts` | Shell size, up to the hall, and the ceiling bounce. |
| `src/lib/audio/presets.ts` | House presets, including the dome set. |
| `src/components/share-sheet.tsx` | Snapshot, name, and share link. |
| `src/routes/s/$.tsx` | A shared bath, with the snapshot as the link card. |
| `src/lib/community/` | Fan baths, archive, Venice, and feedback. |
| `src/lib/cast/` | Pairing the controller to the large screen. |
| `src/components/guide.tsx` | The in-app tour. Keep it in step with [GUIDE.md](GUIDE.md). |

## Stack

React 19, TanStack Start, Zustand, Three.js, and the Web Audio API. Auth is Better Auth. The database is Neon when `DATABASE_URL` is set, otherwise PGLite.
