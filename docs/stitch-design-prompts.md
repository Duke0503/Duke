# Google Stitch — Full Prompt Set (Screens 1–8)
## App: **Duke** — practice English by voice with characters you create
### Art direction: "Paper & Ink" (must look human-designed, NOT AI-generated)

**Date:** 12 Oct 2026
**Type:** Mobile-first responsive **web app** (not native)
**App name:** **Duke**
**The AI friend:** a **character the user creates and names** (shown below as
`{Character}`). Name is typed by the user, so never hard-code a friend's name.

---

## 0. How to use (simple)

1. Open **https://stitch.withgoogle.com** → pick the **Mobile** preset.
2. Paste the **GLOBAL PROMPT** first (below). Generate it once.
3. Then paste **one screen prompt at a time**, in order (1 → 8).
4. If a screen drifts away from the style, paste the GLOBAL PROMPT again.
5. Use the **Follow-ups** (Part 3) to fix small things.

---

## 1. GLOBAL PROMPT (paste this first, and again if the style drifts)

```
BRAND: "Duke" — a personal app for practicing English by voice with AI characters that
the user creates. The APP NAME is "Duke". The AI friend is a user-created character with
a NAME CHOSEN BY THE USER (never hard-code the friend's name; show a placeholder like
"Leo" only as an example).

ART DIRECTION: "Paper & Ink". Imagine a beautifully printed language notebook crossed
with a modern audio app. Warm, tactile, unhurried, editorial. It must look like a
human designer made it — never like an AI template.

COLORS (use ONLY these):
- Background: warm parchment  #F6F1E7
- Cards: #FFFDF8 with a 1px hairline border #E4DCCC
- Main text (ink): #1C1A17
- Secondary text: #6E665A
- Primary accent (main buttons/highlights): vermilion  #D9481F
- Calm / teacher: deep sage  #2E5E52
- Savage mode: ember  #C2410C
- Success / good answers: moss  #4F7A43

TYPE:
- Headings and big numbers: a warm display SERIF (like Fraunces). Friendly, not formal.
- Body and UI text: a soft geometric SANS (like Satoshi or General Sans). Never Inter.
- Micro-labels: UPPERCASE, letter-spacing 0.12em, 11px, in secondary color.

CRAFT DETAILS:
- Very subtle paper grain over the background (2-3% only).
- Prefer thin 1px hairline dividers. Keep drop shadows small and soft.
- One signature motif: a thin, slightly hand-drawn "voice line" (a gentle wobbly
  waveform) used on the home card, the call screen, and the sticky pill.
- Layouts sit on a grid but feel a little asymmetric and editorial. Left-aligned
  headings. Generous whitespace. Do not center everything.
- Corner radius: 14px for cards, 12px for buttons. Not everything is rounded.
- Icons: a single-weight LINE icon set (Phosphor style). No emoji as icons.
- Avatars: warm, natural-light photographic portraits.

DO NOT (this is what makes a design look AI-generated):
- No purple-to-blue gradients. No neon glow. No glassmorphism everywhere.
- No generic glowing orb as the main idea.
- No emoji used as icons. No 3D blobs. No robot/brain imagery.
- No pure black (#000000) or pure white (#FFFFFF).
- Do not use any color outside the palette above.
```

---

## 2. Screen prompts (paste one at a time)

### SCREEN 1 — Home

```
Screen: Home. Mobile 9:16 web app. Same "Paper & Ink" style as before.

Layout:
- Top row: a small circular photo avatar (me) on the left; the wordmark "Duke" set in
  the display serif on the right; a thin hairline divider under the row.
- A small uppercase micro-label, left-aligned: GOOD EVENING.
- Editorial headline in the display serif, left-aligned, two lines:
  "Who do you want" / "to talk to?"
- Hero card, off-center and about 90% width: shows my most recent character — a warm
  photographic portrait on the right; on the left the character name in the serif
  (e.g. "Leo"), a secondary line "Senior Developer · warm male voice", and a filled
  vermilion button "Start a voice call". A thin hand-drawn voice line runs along the
  bottom of the card.
- Micro-label YOUR CHARACTERS, then a vertical list of rows separated by hairline
  dividers. Each row: a small circular portrait, the character name in the sans, a
  secondary line "Teacher · clear female", and on the right a quiet text button
  "Call" (or "Continue" if there is an old session).
- A final outlined row with a plus line icon: "Create a character".
- Micro-label READING PRACTICE, then two list rows with a thin book line icon and a
  time label.
- Bottom tab bar on a hairline top border: four line icons with small labels —
  Home, Characters, History, Settings.
```

