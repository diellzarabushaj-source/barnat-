# Phone, tablet and desktop refinement

The shared shell now enforces 44px-high buttons, selectors and disclosure controls on phones and coarse-pointer devices. Small icon actions also receive 44px width. Form text stays at 16px on touch tablets, wrapping tabs and filters remain readable, and dosage headings use full-width text on narrow phones. Desktop pointer controls retain their compact layout.

The audit uncovered a navigation gap at 1024–1100px: tablet CSS hid the sidebar while the shared controller treated this range as desktop and hid the menu button. The shared stylesheet now uses the controller's 1024px boundary and explicitly restores desktop sidebar position, overriding legacy page rules.

Clinical data and dose calculations are unchanged. Asset versions are updated on all 11 workspace pages.

## Reproduction

Start `PORT=4190 node tests/clinical-smoke-server.js`, then run `PHASE=after node tests/responsive-refinement-browser.js`. The browser test covers 11 pages at widths 320, 390, 768, 844 (landscape height 390), 1024, 1440 and 1920. It checks page startup, document overflow, visible touch target height and input font size, menu Escape/focus restoration, resize recovery and desktop navigation position. WIDTHS and BROWSER=webkit can narrow the matrix or change engines. Reports and phone screenshots go to the adjacent scratch directory.

These are fixture-backed UI checks, not a production data audit. Local Windows WebKit returned about:blank on navigation; use the repository's Linux WebKit CI for that engine.
