# Changelog

User-facing changes to MuseumOS, newest first. Internal refactors and
plumbing-only commits are intentionally omitted.

## 2026-06-20

### Added
- **Add your own filters to exhibit search.** In **Exhibits → Filters**, pick a
  category and use **+ Add filter** to narrow results by that category's own
  fields — e.g. Author or Publisher for Books — on top of the built-in filters.
  The control matches the field: a fixed-list field becomes a dropdown, a yes/no
  field a yes/no, and a free-text field a search box that matches anywhere in the
  value (accent- and case-insensitive, and forgiving of the Greek final sigma —
  typing `κλειδαριθμοσ` finds `Κλειδάριθμος`), suggesting values already in use.
  Filters you add are remembered per category in your browser; the active values
  ride in the page URL so a filtered search can be bookmarked or shared, and they
  are also honoured by Export and "select all matching".

### Changed
- **Add a donor with all their details at once.** **Donors → Add donor** now
  opens a full form instead of just a name box: father/contact, first-donation
  date, address, city, phone, email, tax ID (admin-only), notes, the "Shown in
  Site" toggle, and **donation forms** (drag-and-drop images or PDFs) — all
  captured up front. The forms upload automatically once the donor is saved, and
  you still land on the new donor's profile.
- **Confirm before removing a category field.** In **Categories → Manage
  fields**, the delete (trash) button now asks **"Delete this field?"** with
  Cancel / Delete inline before the row is removed — and, as before, nothing is
  saved until you press Save.
- **Refined Dark theme.** The Dark theme now uses the public site's typography
  (Bricolage Grotesque headings, Hanken Grotesk body, JetBrains Mono for codes),
  the category icons read as subtly tinted, ringed tokens instead of flat white
  discs, and the decorative header strip is woven into the dark background as a
  faint texture rather than a bright band.

## 2026-06-19

### Added
- **Manage category fields from the app.** Each category's extra fields (e.g.
  Author / Publisher for Books) can now be added, edited, reordered, and removed
  without a developer — from **Categories → hover a category → the sliders icon
  → Manage fields**. Per field you set the label in English, Greek and French, a
  type (text / number / yes-no), and how it's entered (free text, a fixed
  dropdown, suggestions, or autocomplete from existing values). A field's key is
  locked once created, and deleting a field never touches data already saved on
  exhibits.
- **French interface.** The admin app and the capture PWA can now be used in
  **French**, alongside English and Greek. Pick it from Settings → Language (or
  the language row in the PWA profile). Dates and numbers follow French
  formatting when it's selected. Category and location names still show in
  English under French for now.
- **Link exhibits and donors from comments with @.** In any comment — the
  conservation log and an exhibit's Comment / functional-comment fields — type
  **@** followed by an exhibit ID (`@BK00009`) or a donor number (`@500`) to
  link it. As you type, a dropdown suggests matches (exhibits by ID/name when
  you start with letters, donors by number/name when you start with a digit).
  The text stays as you wrote it, but `@BK00009` now links to that exhibit and
  `@500` to that donor. IDs are forgiving of leading zeros (`@bk9` finds
  BK00009); unknown references stay as plain text.
- **Export the donor list.** The Donors page has a new **Export** button that
  downloads the donors currently shown — honouring your search and sort — as
  **CSV** or **JSON**. The tax ID (PII) is included only when an admin exports —
  other roles get everything except it.
- **Public donor list.** A new public endpoint serves the full donor list,
  alphabetically, with names only (no contact details) — so the museum's
  website can show a donor wall without touching any private data.
- **"Shown in Site" toggle per donor.** Each donor's profile has a new **Shown
  in Site** checkbox (on by default). Uncheck it to keep that donor off the
  public donor wall — hidden donors are left out of the public list.

## 2026-06-16

### Added
- **Flip between exhibits with ← / →.** Open an exhibit from the list, then press
  the left/right arrow keys (or the new `‹ n / total ›` control in the header) to
  jump to the previous/next exhibit — in the exact order of the list you came
  from, honouring its search, filters and sort. It steps aside for the image
  viewer, edit mode, and text fields.
