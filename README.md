# Remix Web

I sing covers, and I wanted a way to restyle a song's backing track before singing over it: drop it a couple of semitones, slow it down, mute the drums, push it toward lo-fi or neo-soul. This repo is the toolkit I built for that, plus a small web app and iOS app that run the most common jobs (separate a song into stems, transpose, export) from a link or an upload.

## Personal project, not a hosted service

This is a personal project. It is not publicly hosted for other people to use, and the iOS app is not distributed (it has only ever run as an internal build on my own devices). There is no public instance, sign-up or download.

If you want to try it, run your own copy with your own backend, as described below.

## What it does

1. **Separate.** Split a song into stems (vocals, drums, bass, other) with Demucs. The 4-stem `htdemucs` model is the default; the 6-stem model adds guitar and piano when those are needed. Stems are cached, so separation (the slow step) only happens once per song.
2. **Restyle.** Pitch shift and time stretch independently of each other, then shape each stem with effects: EQ, compression, saturation, reverb, delay, chorus, mute, solo and gain. Your own samples can be time-matched and layered in, and reusable effect presets live in `presets/` as YAML.
3. **Re-render.** Bounce the processed stems back into a backing track WAV, or export the individual stems.

It keeps the original arrangement and restyles it. Nothing is regenerated with AI, and everything runs on the CPU.

## How it works

### `remixkit/`: the library

A set of small Python functions (`separate`, `detect_key`, `detect_bpm`, `pitch_shift`, `time_stretch`, `eq`, `compress`, `reverb`, `layer`, `bounce` and so on). A restyle is a short "recipe" script in `recipes/` that calls them in order; `recipes/_template.py` is the starting point.

There is no GUI for this part. The interface is a conversation with Claude: I describe the sound I want ("drop this 2 semitones and make the keys lo-fi"), Claude writes or edits the recipe, runs it, and I listen to the result and iterate.

### `remixweb/`: the job backend

A FastAPI service that runs the common case without writing a recipe. A job takes a YouTube link, a Spotify link (resolved to a matching YouTube video, which the user confirms) or an uploaded file, and moves through these stages:

```
queued -> downloading -> separating -> rendering -> done
```

`downloading` only happens for links. Jobs run one at a time on a single worker thread. Outputs can be the full mix, an instrumental, an a cappella or the separate stems, optionally transposed, and each WAV also gets an AAC preview for playback. Songs are capped at 8 minutes, uploads at 60 MB, and job folders are meant to be purged after 24 hours (`remixweb/cleanup.py`). Every endpoint except `/health` needs an access key, and repeated failed attempts are rate limited.

### `web/`: the Next.js frontend

- `/` is a showcase page with a scroll-scrubbed animation (frame images drawn to a canvas with GSAP ScrollTrigger and Lenis) and a stem player.
- `/studio` is the console for submitting jobs, following their stage and downloading results. It asks for the access key first and checks it against the backend before letting you in.

### `mobile/`: the Expo iOS app

A React Native (Expo) version of the studio. It keeps the access key in the iOS Keychain, plays results back, and has an unfinished share extension for sending a link to it from another app. It finds the backend by asking the web frontend's `/api/backend-url` endpoint, so the backend address is never baked into the app.

## Stack

- **Audio:** Python 3.11, Demucs (PyTorch, CPU), Pedalboard, python-stretch, librosa, soundfile, ffmpeg
- **Backend:** FastAPI, uvicorn, yt-dlp
- **Web:** Next.js 16, React 19, GSAP, Lenis
- **Mobile:** Expo SDK 57, React Native
- **Tests:** pytest (`tests/remixweb/`), Jest (`mobile/src/__tests__/`)

## Running your own copy

This is a rough outline rather than a polished setup guide.

1. **Python environment.** Create the conda env from `environment.yml` (it installs the CPU build of PyTorch), then `pip install -r remixweb/requirements-web.txt "yt-dlp[default]"` for the backend (yt-dlp also needs Node.js on the path).
2. **Configuration.** Copy `.env.example` to `.remixweb.env` and set your own `REMIX_ACCESS_KEY`. Always set it: if it is missing, the backend falls back to a default development key, which is not safe on any machine others can reach.
3. **Backend.** `python -m uvicorn remixweb.server:app --port 8080`
4. **Frontend.** In `web/`, run `npm install`, set `NEXT_PUBLIC_API_BASE` (for example in `web/.env.local`) to your backend URL, then `npm run dev` and open `http://localhost:3000/studio`.
5. On Windows, `start.bat` starts both halves; run it from a shell with the conda env active.
6. **Recipes.** Put a source file in `input/`, copy `recipes/_template.py`, edit the parameters and run it.
7. **Mobile (optional).** Point `DISCOVERY_URL` in `mobile/src/api.ts` at your own frontend and fill in your own Expo and App Store Connect identifiers in `mobile/app.config.ts` and `mobile/eas.json`. You would need your own Apple developer account to build it.

Tests: `python -m pytest tests/remixweb` for the backend, `npm test` in `mobile/`.

## What is not included

- **Demo audio is not included.** The showcase's stem player loads files from `web/public/stems/`, which were cut from a commercial song and are left out of this repo, so the player will not play until you add your own four stems (`vocals.m4a`, `drums.m4a`, `bass.m4a`, `other.m4a`).
- No song audio of any kind is included. The only audio file is a synthetic 220 Hz test tone used by the backend tests.
- The recipes in `recipes/` reference songs I covered, but the source audio is not included; they need your own files in `input/`.
