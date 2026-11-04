# PIOS Notes Editor — implementation scope

## Scope
This milestone changes only the right-hand note editor. The sidebar, folders, notes list, Personal Knowledge panel, and other PIOS modules remain unchanged.

## Top-right actions
- Close editor
- Minimise editor
- Full-screen editor
- Pin / unpin
- Archive / restore
- Overflow menu: permanently delete, duplicate note, export HTML, export PDF

Permanent deletion must require confirmation. Export PDF should use a print-ready note document and the browser's Save as PDF flow. HTML export should download a standalone document.

## Cover
- Add a Notion-style cover region above the note title.
- Allow selecting/removing a cover and positioning it.
- Persist cover metadata with the note, rather than only in component state.

## Floating editing tools
- Rich-text toolbar is a floating, draggable palette.
- Keep text formatting, headings, links, lists, checklists, tables, code, and embeds accessible.
- Drawing palette is independently floating and supports pen, highlighter, eraser, lasso, selection, shapes, and image insertion.
- Typed blocks and ink strokes coexist on the same page.

## Slash command behaviour
- Typing `/` at an empty block opens a filtered command menu.
- Selecting a command transforms the current empty block only.
- Bulleted and numbered list commands create one empty list item; never seed “First item” / “Second item” placeholder content.
- Escape closes the menu; keyboard navigation and Enter selection should be supported.

## PIOS assistant
- Replace the inline “Organise this note with PIOS” section with a floating assistant launcher in the bottom-right of the editor.
- The assistant panel should open on demand and adapt actions to the current selection/context.

## Data and persistence
- Extend note persistence/API with cover metadata and editor document data.
- Preserve existing HTML note content during migration.
- Store ink strokes and media references as structured editor objects; do not flatten them into HTML strings.
- Keep ownership checks and server-side sanitisation for exports and stored content.

## Delivery sequence
1. Editor chrome, top-right actions, cover, floating rich-text toolbar, slash menu, exports.
2. Drawing/ink layer with persistence and pointer/Apple Pencil support.
3. Floating Ask PIOS assistant and contextual actions.
4. Browser testing, responsive behaviour, keyboard accessibility, and regression tests.
