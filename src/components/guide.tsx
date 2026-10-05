import { create } from "zustand";

export type GuideStep = {
  id: string;
  title: string;
  body: string;
  fresh?: boolean;
  panel?: "session" | "item";
  waves?: boolean;
  focus?: "bowl" | "ear" | "dome";
  highlight?: string;
};

export const GUIDE: GuideStep[] = [
  {
    id: "play",
    title: "Play",
    body: "Press play, or the space bar, and the bowls ring. Space again pauses, and it stays paused while you look around. The play button pulses so you can see it is waiting. Headphones make the left and right easier to place. A first visit opens a preset or a fan bath at random. The i on the canvas opens this tour. The i beside a slider or switch explains that control, and while this tour is open every one of those notes is showing.",
  },
  {
    id: "room",
    title: "Click the floor",
    body: "Click the room and Session opens down the left side. Click empty air, or the X, and it hides again.",
    fresh: true,
    panel: "session",
    highlight: "room-size",
  },
  {
    id: "size",
    title: "Room size",
    body: "Growing the room, or picking a wider shape, opens more floor. Drag a bowl or an ear out to the new walls. They are no longer stuck in the old footprint.",
    fresh: true,
    panel: "session",
    highlight: "room-size",
  },
  {
    id: "shapes",
    title: "New rooms",
    body: "Golden hall and Golden chapel are golden rectangles. Octagon, Apse, and Ellipse sit with them. Bowls keep their size when the shape changes.",
    fresh: true,
    panel: "session",
    highlight: "shapes",
  },
  {
    id: "select",
    title: "Select a bowl",
    body: "Click a bowl. A box wraps it, and the side menu lists its glass, pitch, and level.",
    panel: "item",
    focus: "bowl",
    highlight: "frequency",
  },
  {
    id: "resize",
    title: "Drag a corner",
    body: "The gold corners of a bowl resize it. The bowl stops before it would pass through another bowl or an ear. On a phone, the sliders button opens size and place before the full settings. On an ear, a corner turns it. An edge of the ear’s box sizes the left and right cones. Shift-click adds more, then move or scale them together. Command-Z puts them back.",
    fresh: true,
    panel: "item",
    focus: "bowl",
    highlight: "width",
  },
  {
    id: "bowl-height",
    title: "Drag the bottom",
    body: "Bottom points on a bowl lengthen it. Drag any of them down and the wall grows while the rim stays. The box and those handles stop at the floor, so nothing draws through the surface. The points hide when the bowl is already on the floor. Drag the bowl itself downward to do the same, until it meets the floor, another bowl, or an ear.",
    fresh: true,
    panel: "item",
    focus: "bowl",
    highlight: "height",
  },
  {
    id: "copy",
    title: "Remove or copy",
    body: "The menu on the selection has an X to remove it and a copy mark. A copy appears beside it. Everything else stays where it was. A dome uses the same two icons.",
    fresh: true,
    panel: "item",
    focus: "bowl",
  },
  {
    id: "dome",
    title: "Hang a dome",
    body: "The shell button hangs a dome face-down over the glass. Waves that rise into the opening come back down, and you hear that return in the horns: a wider shell catches more of the room, and a shell as wide as the hall covers the floor. From outside it stays nearly clear so you can still see the bowls. Move the view underneath and it fills in. Drag the crown to set the height, the point on the rim to scale it, and the shell itself to slide it. Select it and the icons remove or copy it. Material, pitch, reflection, spread, and brightness change how the bounce sounds. Turn on waves and the return shows as a shell in a mix of the bowl and the dome. Four is the ceiling. New presets Hall Canopy, Note Cup, Split Return, Late Ceiling, and Soft Frost each use the dome a different way.",
    fresh: true,
    panel: "item",
    focus: "dome",
    waves: true,
  },
  {
    id: "ear",
    title: "Left and Right",
    body: "Each ear is two hollow horns, labeled Left and Right. The wide mouth faces the sound. The horns stay put until you pull a ball. A red circle sits outside each cone, on the ear and on every stem, so the size is easy to see. The red ball on that circle is the size handle. Pull it out and only that cone gets larger. Push it in and that cone gets smaller. That ball does nothing else. A ball on the back of each horn lifts just that one. The long lever behind the head lifts both together. The ball past the mouth aims that horn: pull it up or down and the opening follows, all the way to straight up or straight down. A ring around each horn turns that horn on its own. The ring above the head still turns the whole ear. A wider mouth, a higher volume, and an opening aimed at a bowl gather more of that bowl. Waves that reach the mouth, including bounces, are what that horn collects, and that is what you hear. Nothing here will go through the floor, a wall, a bowl, or the other horn. Drag the head up to four times the old ceiling. A corner of the box turns the ear. An edge sizes both horns. In this tab the list is the order: the first row is the ear you hear, and the rows under it are stems.",
    fresh: true,
    panel: "item",
    focus: "ear",
    highlight: "ear-side",
  },
  {
    id: "cast-play",
    title: "Play the paired screen",
    body: "After you pair, the smaller screen lists every bowl, the ear, and each stem as a button in its own color. Pick a bowl, slide around its rim, and the larger screen sings. Tap the bowl to strike it. Five mallets sit under the rim. Hold the bowl to keep one mallet on it for this session. Saving the template keeps that mallet with the bowl.",
    fresh: true,
  },
  {
    id: "cycle",
    title: "Cycle the ears",
    body: "Check Cycle through. Turn every runs from 0.25 seconds to 33.33 seconds. You hear one stem, then a short fade into the next in the list, with no gap. The other stems stay quiet until the cycle reaches them.",
    fresh: true,
    panel: "item",
    focus: "ear",
    highlight: "cycle",
  },
  {
    id: "stems",
    title: "Stem ears",
    body: "The second + adds an ear for recording. You hear the main ear until Cycle through reaches a stem, or you make that stem the ear. A download keeps each extra ear as its own left and right. A live stream stays stereo.",
    fresh: true,
    panel: "item",
    focus: "ear",
  },
  {
    id: "promote",
    title: "Ear or stem",
    body: "Select a stem and press the ear icon. It becomes what you hear, and the old ear turns into a stem. To turn the ear into a stem by hand, press the stem icon, then select another ear. You hear that one as a preview. Cycle through does the same trade on its own, one stem at a time. Either way the handoff is a short fade, so the sound does not jump or go quiet.",
    fresh: true,
    panel: "item",
    focus: "ear",
  },
  {
    id: "waves",
    title: "Waves",
    body: "The wave button draws every front in the room, not on the floor. Each one is a shell: three rings, so you can see it from the side, and it grows out of that bowl in the bowl's color. A bounce off a wall keeps the color. A dome sends the rising shell back down across the opening, in a mix of the bowl and the dome, and that return is part of what the horns collect. Where two shells meet, the spark mixes the two colors. A shell lights a horn when it reaches the mouth. After thirteen minutes with no one touching the screen, the bowls, the room, and the floor fade and only these shells remain.",
    fresh: true,
    waves: true,
    highlight: "waves",
  },
  {
    id: "phrase",
    title: "Phrase",
    body: "Sustain holds. Breath, tide, mallet, and canon give the bath a cycle. The length slider sets that cycle.",
    panel: "session",
    highlight: "phrase",
  },
  {
    id: "veil",
    title: "Veil and shimmer",
    body: "Veil is a quiet detuned twin on every bowl, so the beats do not lock. Crown shimmer adds the high glass.",
    panel: "session",
    highlight: "veil",
  },
  {
    id: "color",
    title: "How the room colors the sound",
    body: "Decay, early reflections, flutter, slapback, standing waves, air loss, bloom, and envelopment. A shape sets them. You can move each one after.",
    panel: "session",
    highlight: "decay",
  },
  {
    id: "hall",
    title: "Glass hall",
    body: "The dry crystal stays full. Hall, hall size, and silk sit behind it. Transpose shifts every bowl by cents.",
    panel: "session",
    highlight: "hall",
  },
  {
    id: "cast",
    title: "Cast",
    body: "Cast pairs this screen with another, by a code or a QR. The larger screen drops its menus and draws the room in ultra HD when the machine can. The smaller one keeps the controls, including waves and Cycle through. Record there and both screens save the file. The large one downloads it with no extra prompt.",
    fresh: true,
  },
  {
    id: "share",
    title: "Share",
    body: "Share, at the bottom right of the desktop view, has a label and an icon. It takes a picture of the scene you are looking at, including the camera angle, waves, and whether playback or Cycle through is on. Name that picture as a template. You need to be signed in. The link uses your name, and anyone who opens it lands on that same view. The card on the link is the snapshot. Presets and Fan Created sit on the second line of the header. In Presets, tap a tag to keep only that set, then sort by New, Features, loved, played, or name. Baths marked AI generated use the new horns, mallets, and cycles. Thumbs at the bottom corners step through the presets: down for the previous, up for the next. Each thumb is kept, and the daily bath leans toward the ones people leave up. Move more than one bowl or ear and the thumbs tuck away. The small thumb on the left brings them back. A fan bath shows the author’s name, never an email. Change one and save it as a new bath. A bath you saved can be renamed or updated. Signed-in saves, your name and bio, and each weekly AI note are also copied to GitHub, so they are not only in this browser.",
    fresh: true,
  },
  {
    id: "kiosk",
    title: "Listening mode",
    body: "Leave the screen alone. After a few seconds the menus, boxes, and labels fade and the view slowly turns. After three minutes the room, the floor, and the ears fade, and only the bowls keep spinning. After thirteen minutes the bowls fade too, and only the three-dimensional wave shells remain. Move, click, or press a key and the room comes back.",
    fresh: true,
    waves: true,
    highlight: "waves",
  },
  {
    id: "record",
    title: "Record",
    body: "Record writes a file. One ear is stereo. Extra ears are stems, each with its own left and right cones, including height. Presets that use every stem are marked for download, and so is a save with more than one ear. Cycle through keeps walking the ear while you listen.",
  },
  {
    id: "feedback",
    title: "Bugs and features",
    body: "On the left of the bath, the bug button and the spark button open a note. Type the letters in the picture, then send it. The note is filed as an issue on the bath’s repository. Venice reads it. If it looks like a small, safe change, a draft pull request is opened and left for review. It does not merge by itself. A note for the owner stays in Dash, under Admin, and is not put on the public issue.",
    fresh: true,
  },
];

