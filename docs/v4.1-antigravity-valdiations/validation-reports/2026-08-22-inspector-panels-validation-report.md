# Inspector Panels: UI Pattern Analysis & Validation Report

## Executive Summary
This report validates the design pattern migration applied to the Inspector Panels (`mcp-panel` and `skill-panel`), ensuring they align with the Information Hiding principles successfully implemented in the Hero Banner iteration. By analyzing standard IDE UI patterns (VS Code, Cursor), we have successfully decoupled configuration data from diagnostic notifications.

## Research Findings: Properties vs. Diagnostics
An online review of UI design patterns for developer tools reveals a strict separation of concerns between Properties Panels and Problems Panels.

1.  **Properties Panels (Inspector):** Designed for active configuration, state-management, and neutral metadata display. They are selection-driven and meant to have low cognitive load.
2.  **Problems Panels (Issues/Diagnostics):** Designed for notification, triage, and remediation. They are typically housed in a dedicated bottom/side panel to centralize system-wide errors.

**Observation:** The previous Hanger inspector panels violated this separation by rendering massive, inline red/orange "Issue" banners (e.g., *Context Bloat & Accuracy Health*, *Context Scoping & Security*) directly inside the Details tab. This polluted the configuration space with triage data, increasing cognitive load and causing layout shifting.

## The Design Update
We applied the exact same "Information Hiding" refactor that proved successful on the top-level banners:

### 1. Extracted Diagnostics to the Issues Screen
*   **MCP Panel:** Removed the `Namespace Collisions` (1 Conflict) warning from the details pane. 
*   **Skill Panel:** Removed the `Privilege Boundaries` (Risk: Med) warning from the details pane.
*   **New Actionable Button:** Injected a sleek, native `⚠️ [X] Issues` button into the `.header-actions` block at the top right of the Inspector panel. Clicking this navigates the user to the dedicated Issues Screen, perfectly matching the banner's routing behavior.

### 2. Purified the Properties Pane
The `tab-details` pane has been reverted to its intended purpose as a strict Properties panel.
*   **MCP Panel:** The red *Context Bloat* box was converted into a neutral *Performance Profile* box. `Static Schema Footprint` (10.8k tokens) is retained as a core, deterministic property of the server, rather than an active "Issue".
*   **Skill Panel:** The *Context Scoping* box now neutrally displays `Tool Exposure` (Optimized) as a configuration trait, without the noise of privilege warnings.

## Systematic Debugging Validation
The structural integrity of the HTML DOM was verified post-refactor:
*   The greedy regex errors that previously plagued the banner JS were avoided.
*   The injection of `.issues-btn` CSS and HTML strictly adheres to the existing Flexbox boundaries of the `.header-actions` container.
*   No closing `</div>` tags were orphaned, ensuring the `box-container` layouts render flawlessly in both the `inspector` (floating panel) and `extended` (full pane) views.

### 3. Merging the Floating and Docked Prototypes
*   The `inspector_*.html` and `*_extended.html` prototypes were previously split, causing the rich context-health blocks to be absent from the docked view.
*   We merged them seamlessly: The `Context Bloat & Accuracy Health` block and `Context Scoping & Security` block have been flawlessly injected into the top of the combined docked view (`hanger_v4_*_panel_combined.html`). 
*   **Result:** The user can now view the rich context health data in both the docked and floating states (via the toggle button), while the actual actionable red alerts (like Namespace Collisions) remain fully routed to the Issues Screen.
