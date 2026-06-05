# Legend — HyperFrames · 2-Minute Demo Script

**Format:** horizontal / landscape screen recording (~2:00). Hold the phone in landscape, or screen-record the desktop showcase at <http://localhost:4317> (the wide layout shows the brand rail + phone stage).

**Before you hit record:** start the app (`npm run web`), open <http://localhost:4317>, and have 1–3 short raw clips ready to upload. If you want a real AI score on camera, set `LEGEND_GEMINI_API_KEY`; otherwise the heuristic grader still returns a real number.

**Total runtime target: 2:00**

---

## 0:00–0:15 — Cold open / hook

**ACTION:** Black screen, then the **Legend** welcome screen fades in — spinning compass, the logo, tagline "Take a side. Live a legend."

> **VO:** "Everybody scrolls past 'side quest' challenges. Almost nobody proves they actually did one — because raw footage never gets edited. So we built Legend: the universe hands you a quest, you go live it, and an AI does the rest."

---

## 0:15–0:30 — What we built

**ACTION:** Slowly pan across the welcome screen; hover the **Mint your legend** button.

> **VO:** "Legend is a guided ritual that turns real-world moments into a cinematic proof reel — and then an AI watches that reel and scores how close you got to the quest, out of ten. All of it runs on FFmpeg and HyperFrames, with Supabase and Cloudflare R2 behind it."

---

## 0:30–0:38 — The team

**ACTION:** Keep recording on the welcome / brand-rail screen.

> **VO:** "We're [your names here] — built start to finish at the Cursor hackathon."

---

## 0:38–1:50 — Live showcase

### (a) Answer the questions → get the quest · 0:38–0:58

| | |
| --- | --- |
| **ACTION** | Click **Mint your legend**. Move through the five **Trials** questions: drag the age slider, tap a choice or two, tap **Continue**, then **Consult the universe**. On **The Omen** screen, trigger the ritual (cast the die / draw the card). A quest is revealed on **The Quest** screen — call out its title and the scale meter. |
| **VO** | "Five quick questions — age, fears, what you love. Then the omen ritual reads you and answers." *(quest appears)* "Tonight it picked **'[quest title]'**. I tap **Accept the quest**." |

**ACTION:** Tap **Accept the quest**.

### (b) Upload the video · 0:58–1:12

| | |
| --- | --- |
| **ACTION** | On the **Proof of Legend** screen, tap the upload tile ("Tap to add video"), pick your raw clip(s). The first clip previews; the clip list shows file names + sizes. Tap **Cook my proof**. |
| **VO** | "Now I bring back the footage — raw, unedited clips straight off the phone. One tap: **Cook my proof**. It dedupes the files, then fires off an automated edit." |

### (c) The combine / render step · 1:12–1:32

| | |
| --- | --- |
| **ACTION** | The **Forge** screen: the percentage orb climbs, the four stage dots light up **Ingest → Plan → Render → Judge**, and the ritual log streams real FFmpeg / HyperFrames lines. |
| **VO** | "This is the forge. FFmpeg finds the audible moments and cuts the silence, HyperFrames lays cinematic captions and chrome over them, lints the composition, and renders the final MP4 — fully automated. You're watching the real render log." |

### (d) AI verification + the score · 1:32–1:50

| | |
| --- | --- |
| **ACTION** | The **Verdict** screen loads. The rendered MP4 plays at the top. Point at the big score, e.g. **"8.2 / 10"**, and the four sub-score bars: prompt match, visual quality, pacing, audience fit. Scroll to show the verdict word and the written rationale. |
| **VO** | "And here's the payoff — the universe watched it. The grader actually samples frames from the render and scores it against the original quest. **[say the number] out of ten** — '[verdict]'. Prompt match, visual quality, pacing, audience fit, and a written rationale on what it still wants." |

---

## 1:50–2:00 — Closer / CTA

**ACTION:** Tap **Seal this legend** → the **Complete** screen with the sigil, then a beat on the **Journal** constellation of lived quests.

> **VO:** "Seal it, and the quest becomes a star in your constellation. Quest in, graded proof out — that's Legend. Take a side. Live a legend."

**ACTION:** End on the Legend logo / welcome screen.

---

### Presenter cheat sheet (real UI labels)

- **Mint your legend** → start · **Consult the universe** → finish quiz · **Accept the quest** → go to upload
- **Cook my proof** → start render · **Seal this legend** → finish
- URLs: showcase `http://localhost:4317`, admin Quest Builder `http://localhost:4317/builder`
- Screen names in order: Welcome → Trials (quiz) → The Omen → The Quest (reveal) → Proof of Legend (upload) → The Forge (cooking) → The Verdict (AI grade) → Complete → Journal
- The score is a real 0–10 AI grade (`src/engine/questGrader.js`); say whatever number actually appears on screen.
