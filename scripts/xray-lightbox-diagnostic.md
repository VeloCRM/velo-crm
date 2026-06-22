# X-ray Lightbox (PR-B2) — Phase 1 Diagnostic (read-only)

**Date:** 2026-06-23 · **Status:** DIAGNOSTIC ONLY — no code/schema/Supabase changes.
PR-B2 replaces PR-B1's interim "open full-size in a new tab" (`XraysTab.openFull` → `window.open`) with an
in-place fullscreen lightbox: custom zoom/pan/pinch + metadata view/edit + delete + prev/next nav.
Decisions carried: custom zoom/pan (no library), full metadata edit (`updateXray`), delete-with-confirm,
tablet pinch essential.

---

## Backend API — no `xrays.js` changes needed (verified)
| Need | Export | Note |
|---|---|---|
| Full-size URL (+ re-fetch on 1h expiry) | `getXraySignedUrl(xrayId, expiresIn=3600)` → `{url, fileName}` | **re-callable** — expiry re-fetch is just another call; logs `xray.view` each time (intended access signal) |
| Edit metadata | `updateXray(xrayId, updates)` → row | supports xray_type/date_taken/teeth_shown/treatment_plan_id/notes |
| Delete | `deleteXray(xrayId)` → void | row-first + best-effort blob cleanup |
All row metadata (file_name, file_size, uploaded_by → `uploader` embed, created_at, thumbnail_data_url) already
comes from `fetchXrays` — only the full-size URL needs signing. **Guardrail cleared:** no new `xrays.js` fn.

## Reuse (verified)
- **`ConfirmDialog`** (`src/components/ConfirmDialog.jsx`) — delete confirm; props `{open,title,message,confirmLabel,cancelLabel,variant='danger',onConfirm,onCancel,dir}`, renders at `z-index:3000` (must sit above the lightbox — keep lightbox z below 3000).
- **`MiniToothChart`** — teeth_shown editor (same as upload).
- **`FormField` / `inputStyle` / `selectStyle`** (shared), **`Button`** (ui), **`XRAY_TYPE_OPTIONS`** (`lib/xrayTypes`), **`useMyRole`** (already used in XraysTab), **`fetchTreatmentPlansForPatient`** (dental.js) — treatment dropdown.
- **`thumbnail_data_url`** on the row → instant progressive placeholder while the full image loads.

## ❌ Not reusable — build custom
- **No fullscreen overlay pattern exists.** `Modal`/`.modal-content` is a **centered, width-capped** dialog
  (`maxWidth: 92vw`, light glass via `.modal-content:has(.ds-root)`), wrong for an edge-to-edge dark image
  viewer. Build a dedicated fullscreen backdrop (`position:fixed; inset:0`, dark, own z-index). Do NOT wrap the
  viewer in `.ds-root` (that forces the light-glass surface). The edit sidebar/form uses FormField etc. inside
  this custom overlay (not a nested Modal).

## Component breakdown
**New: `src/components/XrayLightbox.jsx`** (~300-380 LOC) — fullscreen overlay containing:
- **Viewer** (center): zoomable `<img>`; thumbnail_data_url shown first, swapped for the signed full-size on load.
- **Metadata sidebar** (right; bottom-sheet/toggle on narrow): view mode (type/date/teeth/treatment/notes + file_name/size/uploader/created_at) ↔ edit mode.
- **Controls:** zoom ±, fit-to-screen, close (X/Esc), prev/next.
- **Edit form + Delete** (gated by `useMyRole` → owner/doctor).

