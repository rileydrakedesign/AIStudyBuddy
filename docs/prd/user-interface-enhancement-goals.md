# User Interface Enhancement Goals

## Integration with Existing UI

The Class Chat AI frontend is currently built with **React 18 + Vite + Material UI v6** with a component-based architecture. The existing design system uses:

- **UI Framework**: Material UI 6.1.9 with custom theme (primary color scheme established)
- **Component Library**: Mix of Material UI components and Radix UI primitives
- **Styling Approach**: TailwindCSS for utility classes + Material UI's styling system
- **Layout Pattern**: Left sidebar navigation + main content area + (optional) right document viewer
- **State Management**: React hooks and context (AuthContext for global auth state)

**Current UI Patterns to Preserve**:
- JWT-based auth with HTTP-only cookies (AuthContext manages login state)
- Material UI theme consistency (colors, typography, spacing)
- Existing loading states (skeleton loaders, spinners)
- Toast notifications for user feedback (currently using default positioning)
- Markdown rendering pipeline (react-markdown with syntax highlighting, KaTeX math)

**Design System Constraints**:
- Must maintain existing color palette and branding (ClassChat AI blue/purple theme)
- Must use Material UI components where available (Button, TextField, Dropdown, etc.)
- Must preserve existing responsive breakpoints (though mobile will be blocked)

## Modified/New Screens and Views

**1. Enhanced Sidebar**

**Current State**: Simple vertical list of classes, separate sections for documents and chats

**New Design**:
- Class dropdown selector at top (Material UI Select with autocomplete for 10+ classes)
- Sections for selected class: Documents, Chats, Saved Materials (collapsible accordions)
- Recent Chats (All) section showing recent chats across all classes with class badges
- Softer border radius (8px), smooth animations (300ms ease-in-out), hover states

**Interaction Requirements**:
- Clicking document opens document viewer in right panel
- Clicking chat loads chat session in main area
- Clicking saved material opens in editable view (markdown editor)
- Recent chats show class badge (small colored chip with class code)

---

**2. Chat Interface with Special Response Formatting**

**New Design**:

**Study Guide Response** (special formatting):
- Blue border + book icon (Material UI `MenuBook`)
- Subtle background tint (blue at 5% opacity)
- Save and Download action buttons below content

**Summary Response** (special formatting):
- Green border + document icon (Material UI `Description`)
- Subtle background tint (green at 5% opacity)
- Save and Download action buttons below content

**Quote Response** (special formatting):
- Purple border + quote icon (Material UI `FormatQuote`)
- Subtle background tint (purple at 5% opacity)
- Save and Download action buttons below content

**Visual Differentiation**:
- Creates visual hierarchy (user immediately recognizes study guide vs. normal answer)
- Save button triggers modal: "Save as..." with name input

---

**3. Document Viewer with Summary Toggle**

**New Design**:
- Toggle buttons in header: [📄 PDF | 📝 Summary]
- Summary view renders markdown with jump-links to sections
- Toggle maintains state (PDF vs Summary) when switching documents

**Interaction**:
- Click "Summary" → markdown summary displays
- Click "PDF" → PDF viewer displays
- Clicking section in summary scrolls to that section (within summary view)

---

**4. Profile Page Enhancements**

**New Design**:
- Email change button (triggers verification flow)
- Password change button (requires current password)
- Delete Account button (red, bottom of page)

**Delete Account Flow**:
1. Click "Delete Account" → Modal appears
2. Modal: "Are you sure? This action cannot be undone. All your classes, documents, and chats will be permanently deleted."
3. Input field: "Type DELETE to confirm"
4. Button: "Permanently Delete Account" (disabled until "DELETE" typed)

---

**5. Mobile Blocking Page**

**Design**:
- Class Chat AI logo at top
- 📱 icon with "Mobile Not Supported Yet" heading
- Explanation text: "Class Chat AI requires a desktop browser for the best experience. Please visit on your laptop or desktop computer."
- "Learn More" and "Email Me a Link" buttons

**Implementation**:
- Detect mobile via `navigator.userAgent` or viewport width <768px
- Show blocking page instead of router (wrap `App.tsx` in device check)

---

**6. Formula Rendering Fixes**

**Fix**:
- Wrap formula rendering in error boundary (show LaTeX source if KaTeX fails)
- Apply `overflow-x: auto` to formula containers with `max-width: 100%`
- Document chat window CSS: `max-height: calc(100vh - 200px); overflow-y: auto;` (fixed height)

---

**7. Toast Notification Repositioning**

**Fix**:
- Reposition to bottom-right (Material UI Snackbar `anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}`)
- Adjust z-index to ensure visibility above other elements

## UI Consistency Requirements

**Visual Consistency**:
- All new UI elements shall use existing Material UI theme tokens
- Color palette shall remain unchanged (primary blue, secondary purple, success green, error red)
- Typography shall follow existing hierarchy (H1-H6, body text, captions)
- Spacing shall use Material UI's 8px grid system (theme.spacing())

**Interaction Consistency**:
- All form inputs shall validate on blur and show inline error messages
- Loading states shall use existing skeleton loaders or Material UI CircularProgress
- Confirmation modals shall use existing dialog component patterns
- Keyboard navigation shall work for all interactive elements (tab order, Enter to submit, Esc to close)

**Accessibility Requirements**:
- All new UI elements shall have proper ARIA labels
- Color contrast shall meet WCAG AA standards (4.5:1 for normal text)
- Focus indicators shall be visible for keyboard navigation
- Screen reader announcements for dynamic content (new chat message, document processed)

**Responsive Behavior** (Desktop Only):
- Sidebar shall collapse to icon-only on narrow desktop screens (1024px-1280px)
- Main content area shall expand to fill available space
- Document viewer shall stack below chat on medium screens (1024px-1440px)
- All layouts shall support 1280x720 minimum resolution

---
