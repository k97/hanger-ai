// The single owner of the update flow: launch check, "Check for Updates…"
// menu item, and the periodic re-check all funnel through run_check. Native
// dialogs by design (Sparkle shape) — they survive UI redesigns and need no
// webview state. The silent paths only speak when an update exists; the
// manual path reports all three outcomes.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::menu::{Menu, MenuItemBuilder};
use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

pub const CHECK_MENU_ID: &str = "hanger-check-updates";

// One check at a time: launch, periodic, and menu triggers can overlap.
static CHECK_IN_FLIGHT: AtomicBool = AtomicBool::new(false);

/// Every 4 hours, matching the surveyed convention (Midday). The check is a
/// single HTTPS GET of latest.json; the binary download only happens after
/// the user accepts the dialog.
const PERIODIC_CHECK_INTERVAL: Duration = Duration::from_secs(4 * 60 * 60);

/// Build the default menu with "Check for Updates…" inserted into the app
/// submenu after About, and register the click handler.
pub fn install_menu(app: &tauri::App) -> tauri::Result<()> {
    let handle = app.handle();
    let check_item = MenuItemBuilder::with_id(CHECK_MENU_ID, "Check for Updates…")
        .build(handle)?;

    let menu = Menu::default(handle)?;
    if let Some(app_submenu) = menu.items()?.first().and_then(|k| k.as_submenu().cloned()) {
        // Position 1: directly under About, per macOS convention.
        app_submenu.insert(&check_item, 1)?;
    }
    app.set_menu(menu)?;

    app.on_menu_event(|app_handle, event| {
        if event.id() == CHECK_MENU_ID {
            spawn_check(app_handle.clone(), true);
        }
    });
    Ok(())
}

/// Silent check on launch plus the periodic re-check loop.
pub fn spawn_background_checks(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        run_check(&app, false).await;
        let mut interval = tokio::time::interval(PERIODIC_CHECK_INTERVAL);
        interval.tick().await; // consume the immediate first tick
        loop {
            interval.tick().await;
            run_check(&app, false).await;
        }
    });
}

fn spawn_check(app: AppHandle, interactive: bool) {
    tauri::async_runtime::spawn(async move {
        run_check(&app, interactive).await;
    });
}

async fn run_check(app: &AppHandle, interactive: bool) {
    if CHECK_IN_FLIGHT.swap(true, Ordering::SeqCst) {
        return;
    }
    let result = do_check(app, interactive).await;
    CHECK_IN_FLIGHT.store(false, Ordering::SeqCst);
    if let Err(e) = result {
        eprintln!("[HANGER WARNING] update check failed: {e}");
        if interactive {
            app.dialog()
                .message(format!("Could not check for updates.\n\n{e}"))
                .title("Update Check Failed")
                .kind(MessageDialogKind::Error)
                .buttons(MessageDialogButtons::Ok)
                .blocking_show();
        }
    }
}

async fn do_check(app: &AppHandle, interactive: bool) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = updater.check().await.map_err(|e| e.to_string())?;

    let Some(update) = update else {
        if interactive {
            let current = app.package_info().version.to_string();
            app.dialog()
                .message(format!("Hanger AI {current} is the latest version."))
                .title("You're up to date")
                .kind(MessageDialogKind::Info)
                .buttons(MessageDialogButtons::Ok)
                .blocking_show();
        }
        return Ok(());
    };

    let current = app.package_info().version.to_string();
    let install = app
        .dialog()
        .message(format!(
            "Hanger AI {} is available — you have {}.\n\nDownload and install now? The app will restart to finish.",
            update.version, current
        ))
        .title("Update Available")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Install Update".to_string(),
            "Later".to_string(),
        ))
        .blocking_show();

    if !install {
        return Ok(());
    }

    update
        .download_and_install(|_, _| {}, || eprintln!("[HANGER] update downloaded"))
        .await
        .map_err(|e| format!("Signature verification or install failed: {e}"))?;

    app.restart();
}
