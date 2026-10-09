# KinectIQ

Browser-based shoulder abduction guidance using an ordinary webcam. A pretrained pose model (MediaPipe Pose Landmarker)
runs **in the browser**. KinectIQ measures shoulder elevation, counts complete reps, warns about torso lean relative to a
calibrated neutral posture, speaks short cues, and saves the **numbers only** to a private Supabase history.

> Hackathon prototype. Not a medical device. It does not diagnose, has not been clinically validated, and angles are
> image-plane estimates, not calibrated goniometer readings.

## Prerequisites

- Node.js 18+ (tested with 24) and npm
- A webcam, and Chrome, Edge or Firefox on `http://localhost` or https
- A Supabase project (only needed for sign-in and saving)

## Setup

```bash
npm install          # also copies MediaPipe wasm into public/mediapipe/wasm
cp .env.example .env # then fill in the two values below
npm run dev          # http://localhost:5173
```

`.env`:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable / anon key>
```

Never put the service-role or secret key in `.env` for this app: everything prefixed `VITE_` ships to the browser.
Without these values the camera and movement engine still work; saving and history are disabled with a message.

### Supabase

1. Create a project at supabase.com.
2. Run every file in `supabase/migrations/` in name order, either in the dashboard **SQL Editor**, or with the CLI:
   `supabase link --project-ref <ref>` then `supabase db push`.
3. Auth → URL Configuration: set **Site URL** to `http://localhost:5173` (and add your deployed URL to Redirect URLs),
   otherwise email confirmation links point at Supabase's default `localhost:3000`.
4. Auth → Providers: email is enabled by default. For a quick demo you can turn off "Confirm email"; otherwise new users
   must click the confirmation link before signing in.

The migration creates `profiles`, `exercise_sessions`, `rep_metrics`, `form_events`, RLS on all four (owner-only; child
rows are authorized through the parent session's owner), and a `save_session(payload)` RPC that writes a session with
its reps and events in **one transaction**. The RPC runs as the caller, so RLS still applies, and re-saving the same
session id is a no-op, so retrying a failed save cannot duplicate data.

## Commands

| | |
|---|---|
| `npm run dev` | dev server |
| `npm test` | Vitest unit tests for the movement engine |
| `npm run build` | type-check and production build to `dist/` |
| `node --env-file=.env scripts/rls-check.mjs` | RLS ownership check against your Supabase project (creates two throwaway users) |

## How the measurement works

All logic is in `src/lib/exercise.ts` and `src/lib/geometry.ts`.

- **Landmarks:** MediaPipe normalized image coordinates; x is multiplied by the frame aspect ratio so both axes share a unit.
- **Shoulder elevation:** angle at the shoulder between shoulder→hip (torso line) and shoulder→elbow (upper arm).
  ~0° arm at side, ~90° horizontal, ~180° overhead. Uses the elbow, so bending the elbow does not change it.
- **Reliability:** a frame is evaluated only if the arm's shoulder/elbow/hip plus both shoulders and hips have
  visibility ≥ 0.5. Otherwise the angle is shown as unavailable. A gap longer than 500 ms aborts the rep in progress and
  resets smoothing, so stale values cannot complete a rep.
- **Smoothing:** EMA with alpha 0.3.
- **Reps:** `READY → LIFTING (>40°) → TOP (≥80°) → RETURNING (<72°) → complete (<30°)`. A rep counts only if it reached
  80°, returned below 30° and took at least 800 ms. The arm must be seen down before the first rep can start.
- **Torso lean:** angle of mid-hip→mid-shoulder from vertical. The neutral baseline is the mean over 30 reliable frames
  with the arm down. A warning fires when deviation > 10° persists for 400 ms and clears below 7°. Recalibrate any time.
- **Evidence completeness:** `complete` = ≥1 valid rep, ≥80% reliable frames and calibrated posture; `partial` = reps
  but lower tracking or no calibration; `insufficient` = no valid reps.

All thresholds live in `DEFAULT_CONFIG` and are prototype values chosen for a demo, **not** clinically prescribed.

## Privacy

Camera frames are processed in the browser and discarded. Nothing is recorded or uploaded. The model and wasm are served
from this app (`public/mediapipe`), so inference makes no network calls to a vision API. Saved data: timestamps,
duration, rep counts, angles, tracking quality and form warnings, readable only by the owning account (RLS).

## Troubleshooting

- **Camera access was blocked:** click the camera icon in the address bar, allow it, reload. Close other apps using the camera.
- **Pose model failed to load:** check that `public/mediapipe/pose_landmarker_lite.task` exists and that
  `public/mediapipe/wasm/` is populated (`npm install` runs the copy). The GPU delegate is tried first, then CPU.
- **"No person detected":** step back so your head, shoulders and hips are in frame, and use even lighting.

## Demo fallback plan

- Camera denied: fix the permission (see above). There is no simulated mode; the app never fakes live data.
- Slow model load: open `/exercise` once before presenting so the model is cached.
- Network down: the exercise works offline. The completion screen keeps the unsaved result and offers **Retry save**.

## Known limitations

- One exercise (shoulder abduction), one form rule (torso lean). No other compensation patterns are detected.
- 2D image-plane angles, so they depend on camera placement: face the camera squarely.
- Clinician access to patients is not implemented; the clinician page shows only your own data.
- RLS policies are written but were not verified against a live project during development (no credentials were available).

## Licenses

- MediaPipe Tasks Vision (`@mediapipe/tasks-vision`) and the `pose_landmarker_lite` model: Apache 2.0, Google.
  Model card: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
