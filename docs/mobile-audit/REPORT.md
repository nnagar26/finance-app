# Phone browser UI audit — 27 September 2026

## Baseline and method

- **Local snapshot:** commit `752a87f790536960b8bacd143215eb2599c69687`, plus the uncommitted `globals.css` and `finance-app.tsx` changes present when the isolated copy was made. Fictional data lived only in `/private/tmp/finance-phone-audit-6okf29_j`; the existing `.local-data/finance.json` was not used.
- **Live site:** [finance-app-beta-beryl.vercel.app](https://finance-app-beta-beryl.vercel.app/), production deployment `b926e4499383e05b6c08943f38c9455ae8ac496e` as shown in Vercel. Production is three commits behind the local `HEAD`, before the uncommitted changes.
- **Test environment:** responsive Chromium browser views at 320×700, 375×812, 390×844, 430×932, and 844×390. Local checks covered all six signed-in pages. Live checks covered login, sign-up, password recovery, and signed-out recovery redirects. No live account was used, per the user's direction.
- **Revision caveat:** `src/components/reports-page.tsx` became modified in the original workspace after the isolated snapshot was made. That later change was not part of this audit.

## Ranked findings

### 1. High — Landscape navigation hides Settings and the account control

**Where:** local signed-in pages, 844×390 landscape. **Reproduce:** open any signed-in page in landscape and try to reach Settings through the sidebar. **Expected:** every destination and the account control can be reached. **Observed:** the sticky sidebar is 390 px tall but its contents need 646 px. Settings begins at y=397.5 and the account control at y=594.6, both below the viewport. Scrolling the page by 666 px leaves those controls in the same off-screen positions. The sidebar does not scroll internally. **Suggested fix:** use the compact mobile navigation at short landscape heights, or allow the desktop sidebar to scroll while keeping its account controls reachable. [Screenshot](landscape-sidebar-844x390.jpg). Relevant styles: `src/app/globals.css` sidebar rule and 780 px breakpoint.

### 2. High — Floating Add button blocks other actions

**Where:** local calendar and transactions at 320×700; also visible over report content. **Reproduce:** open September 2026 calendar and try to tap day 27; open Transactions and try the first row's Delete action. **Expected:** the date and row actions receive the tap. **Observed:** the Add button covers about 1,800 px² of day 27; the date cell's center hits Add instead. The first transaction's 25×30 Delete button also hits Add at its center. Scrolling may move the underlying control, but it is blocked at the observed position. **Suggested fix:** move Add into a reserved navigation or header slot on narrow phones, or otherwise prevent it from overlapping interactive content during scroll. [Calendar screenshot](calendar-320.jpg) · [Transactions screenshot](transactions-320.jpg). Relevant styles: `src/app/globals.css:93` and `:124`.

### 3. Medium — Recurring dialog lets keyboard focus escape behind it

**Where:** local Recurring page, 320×700. **Reproduce:** open New recurring item, focus Close, then press Shift+Tab. **Expected:** focus stays inside the modal. **Observed:** focus moves to the background Add transaction button while the dialog remains open. Tabbing past Save also leaves the dialog. The recurring dialog has no Escape handler or focus restoration; the transaction dialog has both. **Suggested fix:** apply the transaction dialog's focus containment, Escape, and return-focus behavior to the recurring dialog. [Dialog screenshot](recurring-focus-320.jpg). Relevant code: `src/components/recurring-modal.tsx:32` and `src/components/transaction-modal.tsx:30`.

### 4. Medium — Calendar dates are too narrow to tap reliably

**Where:** local calendar at 320×700. **Reproduce:** inspect or select any date in the seven-column grid. **Expected:** comfortable touch targets and readable daily amounts. **Observed:** date buttons are about 39×64 px; several income and expense values truncate to ellipses. This compounds finding 2 where the floating button covers a date. **Suggested fix:** use a mobile week or agenda presentation, or otherwise give date targets more horizontal space and expose full amounts on selection. [Screenshot](calendar-320.jpg). Relevant styles: `src/app/globals.css` calendar grid and 560 px breakpoint.

### 5. Medium — Live landscape sign-in places the form below the first screen

**Where:** live `/login`, 844×390 landscape. **Reproduce:** open the live login page at that viewport. **Expected:** the sign-in form or a clear way to reach it appears immediately. **Observed:** the 526 px introduction appears first; the login card starts at y=547.5, beyond the 390 px viewport. Portrait widths put the form first. **Suggested fix:** keep the login card first when the layout becomes one column, including short landscape viewports, or collapse the introduction at short heights. [Landscape screenshot](live-login-landscape-844x390.jpg) · [Portrait comparison](live-login-320.jpg). Relevant styles: `src/components/login-form.module.css:257` and `:335`.

### 6. Medium — Several phone controls have small tap areas

**Where:** local signed-in pages at 320×700. **Observed sizes:** theme buttons 36×36 px; transaction quick filters 33 px tall; transaction Edit and Delete buttons 25×30 px; month arrows 40×40 px. These require precise taps, especially beside other controls. **Suggested fix:** enlarge each clickable box to roughly 44×44 px while preserving the icon size and spacing. [Transactions screenshot](transactions-320.jpg). Relevant styles: `src/app/globals.css:132` and transaction control rules.

### 7. Low — Page name clips in the narrow top bar

**Where:** local signed-in pages at 320×700. **Observed:** the Transactions label has 53 px available for 90 px of text and displays as “Trans…”. Dashboard, Calendar, Recurring, and Settings also shorten in screenshots. The full page heading remains visible below, so navigation still works. **Suggested fix:** give the page name more room, shorten or relocate adjacent controls, or omit the redundant top-bar title on the smallest phones. [Screenshot](transactions-320.jpg). Relevant styles: `src/app/globals.css:112`–`:115`.

## Coverage and limits

| Flow | Local responsive Chromium | Live public site |
| --- | --- | --- |
| Dashboard, transactions, calendar, reports, recurring, settings | Reviewed at all four portrait widths and landscape; no page-wide horizontal overflow found | Signed-in pages not tested without a disposable login |
| Bottom navigation, month change, filters, chart switches, theme | Worked in the isolated copy | Not applicable to public pages |
| Add/edit transaction and recurring save/post | Worked with fictional isolated data; dialogs scroll at reduced height | Not tested |
| Login, sign-up, forgot password | Not available in local mode | Reviewed at all target widths; portrait pages had no horizontal overflow |
| Signed-out recovery routes | Not applicable | `/account-recovery` and `/reset-password` redirected to `/login` |

These results are **browser viewport tests**, not real iPhone Safari or Android Chrome tests. iPhone Mirroring was locked behind the Mac login, and no Android device was available. Virtual keyboard behavior, safe-area insets, and true 200% browser text zoom remain unverified. The production signed-in version also remains unverified because public-page access was selected for this audit. A real-device follow-up should retest findings 1–6, especially the keyboard and safe-area cases.
