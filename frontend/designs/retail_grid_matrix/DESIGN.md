---
name: Retail Grid Matrix
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#45474c'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#75777d'
  outline-variant: '#c5c6cd'
  surface-tint: '#545f73'
  primary: '#091426'
  on-primary: '#ffffff'
  primary-container: '#1e293b'
  on-primary-container: '#8590a6'
  inverse-primary: '#bcc7de'
  secondary: '#4b41e1'
  on-secondary: '#ffffff'
  secondary-container: '#645efb'
  on-secondary-container: '#fffbff'
  tertiary: '#00190e'
  on-tertiary: '#ffffff'
  tertiary-container: '#00301f'
  on-tertiary-container: '#24a375'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d8e3fb'
  primary-fixed-dim: '#bcc7de'
  on-primary-fixed: '#111c2d'
  on-primary-fixed-variant: '#3c475a'
  secondary-fixed: '#e2dfff'
  secondary-fixed-dim: '#c3c0ff'
  on-secondary-fixed: '#0f0069'
  on-secondary-fixed-variant: '#3323cc'
  tertiary-fixed: '#85f8c4'
  tertiary-fixed-dim: '#68dba9'
  on-tertiary-fixed: '#002114'
  on-tertiary-fixed-variant: '#005137'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-sm:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
    letterSpacing: 0.01em
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 12px
    letterSpacing: 0.04em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 0.75rem
  gutter-desktop: 1rem
  margin: 0.75rem
  margin-desktop: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.375rem
  space-md: 0.625rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system is engineered for multi-location inventory logistics and point-of-sale retail management. It prioritizes operational velocity, tactile confidence, and visual clarity across handheld barcode terminals, counter tablets, and desktop back-office dashboards.

### Aesthetic Paradigm
- **Industrial Precision**: Flat slate panels with subtle hair-thin borders (`1px`), clean geometric partitions, and zero artificial fluff.
- **Offline-First Clarity**: Persistent state indicators communicate local storage health, cloud synchronization streams, and background queue statuses without breaking operational flow.
- **Data-Dense Utilitarianism**: Compact metric displays, tightly nested inventory matrices, and strict alignment tailored for scanning barcodes, auditing bulk variants (SKU/size/color), and fast-tender cash wraps.

## Colors

The palette relies on a surgical, high-contrast slate architecture balanced by unmistakable operational status hues.

- **Primary Canvas & Neutral Surfaces**: Base canvas `#f8fafc` (Slate-50), layered against `#ffffff` cards and `#f1f5f9` (Slate-100) active sub-panels. Borders maintain a crisp `#e2e8f0` (Slate-200) boundary.
- **Command & Primary Action**: `#1e293b` (Slate-900) anchors primary execution controls, primary navigation states, and high-priority commands.
- **System Accent**: `#4f46e5` (Indigo-600) highlights selection ranges, active POS tabs, and editable cell focus boundaries.
- **Operational Status & Telemetry**:
  - **Online / Synced / Stock Surplus**: `#10b981` (Emerald-500) paired with `#ecfdf5` background tints.
  - **Sync Queue / Pending Write / Attention**: `#f59e0b` (Amber-500) paired with `#fffbeb` background tints.
  - **Discrepancy / Offline Fault / Negative Stock**: `#f43f5e` (Rose-500) paired with `#fff1f2` background tints.

## Typography

Typography balances rapid scanning and error-free numerical auditing.

- **Primary Interface**: **Hanken Grotesk** delivers sharp geometric neutrality with condensed vertical proportions, allowing high packing density across item descriptions and navigation.
- **Tabular Data & Telemetry**: **JetBrains Mono** is enforced across all barcodes, serial markers, stock units, monetary amounts, and batch sync timestamps to ensure uniform columnar alignment during dynamic tally updates.
- **Numerical Alignment**: Numeric tabular elements must strictly employ `font-variant-numeric: tabular-nums` to eliminate layout jitter during high-throughput scanning.

## Layout & Spacing

The layout model adapts between a rigid 12-column operational desktop view and a vertically stacked, thumb-optimized POS sheet layout.

