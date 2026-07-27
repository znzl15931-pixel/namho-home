---
name: Sunset Amber Home
colors:
  surface: '#fef9f1'
  surface-dim: '#ded9d2'
  surface-bright: '#fef9f1'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f8f3eb'
  surface-container: '#f2ede5'
  surface-container-high: '#ece8e0'
  surface-container-highest: '#e7e2da'
  on-surface: '#1d1c17'
  on-surface-variant: '#554336'
  inverse-surface: '#32302b'
  inverse-on-surface: '#f5f0e8'
  outline: '#887364'
  outline-variant: '#dbc2b0'
  surface-tint: '#904d00'
  primary: '#8d4b00'
  on-primary: '#ffffff'
  primary-container: '#b15f00'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb77d'
  secondary: '#795900'
  on-secondary: '#ffffff'
  secondary-container: '#ffc329'
  on-secondary-container: '#6f5100'
  tertiary: '#825100'
  on-tertiary: '#ffffff'
  tertiary-container: '#a36700'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdcc3'
  primary-fixed-dim: '#ffb77d'
  on-primary-fixed: '#2f1500'
  on-primary-fixed-variant: '#6e3900'
  secondary-fixed: '#ffdf9f'
  secondary-fixed-dim: '#ffdf9f'
  on-secondary-fixed: '#261a00'
  on-secondary-fixed-variant: '#5c4300'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#fef9f1'
  on-background: '#1d1c17'
  surface-variant: '#e7e2da'
  shadow-dark: rgba(217, 119, 6, 0.15)
  shadow-light: '#ffffff'
  terminal-bg: '#1e1e1e'
  terminal-text: '#fde68a'
typography:
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  data-lg:
    fontFamily: JetBrains Mono
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -1px
  data-sm:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 1px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-max: 480px
  gutter: 1rem
  margin-mobile: 1.25rem
  stack-sm: 0.5rem
  stack-md: 1rem
  stack-lg: 2rem
---

## Brand & Style

The design system is centered around the **Sunset Amber** theme, evoking a sense of warmth, energy, and high-tech comfort. It targets tech-savvy homeowners and students who value a tactile, interactive experience.

The visual style is a sophisticated blend of **Neomorphism (Soft UI)** and **Modern Glassmorphism**. 
- **Neomorphism** is used for the primary control interface to provide a physical, "squishy" feel to digital buttons and cards, simulating a real-world control panel.
- **Glassmorphism** is applied to navigation and overlays to ensure the interface feels airy and modern, preventing the soft-shadow aesthetic from becoming visually heavy.
- **Minimalist** layouts with generous whitespace ensure that the complex sensor data remains readable and the primary focus.

## Colors

This design system uses a monochrome-adjacent amber palette to maintain high energy and warmth. 

- **Primary Amber (#d97706)** is used for active states, primary buttons, and critical sensor feedback.
- **Background (#fdf8f0)** provides a warm, off-white canvas that allows the neomorphic shadows to remain soft rather than muddy.
- **Named Colors**: 
    - `shadow-dark` is a tinted amber-gray to ensure shadows look natural on the warm background.
    - `terminal-bg` and `terminal-text` are reserved for the log panel to provide a high-contrast, "dev-mode" aesthetic.

## Typography

The typography strategy splits duties between brand expression and functional data. 

- **Plus Jakarta Sans** is the primary UI typeface, chosen for its friendly yet professional geometric forms. It handles all headings, labels, and descriptive text.
- **JetBrains Mono** is utilized strictly for sensor readings, numerical values, and the terminal log. This provides a clear "technical" distinction for data that is being pulled live from the ESP32 hardware.

For mobile accessibility, `headline-lg` is capped at 24px to ensure dashboard cards do not overflow on smaller devices.

## Layout & Spacing

This design system follows a **Fixed Grid (Mobile-First)** philosophy. Since the primary use case is a handheld remote dashboard, the layout is optimized for a `max-width` of 480px.

- **Stacking**: Elements should follow a vertical stack with `stack-md` spacing between related items and `stack-lg` between distinct sections (e.g., between the Header and the Sensor Grid).
- **Margins**: A consistent side margin of `1.25rem` ensures content does not touch the edge of mobile screens.
- **Grid**: Sensor cards should be displayed in a 2-column fluid grid within the 480px container to maximize information density.

## Elevation & Depth

Depth is the core identity of this design system, achieved through **Neomorphic Shadows** and **Glassmorphic Blurs**.

1.  **Raised State (Standard Cards/Buttons)**: 
    - Use two light sources. 
    - Bottom-Right: `6px 6px 12px` using `shadow-dark`.
    - Top-Left: `-6px -6px 12px` using `shadow-white`.
    - This creates the illusion of the UI element being extruded from the background.

2.  **Sunken State (Active/Inputs)**:
    - Used for pressed buttons, the terminal panel, and text input fields.
    - Top-Left (Inset): `inset 4px 4px 8px` using `shadow-dark`.
    - Bottom-Right (Inset): `inset -4px -4px 8px` using `shadow-white`.

3.  **Glassmorphism**: 
    - Reserved for the bottom navigation bar and the "Connection Overlay."
    - Implementation: `background: rgba(253, 248, 240, 0.7)`, `backdrop-filter: blur(12px)`, and a subtle `1px` border using `primary-amber` at 10% opacity.

## Shapes

The shape language is **Rounded**, which is essential for the neomorphic effect to look organic. 

- All standard dashboard cards use `rounded-lg` (1rem).
- Control buttons use `rounded-lg` or `rounded-xl` depending on their scale.
- The terminal panel uses a smaller `rounded-sm` (0.25rem) to maintain a more "rigid" technical feel.
- Avoid sharp corners entirely as they break the soft-shadow illusion.

## Components

### Buttons
- **Primary**: Neomorphic "Raised" state. On click, transition to "Sunken."
- **Icon Buttons**: Use Primary Amber for the icon color. No borders, just the shadow-driven depth.

### Sensor Cards
- Display a `label-caps` title, a large `data-lg` value, and a small `data-sm` unit.
- Include a small refresh icon in the top right, styled as a miniature neomorphic button.

### Terminal Log Panel
- Background: `#1e1e1e`.
- Text: `jetbrainsMono` in `#fde68a`.
- Shadow: Always in the "Sunken" state to look like a screen recessed into the dashboard.

### Bottom Navigation
- Fixed to the viewport bottom.
- Apply `backdrop-filter: blur(12px)`.
- Use the `primary_color` for active icons and a neutral gray for inactive ones.

### Connection Overlay
- Full-screen glassmorphic blur covering the dashboard until the BLE handshake is complete.
- Central card should be "Raised" with a pulsating Amber connection icon.
