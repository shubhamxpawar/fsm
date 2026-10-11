# Chrome Web Store Permission Justifications

## `storage`

Used to save selected domains, timer defaults, timer state, blocking state, and the last displayed quote image locally on the user's device.

## `alarms`

Used to wake the service worker when normal or kill timers end so blocking state can be reconciled even after suspension or restart.

## `declarativeNetRequestWithHostAccess`

Used to install dynamic redirect rules that send blocked domain navigations to the extension-owned blocked quote page.

## Optional host permissions

Host access is requested only for the user-selected domains that should actually be blocked. Denied domains stay saved in settings, but the extension does not install blocking rules for them until access is granted.
