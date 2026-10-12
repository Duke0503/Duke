# My AI English Friend — Project Plan (Simple Version)

**Date:** 12 Oct 2026
**Status:** Decisions locked — ready for the build plan
**Written for:** me (simple English, no deep technical words)

---

## 1. What we are building (one sentence)

A phone-call style app where I talk to **one AI "friend" in English**. The friend can
change into **many roles** (teacher, senior developer, barista, funny/savage friend, ...)
and speaks with **real emotions** — but it costs **almost nothing**.

---

## 2. The most important discovery

We **do not** need an expensive "emotional voice" service.

**Microsoft Azure Text-to-Speech — free plan (F0)** gives us:

| What we get | Detail |
|---|---|
| Free characters | **500,000 characters / month** (about **10 hours** of the AI talking) |
| Emotion control | **50+ styles**: happy, angry, sad, whispering, excited, friendly, chat, ... |
| Voices | **400+ voices** (so different roles can sound different) |
| Price | **$0, forever, no credit card needed** |

This one choice saves a lot of money. The old plan (ElevenLabs direct, or a cheap proxy)
was about **3x more expensive** and had a big risk of getting banned. **We drop it.**

> Simple note: remember the words **TTS** = Text-To-Speech = "the voice".
> And **LLM** = "the brain".

---

## 3. Why this works (the simple idea)

Think about a real actor:

- The actor has **one voice**.
- For a new role, the actor does **not** get a new throat.
  They change **how they act** — personality, words, mood.

Same for our app:

| Part | What changes | Who does it | Cost |
|---|---|---|---|
| **Roles** (teacher, senior dev, savage friend...) | The **behavior** | The **brain** (LLM, via a text prompt) | ~free, unlimited roles |
| **Emotion** (happy, angry, whisper, laugh) | The **mood of the voice** | The **voice** (TTS style setting) | free (Azure) |
| **"Feels like a real person"** | Speed + short answers + emotion | Whole pipeline | free to build |

So we do **not** need 50 voice models. We need:

1. **One good voice** with mood control
2. **One smart brain** that can pretend to be anyone

---

## 4. The recommended stack (start 100% free)

| Job | What we use | Cost |
|---|---|---|
| Connection / phone line (WebRTC) | **LiveKit** free "Build" plan | $0 (1,000 minutes/month ≈ 16 hours) |
| Ears (speech-to-text, STT) | **Deepgram** ($200 free credit) | $0 (about 700 hours of listening) |
| Brain (the AI) | **Groq** free tier | $0 |
| Voice (TTS) — with emotion | **Azure Speech TTS** free plan (F0) | $0 (500k chars ≈ 10 hours) |
| Voice — no emotion (backup, only if needed later) | **Kokoro-82M** | $0 |

**Result: an emotional, role-switching English voice friend, about 16 free hours per month.**

> Because I practice **under 16 hours/month**, this whole stack stays **free — $0**.

---

## 5. Cost — simple comparison

Price for **1 hour of the AI talking** (about 800 words per minute):

| Voice option | Cost per hour of speech | Emotion? | Notes |
|---|---|---|---|
| **Azure TTS free plan** | **$0** (first ~10 h/month) | Yes | Start here |
| Azure TTS paid | ~$0.77 | Yes | After the free limit |
| Gemini Flash TTS | free in AI Studio / ~$0.81 paid | Yes | Good for *designing* a voice |
| OpenAI `gpt-4o-mini-tts` | ~$0.90 | Yes | Very easy to use |
| Cartesia Sonic 3 | ~$1.80 | Yes (best + fastest) | Upgrade later, if needed |
| ElevenLabs Flash v2.5 | ~$2.40–2.90 | Yes (best quality) | ~3x the price — we skip for now |
| Kokoro (self-host) | $0 + your own server | **No** | Backup only |
| Orpheus 3B (self-host) | $0 + a GPU | Yes | Only if I have/rent a GPU |

**Main lesson:** the cheapest options also have the best emotion control.
The expensive "ElevenLabs" plan is the worst value.

---

## 6. How the "friend with many roles" actually works

### Part A — The brain (roles)
We give the brain **one prompt**. It can switch role on command. Example:

```
You are my English-speaking friend. Base personality: warm, casual, funny.
If I ask you to roleplay (teacher, senior developer, barista, "savage" friend),
become that person immediately and stay in character.
Keep replies to 1-3 short sentences, like a real phone call.
Begin every reply with a mood tag, for example [[cheerful]] or [[angry]].
```

→ Unlimited roles, almost zero cost.

### Part B — The voice (emotion)
Our code reads the mood tag (`[[cheerful]]`) and tells the voice how to speak.
Example (Azure SSML):

```xml
<speak version="1.0" xmlns:mstts="https://www.w3.org/2001/mstts">
  <voice name="en-US-AriaNeural">
    <mstts:express-as style="cheerful" styledegree="1.2">
      Oh nice, you finally said that right!
    </mstts:express-as>
  </voice>
</speak>
```