type GuideState = {
  open: boolean;
  step: number;
  toggle: () => void;
  close: () => void;
  next: () => void;
  prev: () => void;
};

export const useGuide = create<GuideState>((set) => ({
  open: false,
  step: 0,
  toggle: () => set((state) => ({ open: !state.open, step: state.open ? state.step : 0 })),
  close: () => set({ open: false }),
  next: () => set((state) => ({ step: Math.min(GUIDE.length - 1, state.step + 1) })),
  prev: () => set((state) => ({ step: Math.max(0, state.step - 1) })),
}));

export function GuideCard() {
  const stepIndex = useGuide((state) => state.step);
  const next = useGuide((state) => state.next);
  const prev = useGuide((state) => state.prev);
  const close = useGuide((state) => state.close);
  const step = GUIDE[stepIndex];
  if (!step) return null;
  return (
    <div className="w-72 rounded-lg border border-line bg-surface p-3 shadow-lg" data-guide-card={step.id}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-display text-2xl leading-none text-fg">{step.title}</p>
        {step.fresh ? <span className="text-xs font-medium text-gold">New!</span> : null}
      </div>
      <p className="mt-2 text-pretty text-sm text-muted">{step.body}</p>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" className="h-11 flex-1 rounded-md border border-line text-sm text-fg disabled:opacity-40" onClick={prev} disabled={stepIndex === 0}>
          Back
        </button>
        <span className="text-xs tabular-nums text-muted">
          {stepIndex + 1} / {GUIDE.length}
        </span>
        <button
          type="button"
          className="h-11 flex-1 rounded-md border border-line text-sm text-fg"
          onClick={stepIndex === GUIDE.length - 1 ? close : next}
        >
          {stepIndex === GUIDE.length - 1 ? "Done" : "Next"}
        </button>
      </div>
    </div>
  );
}
