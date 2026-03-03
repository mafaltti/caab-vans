# Architecture Simplicity & Next Steps

To address your point about simplicity and maintainability — that's exactly why I like the split:

- **Expo app** = dumb GPS pipe. No UI complexity, no auth, no route logic. It sends coordinates and that's it.
- **Web app** = all intelligence. Route management, driver controls, admin panels, public views. One codebase, one deployment, works on any device with a browser.

This also means when the "Start Route" feature comes, it's just a new page in Next.js — no coordinating releases across two apps. And the Phase 1 bug fix (time-aware filtering) acts as a permanent fallback even after "Start Route" exists, covering the case where a driver forgets to press the button.

You can reference `docs/execution/0012-eta-next-stop-fix-plan.md` whenever you're ready to implement.
