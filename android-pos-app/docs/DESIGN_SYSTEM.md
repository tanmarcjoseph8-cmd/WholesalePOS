# Android Design System

The shared tokens are defined in `src/ui/design-system.css`. Screen styles consume
semantic aliases rather than introducing screen-specific colors.

## Foundations

- Color: canvas, surface, raised surface, subtle surface, border, primary teal,
  blue accent, text levels, success, warning, danger, and information.
- Dark theme: every semantic color has a corresponding dark value; the existing
  setting continues to select the theme.
- Typography: system font stack with named sizes from `xs` through `2xl`, body and
  tight line heights, and medium, semibold, and bold weights.
- Spacing: 4, 8, 12, 16, 24, 32, and 40 px.
- Shape: 4, 6, and 8 px radii for tools, controls, cards, and dialogs.
- Elevation: extra-small, small, and medium shadows.
- Controls: 48 px standard height, 40 px compact height, and 48 px touch targets.
- Layout: 248 px tablet navigation rail, 1480 px content maximum, and existing
  1100, 820, and 560 px responsive breakpoints.
- Motion: 120 and 180 ms presentation transitions, disabled automatically when
  reduced motion is requested.

## Reusable presentation components

- Application shell: responsive navigation rail, mobile top bar, bottom navigation,
  badges, account identity, refresh, and lock controls.
- Buttons and icon buttons: primary, secondary, ghost, danger, wide, disabled,
  focus, hover, and pressed states.
- Form controls: shared inputs, selects, text areas, search fields, toggles, and
  segmented controls.
- Data surfaces: panels, metrics, product tiles, stock summaries, tables, order
  cards, receipt panels, report summaries, and status labels.
- Feedback: loading, empty, error, toast, health, alert, and low-stock states.
- Dialogs: shared backdrop, title, content, and action treatment through the
  existing `ConfirmDialog` and screen dialogs.

## Accessibility and responsiveness

- Active navigation exposes `aria-current="page"`.
- Navigation regions have explicit accessible labels.
- Icon-only controls retain or gain accessible names and tooltips where present.
- Keyboard focus uses a high-contrast blue focus ring.
- Interactive controls meet a 48 px target where layout permits.
- Statuses use icons/text and colored surfaces rather than color alone.
- Mobile navigation remains horizontally scrollable so no route is removed.
- Reduced-motion preferences disable nonfunctional transitions.
