# Class Chat AI - UI Style Guide

**Version**: 1.0
**Last Updated**: 2025-09-30
**Product**: Class Chat AI Study Assistant

---

## 🎯 Design Philosophy

Class Chat AI employs a **modern, professional dark theme** optimized for extended study sessions. The design prioritizes:

- **Clarity**: High contrast for readability during long study sessions
- **Focus**: Minimal distractions, content-first approach
- **Trust**: Professional appearance that feels reliable and intelligent
- **Accessibility**: WCAG AA compliant contrast ratios

---

## 🎨 Color System

### Primary Colors
The primary blue represents intelligence, trust, and technology.

```css
--primary-main: #0EA5E9;      /* Sky blue - main brand color */
--primary-dark: #0284C7;      /* Darker blue for hover states */
--primary-light: #38BDF8;     /* Light blue for accents */
--primary-bg: #082F49;        /* Deep blue for colored backgrounds */
```

**Usage**:
- Primary actions (buttons, links)
- Active navigation states
- Brand elements (logo accent)
- Loading indicators

### Neutral Palette
A carefully balanced gray scale for the dark theme.

```css
--neutral-900: #0F172A;       /* Darkest - main background */
--neutral-800: #1E293B;       /* Card backgrounds, elevated surfaces */
--neutral-700: #334155;       /* Secondary surfaces, sidebar */
--neutral-600: #475569;       /* Borders, dividers */
--neutral-500: #64748B;       /* Disabled text, placeholders */
--neutral-400: #94A3B8;       /* Secondary text */
--neutral-300: #CBD5E1;       /* Primary text on dark */
--neutral-200: #E2E8F0;       /* Hover text states */
--neutral-100: #F1F5F9;       /* Lightest - use sparingly */
```

**Usage**:
- Backgrounds: 900, 800, 700
- Text: 300 (primary), 400 (secondary), 500 (disabled)
- Borders: 600
- Hover states: 200

### Semantic Colors
Consistent color language for system feedback.

```css
--success: #10B981;           /* Green - success states */
--warning: #F59E0B;           /* Amber - warnings */
--error: #EF4444;             /* Red - errors, destructive actions */
--info: #3B82F6;              /* Blue - informational */
```

**Usage**:
- Toasts and notifications
- Form validation
- Status indicators
- Badges

### Accent Colors
Special accent colors for unique features.

```css
--accent-teal: #14B8A6;       /* Teal - citations, references */
--accent-purple: #A78BFA;     /* Purple - AI features, premium */
```

**Usage**:
- Citation badges
- Document references
- AI response indicators
- Premium features

---

## 📝 Typography

### Font Families

```css
--font-primary: 'Inter', 'Helvetica Neue', system-ui, -apple-system, sans-serif;
--font-mono: 'Fira Code', 'Consolas', 'Monaco', monospace;
```