### Part C — Making it feel human
- Short answers (not long paragraphs)
- Real emotion in the voice
- Fast reply speed
- **Do not interrupt me** when I pause to think (tune the "silence" delay)

### Part D — A different voice for each role
Because we chose "a different voice per role", each role is mapped to its own voice.
Example plan (we will confirm the exact voices with Azure's voice list later):

| Role | Example voice | Feeling |
|---|---|---|
| Friend (default) | en-US-AriaNeural | warm, casual |
| English teacher | en-US-JennyNeural | clear, patient |
| Senior developer | en-US-GuyNeural | calm, confident |
| Coffee barista | en-US-JasonNeural | young, friendly |
| Job interviewer | en-US-TonyNeural | serious, formal |
| Savage friend 🔥 | en-US-DavisNeural | funny, teasing |
| British friend | en-GB-RyanNeural | native UK accent |

Changing a voice costs nothing — we just change one setting in the code.

### Part E — Remembering past talks (continue an old session)
Every talk is **saved** (a small database). Later I can tap **"▶ Continue"** on an old
session. This starts a **new call**, but Alex gets a **short memory** of the old talk:
the topic, my common mistakes, and new words. So we continue naturally.
We do **not** reload the whole old transcript — only a short summary — so it stays
fast and cheap.

---

## 7. Step-by-step plan

| Phase | Goal | What to do |
|---|---|---|
| **0. Decide** | Answer the 4 questions in section 8 | ✅ Done (see section 8) |
| **1. Free prototype** | Hear the friend talk | LiveKit + Deepgram + Groq + Azure free |
| **2. Add roles + emotion** | Try teacher / senior dev / savage mode | Add the prompt + mood tag + Azure SSML |
| **3. Design the app look** | Mobile-first screens | Pre-call setup, call screen, sticky mini-bar |
| **4. Grow (later)** | More hours, better voice | Azure paid (~$0.77/h) or Cartesia (~$1.80/h) |

---

## 8. Decisions (answered)

| # | Question | **Decision** |
|---|---|---|
| 1 | GPU, or 100% online (API)? | **100% online (API).** No server to manage. Self-host is a "maybe later" idea only. |
| 2 | How many hours per month? | **Under 16 hours.** This fits inside the **free** plans. Cost = **$0**. |
| 3 | One voice, or a different voice per role? | **A different voice per role.** Still free — Azure has 400+ voices. |
| 4 | How far should "savage mode" go? | **Playful only — no real insults.** Teasing and jokes, never cruel. |

### What these decisions mean

- **We build 100% on free online services.** No GPU, no server, no monthly bill.
- **Under 16 hours/month = free.** LiveKit gives 16 h, Azure gives ~10 h of AI speech,
  Deepgram and Groq are free. This is enough for daily practice.
- **Each role gets its own voice**, so it feels like calling different people.
- **"Savage mode" stays kind.** The AI can joke and tease my grammar, but it must
  never insult my looks, family, identity, or intelligence.

---

## 9. Things to avoid

- ❌ **The cheap proxy (Must1c)** — high risk of ban; drops quality; can break any time.
  Azure/Gemini are cheaper *and* safe. No reason to use it.
- ❌ **ElevenLabs free plan for a real product** — it is **non-commercial** (you must
  show their logo and cannot sell it).
- ❌ **Old code from the Gemini chat** — it uses an old LiveKit API
  (`VoicePipelineAgent`). The new way is `AgentSession`. We will write fresh code.
- ⚠️ **Azure free plan is for testing.** Fine for me personally. If I ever sell it,
  switch to the paid plan (still cheap).
- ⚠️ **Gemini free plan trains on my data.** Do not put private things in it.

---

## 10. Word list (simple meanings)

| Word | Simple meaning |
|---|---|
| **TTS** | Text-To-Speech — turns text into a voice |
| **STT / ASR** | Speech-To-Text — turns my voice into text (the "ears") |
| **LLM** | The AI "brain" (like ChatGPT) |
| **WebRTC** | The system that carries live audio over the internet (like a phone call) |
| **VAD** | Voice Activity Detection — knows *when* I am speaking or silent |
| **Latency** | The delay between me speaking and the AI answering |
| **Barge-in** | I can interrupt the AI while it is talking |
| **SSML** | A special text format that tells the voice *how* to speak (pitch, mood, pause) |
| **Self-host** | Run the model on my own server instead of paying per use |
| **API** | A way for my app to talk to another company's service |

---

## 11. Next step

The 4 decisions are done (section 8). ✅

Next, I will write the **build plan**:

- exact steps to turn on each free service (LiveKit, Deepgram, Groq, Azure)
- the code that connects them together
- the role prompt + the role-to-voice map
- how emotion works (mood tag → Azure SSML)
- the $0 cost limit and the safety rules for "savage mode"

---

*Source: extracted from the Gemini chat "Building Human-Like Speech AI" (37 pages),
checked against the live providers' pricing pages in Oct 2026.*