### SCREEN 2 — Create / Edit Character

```
Screen: Create a Character. Mobile 9:16. Same "Paper & Ink" style.

Layout:
- Top row: a thin back arrow on the left; the title "Create a character" in the display
  serif, left-aligned; a quiet "Save" text button on the right; hairline divider below.
- NAME section: a large underlined text input with a friendly label
  "What is your character's name?" and a light placeholder "e.g. Leo".
- AVATAR section: a horizontal row of five or six circular portrait options plus one
  "＋" upload circle. The selected portrait has a vermilion ring.
- Section "ROLE" (uppercase micro-label). A wrapping row of outlined chips:
  Friendly, Teacher, Senior Developer, Barista, Savage, Custom. Below the chips, a
  simple underlined input: "Describe any role, e.g. a strict hiring manager".
- Section "PERSONALITY". Three selectable cards: "Sweet & supportive",
  "Chill & casual", and "Savage (playful roasting)". The Savage card uses the ember
  color and, when selected, an ember border.
- Section "VOICE". A compact row: a small voice-line icon, the text
  "Warm, female · US", a quiet "Preview" text button, and a small "Change" link.
- Section "FEEDBACK". Three option rows, each a thin radio dot plus a label:
  "Just talk", "Show tips quietly", "Correct me out loud".
- Section "DEFAULT TOPIC (OPTIONAL)". One underlined text input.
- Sticky bottom: a full-width filled vermilion button "Save character", with a quiet
  text button under it: "Save and start call".
```

### SCREEN 3 — Active Call

```
Screen: Active Call. Mobile 9:16. Same "Paper & Ink" style.

Layout:
- Top row: the character's name in the display serif on the left (e.g. "Leo") with a
  small uppercase micro-label under it showing the role and mood (e.g. "SENIOR DEVELOPER
  · SAVAGE" in ember); the call timer "03:45" centered in the display serif; a small
  connection indicator (three tiny bars) on the right; hairline divider below.
- Center: instead of a generic glowing orb, a large hand-drawn "voice line" — a thick,
  gently animated ink waveform that swells while the character speaks and flattens while
  listening. Under it, a status line in the display serif:
  "Leo is speaking" or "Listening".
- Live turn: two short transcript lines (character / you) in small secondary text.
- Tip card: a paper note card with a slightly torn, hand-drawn top edge. Small uppercase
  label NATIVE PHRASING, then the corrected sentence with the key fix underlined in moss
  green, e.g. "I went to the store."
- Controls at the bottom on a hairline top border: three round buttons.
  Left: a stop/hand line icon labeled "Interrupt".
  Center: a large filled vermilion circle with a microphone line icon labeled "Mute".
  Right: an outlined circle with an end-call line icon labeled "End".
- A small text button above the controls: "Switch character".
```

### SCREEN 4 — Switch Character (bottom sheet)

```
Screen: Switch Character, shown as a bottom sheet over the call screen. Mobile 9:16.
Same "Paper & Ink" style.

Layout:
- The call screen stays visible but dimmed behind the sheet.
- The sheet has 14px rounded top corners, a paper background, and a thin drag-handle line.
- Title in the display serif: "Switch character".
- A vertical list of my characters (paper cards with hairline borders). Each row: a small
  portrait, the character name in the sans, and a tiny secondary line with role and voice,
  e.g. "Teacher · clear female". The current character has a vermilion left border and a
  small vermilion dot. Savage characters use ember.
- A full-width outlined row "＋ Create a character" at the bottom of the list.
- A row with a thin switch: "Keep the same voice when switching".
- Bottom: a full-width outlined button "Use this character".
```

### SCREEN 5 — Reading Practice + Sticky Pill

```
Screen: Reading Practice. Mobile 9:16. Same "Paper & Ink" style.

Layout:
- Top row: a thin back arrow; the article title "Ordering Food at a Restaurant" in the
  display serif, left-aligned; a 2px vermilion reading-progress bar under the title.
- Body: an English passage in the body sans with generous line-height, on the parchment
  background. A few key words are underlined with a hand-drawn dotted line in sage, with
  one small tap-hint icon beside a word.
- Sticky pill at the bottom: a rounded (14px) paper card floating with a hairline border
  and a small soft shadow. Left: a tiny animated voice line. Middle: "{Character} is
  listening" and a small timer in secondary text. Right: a mute line icon and an expand
  line icon.
- Extra bottom padding so the pill never covers the text.
```

