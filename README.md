# LiveSlicer

A lightweight, framework-free web app to split uploaded songs into bar-based cue clips for DJ transitions and Ableton Session View.

## What it does

- Upload any local audio file.
- Set BPM and beats-per-bar.
- Define sections in bars (e.g. Intro 8, Break 16, Build up 16, Drop 16).
- Analyze section timing.
- Export each section as a WAV clip.
- Auto-add a final `Remainder` clip so all exported clips sum to the full track duration.

## Run

Just open `index.html` in a modern browser.

## Notes

- Accuracy depends on BPM and section definitions.
- This is currently manual section entry (no AI/ML phrase detection yet).
