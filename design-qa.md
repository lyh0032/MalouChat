# Chat Header Design QA

## Evidence

- Source visual truth:
  - `/var/folders/6_/mrnjwbjn5s9fg1jvyp0s466h0000gn/T/codex-clipboard-99019036-70b0-4471-9929-23fef7650baf.png` (929 x 170)
  - `/var/folders/6_/mrnjwbjn5s9fg1jvyp0s466h0000gn/T/codex-clipboard-cea436b1-c831-4a76-ad58-284d9d3af21c.png` (594 x 295)
  - `/var/folders/6_/mrnjwbjn5s9fg1jvyp0s466h0000gn/T/codex-clipboard-37a8b93b-fc43-4c16-bf50-c050a7f4a9bd.png` (498 x 278)
- Browser-rendered implementation:
  - `/private/tmp/malouchat-chat-header-qa/qa-chat-header-project-desktop.png` (1440 x 900)
  - `/private/tmp/malouchat-chat-header-qa/qa-chat-header-project-narrow.png` (820 x 900)
  - `/private/tmp/malouchat-chat-header-qa/qa-chat-header-project-mobile.png` (390 x 844)
- CSS viewports: 1440 x 900, 820 x 900, and 390 x 844.
- Device scale factor: 1. Source captures were evaluated at their native size; the comparison focused on the top control region rather than scaling unrelated conversation content.
- State: authenticated light theme, existing ordinary conversation and existing project conversation, conversation content scrolled beneath the floating controls.

## Comparison

- Full-view comparison: the implementation removes the fixed title bar, keeps conversation content as the primary surface, and places compact floating controls at the top edges as in the references.
- Focused comparison: source and implementation top control regions were reviewed together. Desktop shows only the more action at right; narrow layouts show menu at left and new conversation plus more at right. Project conversations additionally retain a compact project chip at left.
- Typography: no redundant conversation title remains. Project text uses the existing app type scale and truncates safely.
- Spacing: controls are 32-34 px with a 12-14 px viewport inset. No horizontal overflow or control overlap occurred at 390 px.
- Colors: existing MalouChat blue/white tokens are retained. Glass surfaces use translucent neutral-blue layers in light mode and have dark-theme counterparts.
- Image/icon quality: existing Element Plus action icons remain sharp; the menu uses a compact familiar two-line mark matching the reference.
- Copy: controls use accessible labels and tooltips; no visible instructional copy was added.

## Findings

- No actionable P0, P1, or P2 differences remain.
- Intentional differences: the share action is omitted because the product has no sharing capability; project context is retained per the product requirement.

## Comparison History

1. P2: the first narrow render used Element Plus `Menu`, which appeared as a four-square mark and drifted from the reference.
   Fix: replaced it with a compact two-line menu mark while preserving the 34 px glass button.
   Post-fix evidence: the 820 px and 390 px captures show the corrected icon, equal control sizing, and no overflow.
2. Requirement clarification: the first message must begin below the floating controls, while later scrolling may move content beneath them.
   Fix: the scrollable content now includes a 50 px desktop and 58 px narrow-screen top inset. The inset scrolls away with the messages instead of fixing the content below the header.

## Interactions Tested

- Open and close the mobile sidebar.
- Open the top more menu and verify pin/unpin, rename, move project, and delete actions are present.
- Switch from an ordinary conversation to a project conversation.
- Verify desktop hides menu/new controls while narrow layouts show them.
- Checked browser console: no new errors; only existing Element Plus radio deprecation warnings were present.

final result: passed
