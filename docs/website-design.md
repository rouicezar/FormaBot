# Product website — first preview

## Requirements

English default with a Chinese toggle, responsive product presentation and accessible motion. Download links target Releases/latest. Website scope only; preserve App and Release workflows. GitHub Pages is the hosting reference only: no visual borrowing from the supplied third-party site. User correction: analyze FormaBot UI first and extend the same visual language.

## Product UI evidence and design

Inspected the running mcp-layout desktop App and compared src/desktop/index.html, identity.ts, assets/app/icon.svg and UI design documents. White main canvas (#fff), gray sidebar (#f6f6f6), gray bubbles (#f1f1f1), text (#242424), thin separators (#e8e8e8), dark primary actions (#252525), blue artifact links (#287bc1). System sans typography, 6/8/12px control radii. Colored small silhouettes have white eyes and no surrounding tile. The official silver three-Bot F remains the application identity.

Website uses these colors, identity shapes, app icon, three-column workspace, message bubble and artifact timeline language at website scale. Click-through illustration shows task input, execution and local file delivery. It uses invented neutral sample content and is explicitly labeled; no live conversations, user files, credentials or private screenshots are included. Motion communicates step changes and respects reduced-motion preference.

## Scope and stage

Static HTML/CSS/JS in website/. No dependency, remote font, tracker or external asset. The official project SVG is reused under the project license. No third-party visual assets copied. App functionality is unchanged, so this stage delivers a runnable website preview rather than a new desktop binary. Public history base: 2ffbc6d; branch rouice/website.

Local preview: python3 -m http.server 4387 --directory website.

Status: implementation and initial browser verification complete; awaiting user visual acceptance. Deployment follows user visual acceptance. Open product boundaries: Apple Silicon macOS development preview, unsigned/unnotarized, cloud inference sends task context to chosen provider; production acceptance gates and remote Figma MCP remain open.

## Preview verification

Verified browser rendering at 320, 768, 1024 and 1440 CSS pixels with no document horizontal overflow. Chinese toggle persists after reload; English default applies without a saved preference. All three illustration controls update state, file action moves focus to preview, and narrow-screen preview is reachable. Browser captured no warning/error logs. Reduced-motion CSS disables animation/transitions; OS preference emulation was not performed. Download destination verified against current latest release (latest-preview); it is labeled development preview on the website regardless of GitHub prerelease flag. Source JS syntax check passed.

Pages API currently returns 404: no existing Pages site was confirmed. A separate manual-dispatch Pages workflow is prepared, publishing only website/. It has not been dispatched; public deployment awaits visual acceptance. Existing build.yml unchanged.

User check: inspect desktop and phone layout, switch language, click Ask / Follow the work / Open the file, inspect the sample preview, and follow guide/download/feedback links. Confirm visual consistency with the App before enabling Pages and deploying this website.

## Compact layout revision — 2026-09-13 (supersedes illustration preview)

User paused recording to prioritize layout. Removed the reconstructed App illustration and its CSS/JS, and removed references to unfinished case media. The case currently presents the planned five-person brief with an explicit recording-pending notice. Rejected earlier two-member media are outside website/ and will not ship. No successful execution or finished video is claimed.

Desktop hero uses two columns; capability rows become three columns; guide and FAQ share a compact two-column rhythm; closing CTA is a short horizontal band. Unified 1160px container, 32px section padding (26px mobile), native system typography, App gray/white colors and official icon. Mobile collapses to readable single columns.

Verified current page at 320/768/1440px: no horizontal overflow or broken images. English page heights were 2854/1880/1730px respectively (without forthcoming video). Chinese 320px also has no overflow; language persisted after reload and FAQ opened. JS syntax check passed. App and release workflow unchanged. Await visual review at http://127.0.0.1:4387/; no public deployment. Next media phase: English first, then Chinese, each 10–20 seconds, whole native window, genuine five-person successful run, no failed/retry run footage.

Latest wrapping feedback: removed all hard-coded br tags in bilingual text, allowed natural responsive wrapping, aligned guide steps horizontally and eliminated unused FAQ column. Section padding 24px, 22px on narrow phones. Verified both languages at 320/768/1440px: no horizontal overflow. English desktop page height 1545px (previous revision 1730px), without forthcoming media. Await user visual review.

## Screenshot direction (user change)

Video cancelled. Replace with actual running full-window task images for English and Chinese. Integrate a faint copy of the same image into the hero background and retain a sharp, uncropped main image with a full-size link. Do not synthesize or repaint the App UI. Scenario inputs are constructed business materials; runtime and outputs are real. Execution screenshots must not be described as a clean end-to-end benchmark.

Capture environment repair: the isolated s1a copy could not start its runtime because packaged peer dependencies were absent. Restored missing @deepseek-ai packages only in .tmp/case-study/english-app from the existing /Users/rouice/FormaBot/package-lock.json URLs, verifying SHA-512 integrity; Chinese copy derives from this repaired copy. This is a local runtime preparation, not a fix to the published installer. App source and production user data unchanged. English five-member team was actually created by the model and has delivered research and requirements; downstream work in progress. Existing Chinese five-member group is continuing source-backed proposal work. Native dynamic status text is not fully localized.

## User-provided final screenshot selection

User supplied three iShot images and authorized selecting two. Selected iShot_2026-09-13_21.23.28.png as website/media/task-en.png (five-member group plus delivered HTML preview), and iShot_2026-09-13_21.22.18.png as task-zh.png (five-member group with research/requirements deliveries). Copies preserve original PNG bytes, full window, and actual visible states. The 21.23.00 image was not used because the later English capture shows the artifact preview more clearly. Both are 2712×1772.

The main hero displays the corresponding locale image uncropped and links to the original. A low-opacity CSS background reuses the same image behind the hero to integrate the product visuals; foreground image is unmodified. Video and pending recording notices removed. Verified English source/full-image link switch, native image width 2712, zero video elements, and no horizontal overflow at 320/768/1440px; inspected Chinese hero visually. These images show task moments, not proof of a failure-free automatic execution or complete QA acceptance. No installer repair was committed. Public deployment still awaits website acceptance.

## Dimensional product scene

User requested a more creative presentation. Hero now pairs an original screenshot with short bilingual collaboration copy, restrained role-color chips, a shared-brief label and a local-delivery callout. CSS perspective/rotation and layered shadows create depth; screenshot bytes and full-image links remain unchanged. Background uses a soft neutral radial light instead of blurred duplicated UI. Phones remove perspective and put the callout below the image; reduced-motion disables hover transitions. Inspected English desktop/mobile and Chinese desktop, verified 320/768/1440px no horizontal overflow and original images load. Pending visual user review, no deployment.

Lighting revision: directional diffuse light on the left balances the screenshot's right-side weight; upper-left white highlights and lower-right blue-gray shadow share a consistent light direction. Reduced perspective/rotation slightly. This is CSS composition only; original screenshots unchanged. Desktop inspected, 320px overflow check passed; visual acceptance pending.
