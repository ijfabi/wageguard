# Accessibility

WageGuard is meant to be usable by anyone who needs to check their pay, including people who use a keyboard, a screen reader, magnification, high contrast or reduced motion. This file explains what has been built for that, how it's tested, and what still falls short.

**Target:** [WCAG 2.1](https://www.w3.org/TR/WCAG21/) level AA, plus the WCAG 2.2 minimum target size (24 by 24 pixels).

**Status:** Partly conformant. Every page passes automated checks, but WageGuard hasn't been audited by an accessibility specialist or tested with assistive technology by people who rely on it. The [known issues](#known-issues) below are the parts that are known not to meet the target.

## Display settings

The **Accessibility** button in the header of every page, including the homepage, opens a panel of display settings. The same settings are on the Settings page. They apply immediately, are saved in the browser, and are put in place by a small script before the page is drawn, so the page never flashes in the wrong theme or size.

| Setting   | Options                                 | What it does                                                                          |
| --------- | --------------------------------------- | ------------------------------------------------------------------------------------- |
| Theme     | Match my device, Light, Dark            | Follows the device by default                                                         |
| Text size | Standard, Large (112.5%), Larger (125%) | Scales all text and the spacing measured from it                                      |
| Motion    | Match my device, Reduce motion          | Stops animations and transitions, even if the device doesn't ask for it               |
| Contrast  | Standard, High contrast                 | Darker text and borders, underlined links and a thicker focus outline, in both themes |

The settings are ordinary radio buttons in labelled groups, so they work with a keyboard and are exposed to assistive technology as named radio groups. "Reset to defaults" puts everything back. Nothing is sent to the server: the settings are stored in the browser's local storage under `wg-display`.

## What's built in

**Structure and navigation**

- A "Skip to main content" link is the first thing on every page.
- Each page has one `h1`, headings in order, and landmarks (`header`, `nav`, `main`, `aside`). The current section is marked with `aria-current="page"` in the sidebar, and pages below a list have breadcrumbs back to it.
- On narrow screens the sidebar becomes a menu drawer, a labelled dialog that traps focus and closes with Escape.
- The page language is declared as Australian English (`en-AU`).
- Dialogs trap focus while open, close with Escape, and return focus to the button that opened them.

**Forms**

- Every field has a visible label. Hints and errors are linked to their field with `aria-describedby`, and invalid fields are marked with `aria-invalid`.
- Errors are announced through a live region as well as shown, and a failed CSV import names the exact line.
- Related choices (such as the declarations about the job) are grouped in fieldsets with legends, so each section's title is read with every field in it.
- Two-step sign-in codes use `autocomplete="one-time-code"`, so phones and password managers can fill them, and every QR code has the same key printed as text beside it.
- Links that arrive by email work without any typing: the page reads the token from the link and says clearly when a link has expired, with a way to get a new one.

**Results and data**

- Statuses never rely on colour. Each one is a written label beside a coloured dot. "Matched" is deliberately not shown as a green tick, since WageGuard can't certify a payslip as correct.
- The dashboard chart has a "View as table" button that shows the same numbers as a data table, and the chart itself has a text summary.
- Tables have proper headers, and on narrow screens they scroll inside their own container rather than the whole page scrolling sideways.
- Money is shown with its sign and currency, and times are shown as they appear on the timesheet, without converting time zones.

**Motion on the homepage**

The homepage has decorative animation: a drifting background, an orbiting graphic, a replayed sample audit, counting figures and a scrolling row of quotes.

- Everything that moves on its own for more than five seconds has a pause button (WCAG 2.2.2). The quotes also pause on hover and on keyboard focus.
- With reduced motion turned on (in the panel or in the device settings), nothing animates. The sample audit shows its final result, and the quotes become a static grid.
- The animated parts are hidden from screen readers, which get a plain-text summary instead. The counting figures are read as their final values.
- Content that fades in on scroll is visible from the start without JavaScript, so nothing is lost if scripts don't run.

**Other**

- Focus is always visible, with a thicker outline in high-contrast mode.
- Windows high contrast (forced colours) is respected. Decorative gradients give way to system colours.
- Buttons are at least 24 pixels tall, and most are 36 pixels or more.
- At 320 CSS pixels wide (the same as 400% zoom on a 1280-pixel screen), every page reflows to a single column without scrolling sideways, even with the largest text setting. Wide tables scroll inside their own box.

## How it's tested

| Check                            | How                                                                                                                                       | When              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Automated WCAG 2.1 A and AA scan | axe-core through Playwright, failing on any serious or critical issue                                                                     | Every push, in CI |
| Pages covered                    | The homepage, sign-in, sign-up, and 11 signed-in page states, from an empty account to a finished audit and its explanation               | Every push        |
| Display modes covered            | Default; dark; light with larger text, high contrast and reduced motion; dark with large text, high contrast and reduced motion           | Every push        |
| Keyboard                         | The skip link is tested from the keyboard. A full keyboard-only run through the main journey hasn't been recorded                         | Every push        |
| Display settings                 | A test changes every setting, checks it takes effect, reloads, and resets                                                                 | Every push        |
| Motion                           | A test pauses both animations, then turns on reduced motion and checks that the pause buttons disappear and the quotes are still readable | Every push        |
| Reflow (WCAG 1.4.10)             | A test visits 21 pages at 320 pixels wide with the largest text and fails on any sideways scroll                                          | Every push        |

The tests are in `apps/web/e2e/access.spec.ts`. Automated tools find roughly a third to a half of real accessibility problems, so passing them is a floor, not proof.

## Known issues

| Issue                                                                                           | Who it affects                 | Status                                                                                       |
| ----------------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------- |
| The PDF evidence report is not tagged, so screen readers can't navigate its headings and tables | Screen reader users            | Open. The JSON report and the explanation page carry the same information in accessible form |
| Not tested with real screen readers (NVDA, JAWS, VoiceOver, TalkBack)                           | Screen reader users            | Open                                                                                         |
| No recorded keyboard-only pass through the whole journey                                        | Keyboard users                 | Open                                                                                         |
| Not tested by disabled users, and no specialist audit                                           | Everyone                       | Open                                                                                         |
| Only tested in Chromium                                                                         | Firefox and Safari users       | Open                                                                                         |
| The display settings are saved per browser, not per account                                     | People who use several devices | By design for now, as they contain nothing personal                                          |
| The hero's gradient headline text depends on `background-clip: text`                            | Very old browsers              | A solid fallback colour is set                                                               |

## Reporting a problem

If something in WageGuard is hard or impossible to use, please [open an issue](https://github.com/ijfabi/wageguard/issues) and include the page, what you were trying to do, and the browser and assistive technology you use. Please don't include any real personal or pay details.

Last reviewed 25 October 2026.
