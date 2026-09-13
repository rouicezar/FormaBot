# Release Readiness

Baseline: `fa79bc8`, 2026-09-12. The working tree was clean before release preparation. The repository had 166 tracked files, no configured remote, and only ASCII filenames. The requested public GitHub repository exists and has no default branch or commits. Authentication was verified without exporting credentials.

## User requirements and disposition

| Requirement | Evidence / decision | Gate |
| --- | --- | --- |
| Clean, professional source repository | Current tree audited; historical product-origin wording removed from current documentation. Engineering findings remain documented, not disguised as completed work. | CSS cascade consolidation, task/control recovery and architectural review remain necessary; no claim that cleanup alone makes the product production-ready. |
| English default README, Chinese entry, English filenames | `README.md`, `README.zh-CN.md`; existing filenames are ASCII. | Validate internal links before publication. |
| Personal use allowed, commercial use requires permission | `LICENSE` and `docs/commercial-licensing.md`; personal-use source-available license plus separate commercial agreements. | Third-party licenses remain independent; complete bundled notices and confirm redistribution obligations. |
| English / Simplified Chinese application switching | `docs/internationalization.md` defines persistence, typed resources, native dialogs, errors, data preservation and runtime tests. | Language selector, persistence and common UI coverage now implemented; native approvals, runtime errors and remaining dynamic descriptions still block a full-coverage claim. |
| Remove product-origin references | Current tracked text cleaned; preserve mandatory dependency attributions. | Old Git history still contains prior text. Do not push development history to the empty public repository. Prepare a reviewed first-publication snapshot while retaining the local history. |
| GitHub installer | macOS Apple Silicon build pipeline and local installer preparation. | Developer ID Application certificate is absent. Signing/notarization, bilingual acceptance and public distribution gates remain open. |

## Engineering findings

- The main process still combines task orchestration, IPC routing, browser lifecycle, model configuration and approval presentation. Separate domain services behind tested IPC contracts before expanding publication features.
- The desktop stylesheet contains accumulated overrides. Consolidate by component with regression screenshots; a cosmetic rename is not an architectural improvement.
- Group participation still uses a default coordinator fallback. Full silent assessment by every member is not implemented.
- Multi-level rework recovery across restarts and browser cancellation/approval counterexamples remain open in the earlier audit.
- User-visible strings are embedded in HTML and TypeScript. A single language dropdown without catalog coverage would be incomplete; use the explicit internationalization design.
- Dependencies include native/transitive packages. Package presence, license declarations, notices, platform support and included runtime binaries need separate checks.

## Distribution limits

Only Apple Silicon macOS is validated. Existing Apple Development / Apple Distribution identities are not Developer ID Application identities for standard outside-store notarization. Do not tell users to disable Gatekeeper or remove quarantine as a substitute for a signed release.

No public release, upload, or push has been completed by this preparation document. Preparation is not a stable-release announcement. Preserve the task control → trusted delivery → browser and approvals → controlled beta → formal release order; each implementation slice requires a runnable build and explicit user testing under `AGENTS.md`.

## Publication plan

1. Commit the reviewed local preparation snapshot and attach checksums to local installer candidates.
2. Implement full `en` / `zh-CN` coverage and complete user acceptance, without translating stored user content.
3. Close execution and delivery release blockers and dependency redistribution gaps.
4. Sign and notarize using a Developer ID Application identity and the authorized Apple account.
5. Prepare a first-publication branch that does not expose private local history, settings, test data, or historical product-origin text. Verify the exact export and its archive.
6. Push only that reviewed public branch to the supplied empty repository; upload installers and checksums as release assets after release approval. Keep installers out of Git source history.

Official distribution requirements: https://www.electron.build/docs/notarization/ . The personal-use terms are a project-specific license, not a standard OSI license.

## Preparation slice evidence — 2026-09-12

- `npm run typecheck`: passed.
- `npm test`: 28 files / 98 tests passed, including the existing native permission tests. This does not establish user acceptance of unresolved product behavior.
- `node scripts/audit-release-source.mjs`: current source tree checked for sensitive filenames, selected credential patterns, English document filenames, product-origin wording, and README links; no findings. Pattern scanning is not a guarantee that every possible secret is absent. Ignored production data was not read.
- `node scripts/generate-third-party-notices.mjs`: 527 installed production package entries; no missing root/supplemental license text. Supplemental provenance is in `docs/licenses/README.md`; native dependency source/relink obligations still require review.
- `npm run package:preview`: built `build/release-preview/FormaBot-0.1.0-arm64.dmg`, approximately 208 MiB. Explicit `--publish never`; no network upload.
- SHA-256: `2d0405d7f62e171712264ce71451d12ff0f65bfcd4d79223eefe75def771a7d7`.
- `hdiutil verify`: valid. The read-only mounted image contains the bundled Node runtime, execution harness, project license and third-party notices. Every built `dist` file matches the mounted application's corresponding file.
- Packaged UI regression: `.tmp/ui-review-I42Uap`; settings, persistent visibility, conversation search, long text, artifacts and 800/1440 layouts passed using isolated fixtures. The same regression also passed when launched directly from the read-only mounted DMG (`.tmp/ui-review-Djbahv`). No real model task or private user data was used.
- `origin` now points to `https://github.com/rouicezar/FormaBot.git`; no push was performed. The local commit is the preparation record, not a public-source approval.

Packaging warnings remain visible: ASAR is disabled and dependencies have duplicate references. Review the harness's filesystem/module-loading requirements before changing archive layout; do not enable ASAR without packaged execution tests. macOS signing was explicitly skipped because a suitable identity is absent.

## Manual acceptance for this slice

Status: **awaiting user testing**, not approved. Open the local preview application, confirm existing configuration and conversations remain available, open the independent settings window and test the conversation visibility switch, then open an artifact from a conversation and its history panel. The README language links should open their corresponding document. Do not expect an application-language dropdown in this slice.

Next implementation slice is complete application localization as specified in `docs/internationalization.md`. Resume it after this slice's explicit acceptance under the repository delivery rule. Subsequent release work keeps the task-control → trusted-delivery → browser-and-approval → controlled-beta → formal-release sequence. Public release assets are not ready to upload as a stable release.

## Authorized preview publication

The user explicitly authorized pushing the reviewed source and publishing downloadable development previews on GitHub. This supersedes the prior no-upload preparation boundary for previews only. Stable-release readiness remains open. The first public commit excludes private development history; local history is retained. The workflow builds on macos-15 arm64 and publishes latest-preview with the source commit and SHA-256 checksums.