- **Photo previews in ⌘K search.** Hovering a result in the command palette now
  pops up the exhibit's photo beside it, just like the exhibits list.
- **Easter egg:** an unknown page now greets you with the Amiga's classic red
  "Guru Meditation" crash screen. Click or press any key to recover.

## 2026-06-15

### Added
- **Donor files / donation forms.** Each donor's profile now has a "Donation
  forms" section where you can attach scanned forms, photos, or PDFs. Drag-and-
  drop or click to upload (images or PDF, up to 25 MB each), open/download the
  original, rotate scans that came in sideways, and delete. Every file gets a
  **visual preview** — for PDFs we render the first page as a thumbnail (with a
  small "PDF" badge), so the grid shows the actual document, not a generic icon.
  Files are stored alongside the exhibit images, so a mirror or backup picks
  them up automatically.
- **Donation forms imported from the legacy system.** Each donor's scanned
  donation form(s) can be brought over from the previous archive in bulk and
  attached automatically.

### Changed
- **Software fields are now pick-lists.** Media, System (target platform), and
  Language on a Software exhibit offer a dropdown of the values already in use
  (with a starter list for Language) — you can still type a new value or a
  combination, so nothing is locked down, but spelling stays consistent.
- **Books fields are now pick-lists too.** Author, Publisher, and Language on a
  Books exhibit offer a type-ahead dropdown drawn live from what's already in the
  collection (hundreds of authors and publishers) — start typing to filter, or
  enter something new. Helps avoid near-duplicates like "Microsoft" vs
  "Microsoft Corp."

## 2026-06-13

### Added
- **Searchable donor picker** when adding or editing an exhibit. The donor field
  is now a search box: start typing a name to filter the ~670 donors, and if the
  person or institution isn't on file yet you can create them on the spot without
  leaving the form. The edit form previously used one long scrolling dropdown,
  which was slow with so many donors.
- **Donor IDs.** Every donor now carries a number, continuing the museum's
  registry numbering (1, 2, 3 …). Donors you add in the app get the next free
  number automatically, and the number shows in the donors list and on each
  donor's page. Donors that had been imported without a number were matched
  against the registry export and back-filled.
- **Hover to preview a photo.** In the exhibits List view, hover over an exhibit's
  ID or name and its main photo pops up instantly in a small card beside the row —
  no click, no waiting for it to load. Exhibits without a photo show nothing.
- **Category details while adding an exhibit.** The "Add exhibit" form now shows
  the category's own fields (Type, RAM, Operating System, etc.) as soon as you
  pick a category, so you can fill them in during creation instead of saving first
  and editing afterwards.
- **Photos are named by exhibit code.** Photos you upload — from the phone or the
  desktop — are now saved as `<ExhibitCode>_1`, `_2`, `_3` … (e.g.
  `PC00544_1.jpg`) instead of a random code, so the files are recognisable and in
  order. Existing photos keep their current names.

### Changed
- **The exhibits list shows Type and Created date.** Two new columns: **Type**
  (after the Name) and **Created** (when the record was added — sortable like
  the other columns). The dashboard's "Need photos" shortcut now opens the list
  sorted by Created, newest first, so the most recent additions still missing
  photos are at the top.
- **Type is a dropdown, shown next to Category.** Every category that uses a Type
  (computers, peripherals, software, devices, magazines, storage, cards, and more)
  now offers a dropdown of the values already in use instead of free typing, so
  spelling stays consistent. Type sits directly under Category in the add and edit
  forms, as the item's main classifier.
- **Filter the exhibits list by Type.** The Filters panel has a new Type dropdown:
  choose a category, then a type (e.g. portable computers) to narrow the list to
  that kind of item.
