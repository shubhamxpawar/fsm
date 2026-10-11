# Final Regression Checklist

Core behavior:

- Manual switch on blocks selected sites immediately.
- Manual switch off unblocks selected sites unless a timer still requires blocking.
- Normal timer blocks until completion.
- Normal timer can be paused, resumed, and cancelled.
- Kill timer blocks until completion and cannot be stopped from the extension UI.

Reliability:

- Restart Chrome while a normal timer is running and confirm it restores correctly.
- Restart Chrome while a kill timer is running and confirm it restores correctly.
- Sleep and wake the machine during both timer types and confirm state reconciles on wake.
- Confirm a delayed alarm still finalizes correctly from persisted timestamps.

Permissions and domains:

- Deny host access for a selected domain and confirm the domain stays saved but unblocked.
- Revoke host access after saving and confirm missing permission status appears in options.
- Add malformed or duplicate domains and confirm validation blocks them.

Pages and accessibility:

- Confirm the blocked page shows a random local quote image and a readable reason.
- Verify keyboard access for popup and options controls.
- Verify reduced visual breakage on narrow widths.