**Suggested extraction (open Q #1): `src/components/XrayMetadataForm.jsx`** — the type/date/teeth/treatment/notes
form is identical in `XrayUploadModal` and the lightbox edit. Extracting it (and importing into both) is DRY but
**touches the merged `XrayUploadModal`** (small refactor). Alternative: duplicate ~60 lines in the lightbox.

## Zoom/pan outline (custom, CSS transform + Pointer Events)
State: `{ scale, tx, ty }`; image rendered `transform: translate(tx,ty) scale(scale)`; container `touch-action: none`.
- **Wheel** → cursor-centered zoom: `s' = clamp(s * (1 ∓ 0.1), 0.5, 5)`; adjust `tx,ty` so the point under the cursor stays fixed (`t' = cursor − (cursor − t) * s'/s`).
- **Pointer Events** (unified mouse+touch) via a `Map<pointerId, {x,y}>`:
  - 1 pointer → pan (translate by delta).
  - 2 pointers → pinch: scale by the ratio of current/previous inter-pointer distance, centered on their midpoint.
- **Double-click / double-tap** → reset to fit (scale baseline, tx=ty=0).
- Min 0.5x / max 5x; each prev/next opens fit-to-screen (reset transform).
**Complexity: M** (~120-170 LOC). 🚩 Guardrail: if it exceeds ~200 LOC or pinch-vs-pan conflict resolution
balloons, fall back to `react-zoom-pan-pinch` (~10 KB gz) — but that **breaks the 4-runtime-dep discipline**, so
needs Ali's ok (open Q #5). The pointer-count switch (1=pan, 2=pinch) is the main risk area; recommend prototyping the gesture handler first.

## Integration changes
- **`XraysTab.jsx`** — replace `openFull` (`window.open`) with lightbox state. Hold `{ list, index }` for the
  active set + position; render `<XrayLightbox>` when open; pass `canEdit`, `lang/dir`, `toast`, `onUpdated`
  (reload), `onDeleted` (close + reload). **S.**
- **`XrayGrid.jsx`** — 🚩 the **filter chip state is local to the grid**, but prev/next must cycle the *filtered*
  set. Change `onOpen(x)` → **`onOpen(x, orderedFilteredList)`** (grid passes its current `filtered` array +
  clicked item) so the lightbox navigates the right set without lifting filter state. **S.** (Alternative: lift
  filter state to XraysTab — more churn.)

## UX flows
- **Edit:** view (default) → Edit → form (reuse) → Save (`updateXray`, spinner, optimistic + rollback on
  failure, toast) → view + refresh; Cancel discards.
- **Delete:** Delete → `ConfirmDialog` → `deleteXray` → close lightbox + reload grid; error → toast, stay open.
- **Nav:** ←/→ keys + on-screen buttons cycle the filtered set; disabled at first/last (no wrap, per spec);
  transform resets per image.
- **Loading:** thumbnail placeholder → spinner until signed URL + `<img> onload`; on `<img> onerror` (expired
  URL) → re-call `getXraySignedUrl` once, then error state.

## Permissions / a11y / mobile
- Edit + Delete hidden unless `useMyRole` ∈ {owner, doctor} (RLS also denies). **S.**
- `aria-modal`, `role="dialog"`, labelled backdrop; **Esc** closes; **←/→** nav; focus first control on open +
  restore on close; focus trap within the overlay. **S.**
- Narrow screens: sidebar → bottom sheet or a view/metadata toggle; `touch-action:none` on the viewer; ensure
  tap-to-close fires only on the backdrop, not after a pan gesture (track pointer-move distance threshold).

## Estimated complexity
| Area | Complexity |
|---|---|
| Fullscreen overlay + backdrop + focus/a11y | S |
| Zoom/pan/pinch (Pointer Events + transform) | **M** (risk area) |
| Metadata view sidebar | S |
| Edit form (reuse / extract XrayMetadataForm) | S |
| Delete (reuse ConfirmDialog) | S |
| Prev/next nav (+ keys) | S |
| XraysTab + XrayGrid integration | S |
Total ~one focused session. No `api/` files → Vercel 12/12. No new RLS/bucket → no `/security-review`.

## Open questions for Ali
1. **Extract a shared `XrayMetadataForm`** (DRY across upload + lightbox, but refactors the merged
   `XrayUploadModal`) vs duplicate the form in the lightbox? (Recommend extract.)
2. **Mobile metadata:** bottom sheet vs a view/metadata toggle on narrow screens?
3. **Prev/next:** confirm cycle the *filtered* set, disabled at ends (no wrap).
4. **Zoom range** 0.5×–5×, double-tap-to-fit — confirm.
5. **Library fallback:** if custom pinch handling exceeds budget, pre-authorize `react-zoom-pan-pinch`
   (~10 KB gz, breaks the 4-dep discipline) or stay custom-only and cut pinch if needed?
6. **Audit noise:** each open / prev-next / re-fetch logs `xray.view` — acceptable as the access signal?

## Recommended PR shape
**Single PR-B2** — one cohesive feature (~one session). If the zoom/pan gesture work runs long, the natural
split is **B2a** (fullscreen lightbox view + zoom/pan + nav, replacing `window.open`) then **B2b** (edit +
delete). Default to single; fall back to the split only if pinch handling balloons (open Q #5). `/code-review`
(high effort) before merge — special attention to pointer-gesture correctness, focus trap, and the
signed-URL-expiry re-fetch path.

## Next steps
1. Ali's answers (esp. #1 extract-form, #5 library fallback).
2. Phase 2: build `XrayLightbox` + wire XraysTab/XrayGrid; prototype the gesture handler first to de-risk the M area.
