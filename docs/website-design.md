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