**Import** (add to index.html or CSS):
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```

### Type Scale

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| `h1` | 2.5rem (40px) | 700 | 1.2 | Page titles |
| `h2` | 2rem (32px) | 600 | 1.3 | Section headers |
| `h3` | 1.5rem (24px) | 600 | 1.4 | Subsection headers |
| `h4` | 1.25rem (20px) | 600 | 1.4 | Card titles |
| `body-large` | 1.125rem (18px) | 400 | 1.6 | Chat messages, important text |
| `body` | 1rem (16px) | 400 | 1.6 | Standard body text |
| `body-small` | 0.875rem (14px) | 400 | 1.5 | Secondary text, captions |
| `button` | 0.875rem (14px) | 600 | 1 | Button labels (uppercase) |
| `caption` | 0.75rem (12px) | 500 | 1.4 | Metadata, timestamps |

### Font Weights

```css
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
--font-extrabold: 800;
```

---

## 📏 Spacing System

Consistent spacing creates visual rhythm and hierarchy.

```css
--space-xs: 0.25rem;    /* 4px */
--space-sm: 0.5rem;     /* 8px */
--space-md: 1rem;       /* 16px */
--space-lg: 1.5rem;     /* 24px */
--space-xl: 2rem;       /* 32px */
--space-2xl: 3rem;      /* 48px */
--space-3xl: 4rem;      /* 64px */
```

**Usage Guidelines**:
- Component padding: `md` (16px) or `lg` (24px)
- Gap between elements: `sm` (8px) or `md` (16px)
- Section spacing: `xl` (32px) or `2xl` (48px)
- Page margins: `2xl` (48px) or `3xl` (64px)

---

## 🔲 Border Radius

Rounded corners soften the interface and create hierarchy.

```css
--radius-sm: 0.375rem;   /* 6px - tight elements, tags */
--radius-md: 0.5rem;     /* 8px - buttons, inputs */
--radius-lg: 0.75rem;    /* 12px - cards, chat bubbles */
--radius-xl: 1rem;       /* 16px - modals, large surfaces */
--radius-full: 9999px;   /* Pills, avatars */
```

---

## 💫 Shadows

Elevation through subtle shadows.

```css
--shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.3);
--shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4);
--shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.5);
--shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.6);
--shadow-glow: 0 0 20px rgba(14, 165, 233, 0.4);
```

**Usage**:
- Cards: `shadow-md`
- Modals: `shadow-xl`
- Hover states: elevate by one level
- Focus states: `shadow-glow`

---

## 🎭 Component Patterns

### Buttons

#### Primary Button
```css
background: var(--primary-main);
color: white;
padding: 0.625rem 1.5rem;
border-radius: var(--radius-md);
font-weight: var(--font-semibold);
box-shadow: var(--shadow-sm);
transition: all 200ms ease;

/* Hover */
background: var(--primary-dark);
box-shadow: var(--shadow-md);
transform: translateY(-1px);

/* Active */
transform: translateY(0);
box-shadow: var(--shadow-sm);

/* Disabled */
background: var(--neutral-600);
color: var(--neutral-500);
cursor: not-allowed;
```

#### Secondary Button
```css
background: var(--neutral-700);
color: var(--neutral-300);
border: 1px solid var(--neutral-600);

/* Hover */
background: var(--neutral-600);
color: white;
```

#### Ghost Button
```css
background: transparent;
color: var(--primary-main);

/* Hover */
background: var(--neutral-800);
```

#### Danger Button
```css
background: var(--error);
color: white;

/* Hover */
background: #DC2626;
```

---

### Cards

```css
background: var(--neutral-800);
border: 1px solid var(--neutral-700);
border-radius: var(--radius-lg);
padding: var(--space-lg);
box-shadow: var(--shadow-md);
transition: all 250ms ease;

/* Hover (interactive cards) */
box-shadow: var(--shadow-lg);
transform: translateY(-2px);
border-color: var(--neutral-600);
```

---

### Input Fields

```css
background: var(--neutral-900);
color: var(--neutral-300);
border: 1px solid var(--neutral-600);
border-radius: var(--radius-md);
padding: 0.625rem 0.875rem;
font-size: 1rem;
transition: all 200ms ease;

/* Focus */
border: 2px solid var(--primary-main);
box-shadow: var(--shadow-glow);
outline: none;

/* Label (floating) */
color: var(--neutral-400);
font-size: 0.875rem;
transition: all 200ms ease;

/* Label (focused/filled) */
color: var(--primary-main);
transform: translateY(-1.25rem) scale(0.85);
```

---

### Navigation Links

```css
color: var(--neutral-300);
background: var(--neutral-800);
padding: 0.5rem 1.25rem;
border-radius: var(--radius-md);
font-weight: var(--font-semibold);
text-transform: uppercase;
letter-spacing: 0.05em;
transition: all 200ms ease;

/* Hover */
background: var(--neutral-700);
color: white;

