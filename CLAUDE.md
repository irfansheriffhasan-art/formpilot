# FormPilot

Chrome/Edge Manifest V3 extension that semantically understands web forms and fills them
from locally stored user profiles. Tagline: "Understand any form. Fill it intelligently."
Full original spec: @docs/SPEC.md

## Who I am and how to work with me

I'm a B.Tech AI & Data Science student building this to LEARN. Act as a senior extension
engineer and mentor.

- Build ONE phase at a time. After each phase, STOP and wait until I say "Continue."
- Before coding a phase: explain the plan and any design decision that differs from the spec, and why.
- After each important file: explain what it does, why we need it, how it connects to other files,
  concepts learned, and common mistakes.
- Beginner-readable code. Comment important functions (JSDoc) and non-obvious logic.
  Never comment obvious lines.
- Prefer simple implementations first. No unnecessary abstractions.
- Never dump thousands of lines at once.
- End each phase with: exact commands, expected output, a test checklist, and a git commit
  command with a meaningful message.
- Debugging: explain the error and its cause, show the relevant code, then apply the SMALLEST fix
  and explain why it works. Never rewrite a whole file to fix one bug.
- Verify, don't assume: run `npm run typecheck` and `npm run build` after changes and fix errors
  before telling me something works.

## Commands

- `npm run build`: clean, typecheck, build app and content script into `dist/`
- `npm run dev`: watch mode for both builds (reload the extension in chrome://extensions after changes)
- `npm run typecheck`: `tsc --noEmit`
- `npm test`: Vitest unit tests for the pure intelligence layer (`src/**/*.test.ts`)
- `npm run test-forms`: serves `test-forms/` at http://localhost:5500
- Load in Chrome: chrome://extensions → Developer mode → Load unpacked → select `dist/`

## Architecture

- `public/manifest.json`: MV3 manifest (copied into dist/ by Vite)
- `vite.config.ts`: builds popup, options page, and service worker (ES modules)
- `vite.content.config.ts`: builds `src/content/content.ts` as ONE IIFE file. Content scripts can't use
  ES module imports, which is why there are two builds. Don't merge them.
- `src/background/service-worker.ts`: message handling. No state in globals (the worker sleeps).
- `src/content/`: runs inside web pages. `content.ts` routes messages; `formDetector.ts` (scanPage, stable
  element ids across scans), `fieldExtractor.ts`, `labelDetector.ts`, `highlighter.ts`, `domUtils.ts`,
  `filler.ts` (native value setter + input/change/blur events), `pageWatcher.ts` (MutationObserver, runs
  only while the popup's port is open)
- `src/intelligence/`: PURE TypeScript, no DOM, no chrome APIs (testable): `sensitivity.ts`, `normalizer.ts`
  (spelling), `synonyms.ts` (meaning: concepts + phrase scoring), `contextAnalyzer.ts` (current vs permanent
  address, someone else's details), `confidence.ts` (all weights/thresholds), `valueFormatter.ts` (dates,
  options, phone length), `fieldSignature.ts`, `fieldMapper.ts` (ties it together; runs in the popup)
- `src/types/mapping.ts`: `TargetKey` ("section.field", "currentAddress.full", "custom:<id>") and `FieldMapping`
- `src/profiles/targets.ts`: list, label and resolve every fill target from a profile object (pure)
- `src/corrections/correctionStore.ts`: correction memory (goes through storage.ts)
- `src/profiles/`: `profileTypes.ts` (data model), `profileSchema.ts` (field defs, validators,
  get/setProfileValue by "section.field" path), `profileManager.ts` (CRUD + validation)
- `src/storage/storage.ts`: the ONLY file that touches chrome.storage. Profiles and corrections live in an
  encrypted `vault` in storage.local; the unlocked key lives in storage.session (RAM only, trusted contexts
  only). Same typed getItem/setItem API; also createVault / unlockVault / lockVault / changePassphrase.
- `src/security/`: `vault.ts` (PBKDF2-SHA256 600k → AES-GCM-256, pure WebCrypto), `pageWarnings.ts` (http page,
  punycode host, form posting to another site or over http)
- `src/components/`: UI shared by popup and options (`UnlockForm`, `PassphraseSetup`); `src/hooks/useVaultStatus.ts`
- `src/types/`: `messages.ts` (discriminated-union message contracts), `formField.ts`
- `src/popup/`: React popup (profile selector + `FormAssistant` / `FieldRow`). `activeTab.ts` has inject/send helpers.
- `src/options/`: React options page for profile editing (draft pattern: edits apply only on Save) and the
  learned-corrections panel
- `test-forms/index.html`: test page. Each section states the expected result.

## Non-negotiable rules

Privacy
- Profile data stays in chrome.storage.local. No backend, no analytics, no remote code.
- Never log personal values to the console, not even while debugging. Error messages must never
  contain field values or page content.
- Profiles are ALWAYS encrypted at rest (user decision). Nothing that reads profile data renders until the
  vault is unlocked. Never store the passphrase; never store the key outside chrome.storage.session.
  Auto-lock after 15 min idle (checked lazily on use, no `alarms` permission) and on browser close.
- The content script must NEVER import `storage.ts` or read profiles. Profile values enter a page
  only after the user approves a fill.
- `FormField` has no `value` property. Never read what's typed in a page's fields.
- Correction memory stores only hostname + field signature/label + chosen target (inside the vault).
- Hidden fields are never filled: `isControlVisible` (domUtils) runs at scan AND again at fill time. It
  catches display/visibility/opacity, < 4px, off-screen, clip/clip-path, and overflow:hidden ancestors that
  cut the field off. overflow:auto/scroll containers don't count as hiding (the user can scroll).
- Risky pages (http, xn-- host, form posting elsewhere or over http) show warnings and need a second click.
  Read the form's `action` ATTRIBUTE, never `form.action` (DOM clobbering).
- `FieldMapping.reasons` must never contain profile values (a unit test checks this).
- If an external AI is added (Phase 11), send ONLY field metadata, never profile values.

Security
- Permissions: `activeTab`, `scripting`, `storage` only. No `<all_urls>`. Any new permission needs
  an explanation; "auto-detect" must be an OPTIONAL host permission the user enables.
- Never submit forms. Never fill passwords, payment/bank fields, OTPs, or captchas.
- Blocked fields are dropped at scan time and never get an elementId, so nothing can fill them.
- Sensitive fields (Aadhaar, PAN, passport...) and custom fields marked `sensitive` always need
  explicit confirmation before filling.
- Never auto-check checkboxes (usually consent).

Product principle
- "Analyze → Score → Explain → Confirm → Fill". Never guess. Low confidence = ask or mark unavailable.
- Context matters: "City" under "Permanent Address" ≠ "City" under "Current Address".

## Decisions already made (keep unless I agree to change)

- Profiles are edited in the options page (the popup closes on blur and would lose typing).
- Data model: sections `personal`, `contact`, `currentAddress`, `permanentAddress`, `education`;
  `customFields` is an array of `{ id, label, value, sensitive }`; values are optional strings,
  cleaned on save so "missing" is always `undefined`; `ProfileFieldPath` = "section.field" union type.
- Label strategy order: <label> → aria-labelledby → aria-label → nearby text → title →
  placeholder → name → id. Each FormField records `labelSource` for confidence weighting.
- Grid tables label fields as "Column header (Row label)", e.g. "Year of Passing (SSLC)".
- Content script keeps a private Map elementId → element(s); radio groups are one field.
- Highlights clear when the popup's port disconnects.
- Styling: shared tokens in `src/styles/base.css`; light/dark via prefers-color-scheme.
- Confidence: high ≥ 0.80, medium ≥ 0.55 (`confidence.ts`). Whenever the mapper ASSUMES something (address
  type not shown and the two addresses differ, date format not shown, full name standing in for legal or
  certificate name), confidence is capped at 0.70, so it can never be "high".
- A label known only from the name/id attribute scores medium: programmer names need a human to confirm.
- The popup pre-ticks only high-confidence, non-sensitive fields. Medium/low need a tick; sensitive fields
  need a tick AND a second "Yes, fill including sensitive fields" click. The content script re-checks.
- Normalizer = spelling ("E-Mail" → "email"); synonyms = meaning ("Mail ID" ≈ email). "No" → "number" only
  after another word.
- Other people's sections (Emergency Contact, Father's details, Nominee...) are never filled with the user's
  data; a bare "Name" under a parent/guardian section maps to parentGuardianName.
- Corrections are saved when the user clicks Fill, not on every dropdown change.
- The page watcher ignores style changes on controls (our own highlights) to avoid re-scan loops.

## Known limitations

Fields inside iframes aren't read; closed shadow roots are unreadable; bold-text pseudo-headings
aren't detected as sections yet; radios without a name are separate fields.
Fields covered by another element (occlusion) aren't detected as hidden (floating labels make it unreliable).
Encryption protects data at rest and against someone at a LOCKED browser; it can't stop malware running
while FormPilot is unlocked, and whatever the user fills is, by definition, given to that page.

## Status

- [x] Phase 1: MV3 + Vite + React + TS setup, messaging
- [x] Phase 2: profile storage (create/edit/delete, custom fields, delete all data)
- [x] Phase 3: field detection, label extraction, risk filtering, test-forms page
      (now 39 fields on the test page, 40 after the dynamic button, since Test 9 was added)
- [x] Phase 4: text normalization (35 unit tests)
- [x] Phase 5: synonym dictionary + phrase matching + context analysis
- [x] Phase 6: confidence scoring (weighted signals, configurable thresholds, reasons[]; 30 mapper tests)
- [x] Phase 7: analysis UI (FormAssistant: badges, reasons, "Fill with" override, sensitive confirmation)
- [x] Phase 8: filling engine (native value setter + input/change/blur events; radios via click())
- [x] Phase 9: MutationObserver (debounced re-scan while the popup is open; stable ids keep user choices)
- [x] Phase 10: correction memory (per site; managed in the options page)
- [ ] Phase 11: optional AI. Not started: needs a provider choice, an API key, and an OPTIONAL host permission.
- [x] Phase 12: UI polish (popup redesign, dark-mode tokens, Alt+Shift+F shortcut)
- [x] Security hardening: always-on encryption with passphrase + lock/auto-lock/change passphrase, migration
      of old plaintext data, stricter hidden-field detection + fill-time re-check, page warnings
      (Test 6 has 3 harvesting tricks, Test 9 posts to another site; 12 vault/warning unit tests)
- Not done yet: extension icons (the manifest has none, so Chrome shows a letter), undo after fill.

Update this Status section at the end of every phase.