### Viewport Structures
- **Desktop (1024px+)**: Dual-pane or three-column modular architecture (Persistent Navigation / Product Catalog / Active Transaction or Batch Slip). Master canvas utilizes a `12px` gutter scale to maximize screen real estate.
- **Tablet / Mobile (< 1024px)**: Collapsible sidebar transforms into an offline floating status bar. Grid snaps to a dynamic 1-column layout with pinned bottom action bars (`48px` minimum height).

### Spacing Philosophy
Compact micro-spacing ensures high information density. Internal component margins maintain tight `0.25rem` (`space-xs`) and `0.375rem` (`space-sm`) cadences to display maximum rows above the fold.

## Elevation & Depth

This system avoids soft multi-layer blur shadows, replacing them with flat structural tiers and razor-thin borders.

- **Surface Tiers**:
  - **Level 0 (Canvas)**: `#f8fafc` base page tone.
  - **Level 1 (Card/Container)**: `#ffffff` surface with a continuous `1px solid #e2e8f0` stroke.
  - **Level 2 (Active/Selected Row)**: `#f8fafc` tint with a `1.5px solid #4f46e5` left or enclosing outline.
  - **Level 3 (Modal / Flyout Panel / POS Receipt Drawer)**: `#ffffff` with a crisp directional keyline drop: `0 4px 12px -2px rgba(15, 23, 42, 0.08), 0 1px 3px 0 rgba(15, 23, 42, 0.04)` wrapped in a `1px solid #cbd5e1` edge.
- **Visual Boundaries**: Depth is achieved by contrast differential rather than blur extrusion, ensuring maximum visual performance on low-power POS terminals.

## Shapes

The design system adopts a crisp, modern operational aesthetic with restrained rounding (`roundedness: 1`).

- **Base Components (Inputs, Buttons, Badges)**: Bound to `0.25rem` (4px). Corners are structured and precise, evoking professional back-office utility.
- **Structural Containers (Modals, Large Cards)**: Bound to `0.5rem` (8px).
- **Status Indicators & Micro Tags**: Pill elements (`rounded-full`) are reserved exclusively for sync status dots, item size badges (e.g., `42`, `XL`), and live connectivity indicators.

## Components

### Buttons & Interactive Controls
- **Primary Command**: Slate-900 background, pure white text, `height: 36px` (desktop) / `44px` (touch-optimized POS). Active states drop opacity to `90%` with a `1px` inner ring.
- **Secondary Action**: White fill, `1px solid #cbd5e1`, text Slate-700. Hover state applies `#f1f5f9`.
- **Destructive/Void**: Rose-50 background, `1px solid #fecdd3`, Rose-700 text.

### Data Inputs & Scanner Fields
- **Barcode Input Fields**: Inset background (`#ffffff`), `1px solid #cbd5e1`, heightened `JetBrains Mono` text. Auto-focus states render an active `#4f46e5` outer ring (`2px`). Leading Lucide scanner or search icon fixed in `#94a3b8`.
- **Inline Table Editors**: Flat inputs without default borders; border reveals in `#6366f1` on cell hover or navigation focus.

### Status Chips & Badges
- **Online / Synced**: `#ecfdf5` background, `#047857` text, leading `6px` solid Emerald-500 circle.
- **Outbox Pending (Offline Queue)**: `#fffbeb` background, `#b45309` text, Amber-500 pulsing indicator. Accompanied by pending transaction count (e.g., `SYNC: 14`).
- **Discrepancy / Mismatch**: `#fff1f2` background, `#be123c` text, Rose-500 alert mark.

### Data Tables & Matrix Views
- **Header**: `#f8fafc` background, uppercase tracking with `label-sm` (`JetBrains Mono`), `32px` height.
- **Rows**: Alternating hover highlights, `40px` compact row height. Quantitative data (Quantity, Price, Cost, Margin) must be right-aligned with monospace font definitions.

### Offline Banner & Sync Bar
- Affixed edge-to-edge system strip: `28px` height, `#1e293b` slate body, displaying real-time worker thread status, pending mutations queue, and manual force-sync trigger.