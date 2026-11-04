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
- Keep typed rich-text content and a visual drawing canvas in the same note.
- Embed the Excalidraw React editor for freehand drawing, selection, erasing, shapes, arrows, lines, text, image insertion, zoom/pan, undo/redo, and its native drawing export workflow.
- Persist the Excalidraw scene (elements, relevant canvas settings, and embedded file data) as structured JSON in the note's existing ink_data field.
- Save the latest scene together with the note when the user selects Save changes.
- The drawing canvas is currently a dedicated visual section below the typed editor body. Interleaving movable drawings between arbitrary rich-text blocks remains a separate follow-up enhancement.

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
2. Embedded Excalidraw drawing canvas and per-note structured scene persistence.
3. Floating Ask PIOS assistant and contextual actions.
4. Browser testing, responsive behaviour, keyboard accessibility, and regression tests.

## Current drawing implementation
- @excalidraw/excalidraw is loaded client-side because the editor depends on browser APIs.
- The canvas is mounted in a fixed-height visual section within the note editor, beneath the typed content.
- Scene updates are staged in the editor and included in the existing Save changes operation; the latest scene is read at save time to avoid losing the final stroke during the debounce window.
- The stored payload uses a PIOS wrapper (pios-excalidraw-v1) around Excalidraw elements, canvas settings, and binary files.
- Manual browser validation is still required after pulling the branch.
