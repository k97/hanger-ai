// The single owner of the native menu: builds the default menu once, inserts
// Hanger's items ("Check for Updates…" under About, "Copy Diagnostics" in
// File), and dispatches menu events to their owning modules.

use tauri::menu::{Menu, MenuItemBuilder, Submenu};
use tauri::Wry;

use crate::{diagnostics, updates};

pub fn install(app: &tauri::App) -> tauri::Result<()> {
    let handle = app.handle();
    let check_item =
        MenuItemBuilder::with_id(updates::CHECK_MENU_ID, "Check for Updates…").build(handle)?;
    let diag_item =
        MenuItemBuilder::with_id(diagnostics::MENU_ID, "Copy Diagnostics").build(handle)?;

    let menu = Menu::default(handle)?;
    let submenus: Vec<Submenu<Wry>> = menu
        .items()?
        .iter()
        .filter_map(|k| k.as_submenu().cloned())
        .collect();

    if let Some(app_submenu) = submenus.first() {
        // Position 1: directly under About, per macOS convention.
        app_submenu.insert(&check_item, 1)?;
    }
    match submenus.iter().find(|s| s.text().ok().as_deref() == Some("File")) {
        Some(file_submenu) => {
            file_submenu.append(&diag_item)?;
            log::info!("menu installed: update check under About, Copy Diagnostics in File");
        }
        // Default menus without a File submenu still get the item, next to
        // the update entry, rather than losing the feature.
        None => {
            if let Some(app_submenu) = submenus.first() {
                app_submenu.insert(&diag_item, 2)?;
            }
            log::warn!("menu installed: no File submenu found, Copy Diagnostics fell back to app submenu");
        }
    }
    app.set_menu(menu)?;

    app.on_menu_event(|app_handle, event| {
        if event.id() == updates::CHECK_MENU_ID {
            updates::spawn_check(app_handle.clone(), true);
        } else if event.id() == diagnostics::MENU_ID {
            diagnostics::copy_to_clipboard(app_handle);
        }
    });
    Ok(())
}