### SCREEN 6 — History

```
Screen: History. Mobile 9:16. Same "Paper & Ink" style.

Layout:
- Top row: the title "Your sessions" in the display serif, left-aligned; a small filter
  line icon on the right; hairline divider below.
- A stats strip of three numbers set in the display serif with tiny uppercase labels:
  "4h 20m / TOTAL TIME", "12 / DAYS", "38 / NEW PHRASES".
- Session list as rows separated by hairline dividers (not cards). Each row: a small
  portrait of the character inside a circle; then the character name in the sans with a
  secondary line "Yesterday · 12 min · past tense verbs". On the right, a quiet
  "Continue" text button.
- Savage sessions show a small ember flame line icon.
- Bottom tab bar: Home, Characters, History, Settings.
```

### SCREEN 7 — Session Detail

```
Screen: Session Detail. Mobile 9:16. Same "Paper & Ink" style.

Layout:
- Top row: a back arrow; the title "Leo · Senior Developer" in the display serif; the date
  in secondary text on the right; hairline divider below.
- Micro-label SUMMARY, then two or three short lines of text.
- Micro-label CORRECTIONS. A list of note cards with hairline borders. Each card: a small
  gray line "You said: I go to store yesterday", then the native line
  "I went to the store yesterday." with the important fix underlined in moss green.
- Micro-label NEW WORDS. A few outlined word chips.
- Bottom: a filled vermilion button "Continue this conversation"; underneath it a quiet
  text button "Practice this again".
```

### SCREEN 8 — Settings

```
Screen: Settings. Mobile 9:16. Same "Paper & Ink" style.

Layout:
- Top row: a back arrow; the title "Settings" in the display serif; hairline divider below.
- A grouped list using uppercase micro-labels as section headers and hairline dividers:
  - CHARACTERS: "Manage characters" value row, and a toggle
    "Keep one voice for all characters".
  - FEEDBACK: three radio rows — "Just talk", "Show tips quietly", "Correct me out loud".
  - LANGUAGE: value row "English", and a segmented control "Accent: US / UK / Australia".
  - SAVAGE MODE: one short description line, then a toggle
    "Keep it playful (no real insults)" shown ON and locked, with a small lock line icon.
  - PRIVACY & DATA: toggle "Save my transcripts", and "Delete all my data" in vermilion.
  - ABOUT: "Version" and "Help".
```

---

## 3. Follow-up prompts (fix a screen after it is generated)

- "This looks too centered and symmetric. Make it more editorial and left-aligned."
- "Replace every emoji used as an icon with a single-weight line icon."
- "Change the background to warm parchment #F6F1E7 — not white, not dark."
- "Use a warm serif for the headings and a soft geometric sans for the body text."
- "Add a subtle paper grain and thin hairline dividers; make the shadows smaller."
- "Replace the glowing orb with a hand-drawn ink voice line."
- "Show the character's name as user text, not a fixed name."
- "Add a '＋ Create a character' row at the end of the characters list."
- "Add a 'Continue' text button on each session row."

---

## 4. Final check — does it look human? (quick checklist)

- [ ] Background is warm parchment, not white or dark neon
- [ ] Headings use a serif; body uses a geometric sans (not Inter)
- [ ] No purple/blue gradient, no glassmorphism, no neon glow
- [ ] No emoji used as icons — only single-weight line icons
- [ ] The voice is shown as a hand-drawn ink line (not a glowing orb)
- [ ] Lots of whitespace, left-aligned, slightly asymmetric
- [ ] Only the 8 palette colors appear
- [ ] Small shadows, hairline dividers, 14px card radius

If any box is unchecked, re-paste the GLOBAL PROMPT and the follow-up that fixes it.

---

## 5. Notes

| Item | Note |
|---|---|
| App name | **Duke** |
| Character name | Typed by the user when creating a character. Prompts use a placeholder like "Leo". |
| Theme | Warm light "paper" theme (looks hand-made). If you want dark, ask for a dark "ink & charcoal" version — avoid dark-neon. |
| Fonts | Stitch may not have these exact fonts; pick the closest warm serif and geometric sans. |
| Per-call topic | A small "start call" sheet (topic + feedback) can be added as an extra screen if you want it. |
| Flow | Home → Create Character → Call → (Switch Character). Home → Reading. History → Session Detail → Continue back to Call. |
| v1 screens | 1, 2, 3, 6 are the minimum. |
