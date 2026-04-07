
# Phase: UI Refactoring - Inline Controls

**Goal:** Improve space usage by placing labels and inputs side-by-side for specific controls.

**Files Affected:** `index.html`, `styles.css`

**Tasks:**
*   In `index.html`, modify the `div.control-group` for `model-select`, `quantity`, and `currency`.
*   Structure the label and input/select within each group to allow for horizontal layout (e.g., using a nested div or span).
*   In `styles.css`, add rules to apply Flexbox or Grid to these specific control groups to align the label and input/select horizontally.
*   Ensure proper alignment (e.g., vertical centering) and spacing between the label and the input/select.
*   Ensure labels and inputs still wrap correctly on smaller screens if needed.

**Testing:**
*   Verify the Model, Quantity, and Currency labels and their inputs/selects appear side-by-side.
*   Verify the controls are still usable and visually aligned.
*   Check layout responsiveness.

---
# Phase: Fix Issues & Refine Operations (High Priority - Logo STL)

**Goal:** Address bugs related to Logo STL generation, mirroring, and interaction.

**Sub-Phase 1: Fix Logo STL Generation (Scale, Position, Repeated Clicks)**
*   **Goal:** Ensure clicking "Logo STL" consistently generates the mesh at the correct scale and position matching the logo decal, even on repeated clicks.
*   **Files Affected:** `app.js`, `js/SVGtoSTL.js`
*   **Tasks:**
    *   Re-analyze transform logic in `convertAndMatchLogoStl`, `convertSvgToStl`, `resetStlGroup`, `renderObject`, `applyFinalTransforms`, `matchLogoTransform`.
    *   Trace the matrix calculations in `matchLogoTransform` to ensure scale/translation are correct relative to the logo decal.
    *   Confirm `resetStlGroup` fully clears all necessary transform properties before `renderObject` and `matchLogoTransform` apply new ones.
    *   Ensure transformations are applied in the correct coordinate space (local vs. world).
    *   Fix any remaining cumulative transform issues on repeated clicks.
*   **Testing:**
    *   Click "Logo STL" once. Verify size, position, orientation match the decal precisely.
    *   Click "Logo STL" multiple times. Verify the STL mesh does not change size, position, or orientation unexpectedly.

**Sub-Phase 2: Fix/Implement Mirror Logo STL (Geometric Mirror Copy)**
*   **Goal:** Make the "Mirror Logo STL" checkbox create a separate, geometrically mirrored copy of the logo STL. Add a toggle button.
*   **Files Affected:** `app.js`, `js/SVGtoSTL.js`, `index.html`
*   **Tasks:**
    *   Remove the ineffective mirror logic from `applyFinalTransforms` (`js/SVGtoSTL.js`). **(Done v1.0.74)**
    *   Implement logic in `createOrUpdateMirroredStl` (`app.js`) to clone the original STL group and apply reflection/rotation transforms to place it correctly on the opposite side.
    *   Ensure unchecking the box removes the mirrored copy.
    *   Handle updates: If the original STL is regenerated or transformed, the mirrored copy should also be updated or removed/recreated.
    *   Add a "Toggle Mirror STL" button to the Advanced View Options dropdown in `index.html`.
    *   Add an event listener for the button in `app.js` that toggles the `mirrorStlCheckbox` state and calls `handleMirrorStlToggle`.
*   **Testing:**
    *   Generate Logo STL with Mirror unchecked. Verify only one STL appears.
    *   Check Mirror checkbox. Verify a second, geometrically mirrored STL appears.
    *   Uncheck Mirror checkbox. Verify the mirrored copy disappears.
    *   Move/Scale/Recolor the original logo decal and regenerate the STL (with Mirror checked). Verify both the original and mirrored STL update correctly.

**Sub-Phase 3: Remove Cut Out Pop-up**
*   **Goal:** Remove an unnecessary alert.
*   **Files Affected:** `app.js`
*   **Tasks:**
    *   Remove the `alert()` call upon successful completion within the `cutoutLogoFromModel` function (`app.js`). **(Completed v1.0.73)**
*   **Testing:**
    *   Run "Cut Out Logo" operation, verify no alert appears on success.

**Sub-Phase 4: Revise "Cut Logo" (Intersection)**
*   **Goal:** Change the "Cut Logo" button to perform a CSG Intersection instead of Subtraction.
*   **Files Affected:** `app.js` (potentially `js/libs/SimpleBooleanCSG.js` or server-side if switching implementation)
*   **Tasks:**
    *   Modify the `cutLogoWithModel` function in `app.js`.
    *   Change the CSG operation from `ThreeBVHCSG.SUBTRACTION` to `ThreeBVHCSG.INTERSECTION`. **(Completed v1.0.73)**
    *   Analyze if the current client-side `three-bvh-csg` library reliably handles intersection. Consider server-side if needed.
    *   Update result handling logic.
