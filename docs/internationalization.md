# Application Internationalization

Status: language selection, persistence, settings and common workspace controls implemented; full coverage pending.

## Contract

Support `en` and `zh-CN`. Persist the explicit choice in application settings; use the operating system locale only on first launch, with English as the fallback. Expose Language as a dropdown in General settings. Synchronize settings, the main window, native dialogs, approval prompts, accessibility labels, dates, and execution-state descriptions.

User content is not a UI translation resource: do not translate or rename existing bots, groups, messages, artifacts, files, or project memories when switching languages. Model response language remains governed by the user's instructions.

## Architecture

Use a shared typed message catalog with stable semantic keys and explicit interpolation. Keep domain states and IPC errors as stable codes; translate at presentation boundaries. Annotate static views with message keys and translate dynamic controls explicitly. Do not implement translation by observing and replacing arbitrary DOM text, by matching rendered sentences, or by changing stored user content.

## Acceptance

Both locales must have identical key sets. Cover onboarding, model configuration, workspace authorization, settings, conversations, progress, stop, artifacts, browser approvals, errors, and native windows. Verify switching while a task is active does not restart it, lose a draft, dismiss an approval, or change its workspace. Verify restart persistence, keyboard labels, longer English text at minimum window size, and unchanged user data. Until these checks pass, do not advertise a fully bilingual application.

## Feedback implementation slice

Add a General → Language dropdown in the independent settings window, persist the explicit locale, and update both windows without reload or changing task/user data. Translate settings and the main static controls through explicitly keyed resources; retain untranslated runtime/provider messages as a tracked coverage boundary until those contracts are migrated. macOS main-window close must hide the window while keeping the process and tasks alive; Dock activation restores it, and explicit Quit still performs shutdown cleanup.

## Validation and remaining coverage

- 100 tests passed, including locale persistence without modifying workspace or encrypted credentials, catalog parity and interpolation preserving Chinese bot names.
- Native packaged smoke: `.tmp/lifecycle-locale-DwV8Lb`. Main close preserved the process, window and draft; simulated Dock activation restored the same window. Settings switched both ways, main controls followed, stored messages and conversations were identical, and explicit quit/restart preserved English. The final 640×500 English settings view fits without sidebar overflow; an unsaved API-key draft also survives language changes. No live model task was run in this check.
- Existing UI regression: `.tmp/ui-review-qO1I4T`.
- Remaining: native approval prompts, domain/runtime/provider errors, some interpolated descriptions and date formatting. Do not claim complete application localization.
- User acceptance: close the main window with the red button, restore from Dock, then switch Settings → General → Language both ways and restart. The yellow minimize button and explicit Quit keep their separate meanings.