- **"Add exhibit" remembers the category you're in.** Opening the form while a
  category is filtered (e.g. you're viewing Peripherals) preselects that category,
  so the generated ID and the attribute fields are right from the first moment.
- **"Add exhibit" no longer closes on an accidental outside click.** A stray click
  on the dim background used to discard a half-filled form; the dialog now closes
  only with Esc, the Cancel button, or after you create the exhibit. It also
  scrolls and always fits the screen — the header and Create/Cancel buttons stay
  in view while the fields scroll, even for categories with many fields.
- **The admin app can be served on more than one hostname,** alongside the
  existing address.

## 2026-06-12

### Added
- **Bulk photo uploads** — the mobile capture app now accepts up to 10 photos
  in a single upload. Larger batches (6 or more) that previously failed to send
  now go through.
- **New acquisitions catalogued** across several categories — computers, books,
  software, peripherals, devices, and more — and a handful of previously
  unnamed items were identified and added.

### Changed
- **Financials and Marketing show a BETA tag** in the sidebar while those areas
  are still under active development.
- **Production moved to a dedicated server** with far more memory and storage
  than the original Raspberry Pi — same web addresses, with extra headroom for
  search and image loading.

## 2026-05-14

### Added
- **Rich donor profiles** imported from the legacy registry. Each donor
  now carries father / contact name, address, city, phone, email, tax ID
  (admin-only), notes, first-donation date, and a stable legacy ID. The
  donors list shows the new fields as columns; search matches name, city,
  or email. Clicking a row opens a new **profile page** with the full
  details and the list of exhibits that donor contributed.
- **Conservation log** per exhibit. Record dated events — acquired,
  cleaned, repaired, maintenance, inspected, photographed, displayed,
  damaged — alongside freeform notes. Newest entries first; toggle to
  flip to oldest-first. Visible on both the admin web and the PWA.
  Senior curators and admins can edit anyone's entries; curators can
  edit their own.
- **What's new page** (you're reading it). Available from the admin
  sidebar and the PWA's Profile tab.
- **Date acquired** per exhibit, stored separately from the system-created
  date. Existing exhibits are blank; the Edit view lets you backfill known
  dates. New exhibits pre-fill with today.
- **Mobile auto-redirect** from the admin site to the capture PWA. Append
  `?desktop=1` to the URL to override and stay on the admin (the override
  is remembered for that browser).
- **Nightly database backups** at 03:00 UTC. Gzipped dumps live on the Pi's
  NVMe with 7 daily / 4 weekly / 6 monthly retention.

## 2026-05-13

### Added
- **Login with name** as well as email. Either is accepted in the
  identifier field; matching is case-insensitive.
- **Mobile inventory views** — switch between list, small thumbnail grid,
  and large thumbnail grid from the search header. Your choice is
  remembered.
- **Native category picker** on the mobile inventory (replaces the older
  chip strip — fewer taps).
- **eBay similar listings** on the mobile exhibit detail. Tap the eBay pill
  to see comparable items as a slide-up panel.

### Changed
- First-time visitors land on the **Modern** theme by default. Users with
  a saved theme preference are unaffected.

## 2026-05-12

### Added
- **MuseumOS runs in production** on a small self-hosted server (a separate
  hostname for the admin app and the capture PWA), under Coolify.
- **Roles & Permissions matrix** under Users → Roles & Permissions. Admins
  can flip what each role is allowed to do (read / write / delete / etc.)
  per resource. Admin always has every permission.
- **Subtle credit** at the bottom of the Settings page.
- **Sortable columns** for every column in the exhibits list, including
  category, location, image count, and tag count.
- **Manufacturer autocomplete** on the exhibit edit and new-exhibit forms.
- **Search no longer needs leading zeros**: typing `bk4` matches `BK00004`.

## 2026-05-11

### Added
- **The whole product.** Admin web (`apps/web`): exhibits list and detail,
  donors, locations, categories, tags, users, audit log, settings,
  floor-plan editor, QR label printing.
- **Capture PWA** (`apps/pwa`): mobile-first inventory, QR scan, photo
  capture with on-device compression, light editing.
- **Image pipeline**: original + 320 / 640 / 1024 thumbnails per image,
  in-place rotation with cache-bust, broken-image fallback.
- **Themes**: light, dark, museum (parchment + brass), modern (blue +
  Inter sans-serif).
- **i18n**: Greek + English everywhere.
- **Toast notifications**, **Cmd-K command palette**, **role-aware
  sidebar**, **scroll restoration on detail-page back-nav**.

## 2026-05-07

### Added
- Initial database schema, seed (16 categories, locations, admin user),
  and shared Zod contracts. Foundation work — nothing user-visible yet.