*   **Testing:**
    *   Position logo STL to overlap the main model.
    *   Click "Cut Logo".
    *   Verify the resulting geometry is *only* the overlapping portion.

**Sub-Phase 5: Add Repair Model Functionality**
*   **Goal:** Allow users to repair the main loaded model directly.
*   **Files Affected:** `index.html`, `app.js`, `main-server.js`
*   **Tasks:**
    *   Add a "Repair Base Model" button to `index.html`. **(Completed v1.0.73)**
    *   Create `repairBaseModel` function in `app.js`. **(Completed v1.0.73)**
    *   Implement logic to export model, call API, replace geometry.
*   **Testing:**
    *   Load a model.
    *   Click "Repair Base Model".
    *   Verify operation completes and model geometry is updated.

---
# Phase: UI Refactoring - View Controls

**Goal:** Improve the organization and presentation of the view control buttons.

**Files Affected:** `index.html`, `app.js`, `styles.css`

**Tasks:**
*   In `index.html`, wrap the existing `div.button-group` within the "View Controls" `div.control-group` inside a new structure for a collapsible dropdown (e.g., a details/summary structure or custom divs).
*   Add a title like "Advanced View Options" for the dropdown trigger.
*   Modify `styles.css` to hide the button group by default and show it when the dropdown is open.
*   Apply CSS (e.g., Flexbox or Grid) to the `div.button-group` to arrange the buttons into 2 or 3 evenly spaced columns for better readability.
*   If using custom divs for the dropdown, add a simple click listener in `app.js` (`setupEventListeners`) to toggle visibility (e.g., adding/removing a CSS class).

**Testing:**
*   Verify the View Control buttons are hidden by default under an "Advanced View Options" label/button.
*   Clicking the label/button should reveal the buttons.
*   Verify the buttons are arranged in neat, evenly spaced columns.
*   Verify all buttons within the dropdown still function correctly.

---
# Phase: Continue Modularization

**Goal:** Extract logic from `app.js` into dedicated modules:
- stlHandler.js (handles everything to do with the original model stls & the created logo/model stls liek selection, download)
- logoDecalHandler.js (handles everything to do with logog decal upload, previews, scale, positon & options)
- svgToStlConverter.js
- csgOperations.js

**Files Affected:** app.js, modules/*

**Tasks:**
- Move related logic into the corresponding module.
- Prevent circular imports (use events/callbacks if needed).
- Use consistent naming, ES module syntax for imports/exports.

**Testing:**
- Validate core features after each module move.
- Perform full regression once modularization is complete.

---

# Phase: Final Code Review & Cleanup

**Goal:** Final polish of modularized codebase.

**Files Affected:** All .js files

**Tasks:**
- Review logic for clarity and remove unused code.
- Normalize comment style and whitespace.
- Ensure all state variables are clearly scoped and mutated intentionally.

**Testing:**
- Walk through each logical flow manually.
- Run full UI test with edge case data.

---

# Phase: Logging Cleanup

**Goal:** Eliminate file-based logging.

**Files Affected:** main-server.js

**Tasks:**
- Remove logic writing to disk logs.
- Replace with `console.debug/info/error`.

**Testing:**
- Run major operations: verify log output only appears in terminal.
- Confirm log files are not created.

---

# Phase: Lockout During Operations

**Goal:** Prevent user actions during long tasks.

**Files Affected:** app.js

**Tasks:**
- Disable STL, Repair, Cut buttons while server task is pending.
- Add loading spinner or overlay if needed.

**Testing:**
- Trigger long operation: buttons should be disabled until done.
- Confirm buttons re-enable when task completes or fails.

---

# Phase: Debug Controls Menu

**Goal:** Group debug toggles into collapsible panel.

**Files Affected:** index.html, app.js, styles.css

**Tasks:**
- Create section `#debug-controls-menu`.
- Move all debug buttons inside it.
- Add toggle to show/hide section.
- Rename buttons to remove "Toggle" prefix (e.g. "Logo STL" instead of "Toggle Logo STL").

**Testing:**
- Debug menu hidden by default.
- Toggle displays/hides it.
- All moved controls must still function.

---

# Phase: Temporary File Cleanup

**Goal:** Periodically delete server temp files.

**Files Affected:** main-server.js

**Tasks:**
- Schedule deletion of files >1 hour old in:
  - `temp_repair/`
  - `temp_subtract/`

**Testing:**
- Manually create files with old timestamps.
- Confirm cleanup job deletes them on schedule.