/* Active */
background: var(--primary-bg);
color: var(--primary-light);
border-left: 3px solid var(--primary-main);
```

---

### Chat Bubbles

#### User Message
```css
background: var(--neutral-700);
color: var(--neutral-300);
border-radius: var(--radius-lg);
padding: var(--space-md);
box-shadow: var(--shadow-sm);
```

#### Assistant Message
```css
background: linear-gradient(135deg, var(--primary-bg) 0%, rgba(8,47,73,0.6) 100%);
color: var(--neutral-300);
border-radius: var(--radius-lg);
padding: var(--space-md);
box-shadow: var(--shadow-sm);
border-left: 3px solid var(--primary-main);
```

---

### Citations

```css
display: inline-block;
background: #E0F2FE;
color: var(--primary-dark);
padding: 0.125rem 0.5rem;
border: 1px solid var(--primary-main);
border-radius: var(--radius-full);
font-size: 0.875rem;
font-weight: var(--font-medium);
cursor: pointer;
transition: all 150ms ease;

/* Hover */
background: var(--primary-main);
color: white;
transform: scale(1.05);
```

---

### Sidebar

```css
background: rgba(0, 77, 86, 0.07);
backdrop-filter: blur(10px);
border-right: 1px solid var(--neutral-700);
box-shadow: var(--shadow-md);

/* List items */
padding: 0.5rem 0.75rem;
color: var(--neutral-300);
border-radius: var(--radius-md);
transition: background 150ms ease;

/* Hover */
background: rgba(255, 255, 255, 0.05);

/* Active */
background: var(--primary-bg);
color: var(--primary-light);
```

---

## 🎬 Transitions & Animations

### Timing Functions
```css
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--ease-out: cubic-bezier(0.0, 0, 0.2, 1);
--ease-in: cubic-bezier(0.4, 0, 1, 1);
```

### Standard Transitions
```css
/* Fast - hover states, color changes */
transition: all 150ms var(--ease-out);

/* Medium - transforms, layout shifts */
transition: all 250ms var(--ease-in-out);

/* Slow - page transitions, major changes */
transition: all 400ms var(--ease-in-out);
```

### Loading Animation
```css
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.loader {
  animation: pulse 2s var(--ease-in-out) infinite;
}
```

---

## ♿ Accessibility

### Contrast Ratios
- **Normal text**: Minimum 4.5:1 (AAA: 7:1)
- **Large text** (18px+): Minimum 3:1 (AAA: 4.5:1)
- **UI components**: Minimum 3:1

### Focus States
All interactive elements must have visible focus indicators:
```css
outline: 2px solid var(--primary-main);
outline-offset: 2px;
box-shadow: var(--shadow-glow);
```

### Color Blindness
Never use color alone to convey information. Supplement with:
- Icons
- Text labels
- Patterns or textures

---

## 📱 Responsive Breakpoints

```css
/* Mobile */
@media (max-width: 639px) { /* sm */ }

/* Tablet */
@media (min-width: 640px) and (max-width: 1023px) { /* md */ }

/* Desktop */
@media (min-width: 1024px) { /* lg */ }

/* Large Desktop */
@media (min-width: 1280px) { /* xl */ }
```

---

## 🎯 Implementation Checklist

### Phase 1: Foundation
- [ ] Create centralized theme file
- [ ] Update global CSS with design tokens
- [ ] Import Inter font family
- [ ] Remove unused Yantramanav font

### Phase 2: Components
- [ ] Refactor Header navigation
- [ ] Update all button variants
- [ ] Standardize card styling
- [ ] Refine input fields
- [ ] Polish sidebar

### Phase 3: Pages
- [ ] Login/Signup pages
- [ ] Chat page
- [ ] Upload page
- [ ] Profile page

### Phase 4: Details
- [ ] Add smooth transitions
- [ ] Implement shadow system
- [ ] Update icon styling
- [ ] Refine citation badges
- [ ] Polish loading states

---

## 📚 Resources

### Design Tokens Location
`frontend/src/theme/tokens.ts` - Centralized design tokens

### Component Library
Material UI v6 with custom theme overrides

### Icons
Material Icons (@mui/icons-material)

---

## 🔄 Version History

### v1.0 (2025-09-30)
- Initial style guide creation
- Established color system
- Defined typography scale
- Component pattern documentation
