# Known Limitations

- A running kill timer cannot be bypassed through the extension UI, but Chrome-level disable, uninstall, profile switching, or using another browser remain outside the extension's control.
- Blocking is limited to `main_frame` navigations on domains with granted host access. Embedded frames, app-native traffic, and unrelated browsers are not covered.
- Chrome alarms can fire late after sleep, service-worker suspension, or heavy system load. The extension reconciles from persisted timestamps on wake and startup, but the wake-up event itself is still controlled by Chrome.
- Device clock changes can affect any timer system that relies on wall-clock timestamps. The extension uses persisted absolute deadlines and reconciles on every state read, but manual system clock edits can still shorten or extend effective time.
- Quote assets are bundled locally at build time. Adding or removing images in `src/shared/quotes/` requires rebuilding the extension so the packaged `dist/quotes/` directory stays in sync.
