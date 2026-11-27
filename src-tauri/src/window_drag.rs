//! Window dragging from the title band.
//!
//! Tauri's own path (`data-tauri-drag-region` → drag.js → `start_dragging`)
//! was patchy on macOS: on 2026-11-28, 30 real presses in the band all reached
//! the page and all asked for a drag, and the window moved on 8. tao's
//! `drag_window` hands `NSApp.currentEvent` to `performWindowDragWithEvent:`,
//! but the request arrives over async IPC, after the press was dispatched, so
//! there is no current event or it is a later one, and the Window Server
//! starts nothing (tao#1371; tao 0.38.0 is unchanged).
//!
//! Two fixes others shipped for the same race, combined. A local event
//! monitor keeps the genuine mouse-down as AppKit delivers it, before the
//! webview sees it (tarwin/tinyjsapp#92), and hands it to the Window Server if
//! the pointer has not moved yet. Caching alone was not enough: in Karthik's
//! own drags on 2026-11-28, 6 of 7 still did nothing, because the Window
//! Server starts a drag only while the pointer is where it was pressed, and a
//! hand moves at once. So once the pointer has gone and the window has not,
//! the monitor moves the window itself, following each drag event until the
//! release (egoist/mygo#765). A release clears everything, so a late request
//! after a quick click moves nothing.

/// Whether the primary button is down in an `NSEvent.pressedMouseButtons`
/// mask, where bit 0 is the left button.
pub fn left_button_held(pressed_mouse_buttons: usize) -> bool {
    pressed_mouse_buttons & 1 == 1
}

/// How far, in points, the pointer may have travelled from the press and
/// still hand the press to the Window Server: past this, it no longer starts
/// a drag (egoist/mygo#765 measured the same 1 pt).
pub const NATIVE_SLOP: f64 = 1.0;

/// How far the pointer must travel, with the window still where it was,
/// before this module moves the window itself (mygo#765 uses 3 pt).
pub const TAKE_OVER_AFTER: f64 = 3.0;

/// Whether the Window Server can still start the drag: the pointer is within
/// `NATIVE_SLOP` of where the press landed.
pub fn native_drag_can_start(press: (f64, f64), now: (f64, f64)) -> bool {
    distance(press, now) <= NATIVE_SLOP
}

/// Whether to move the window by hand: drag events are still reaching the
/// app, the window has not moved since the press, and the pointer has gone
/// past `TAKE_OVER_AFTER` — so the Window Server did not start the drag.
pub fn should_take_over(press: (f64, f64), now: (f64, f64), origin_at_press: (f64, f64), origin_now: (f64, f64)) -> bool {
    origin_now == origin_at_press && distance(press, now) > TAKE_OVER_AFTER
}

/// Where the window goes when moved by hand: its origin at the press, plus
/// how far the pointer has travelled since. Screen points, either axis.
pub fn followed_origin(press: (f64, f64), now: (f64, f64), origin_at_press: (f64, f64)) -> (f64, f64) {
    (origin_at_press.0 + now.0 - press.0, origin_at_press.1 + now.1 - press.1)
}

fn distance(a: (f64, f64), b: (f64, f64)) -> f64 {
    (a.0 - b.0).hypot(a.1 - b.1)
}

#[cfg(target_os = "macos")]
mod macos {
    use std::cell::RefCell;
    use std::ptr::NonNull;

    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::Message;
    use objc2_app_kit::{NSEvent, NSEventMask, NSEventType, NSWindow};
    use objc2_foundation::NSPoint;

    /// The press being held, cached as AppKit delivered it.
    struct Press {
        event: Retained<NSEvent>,
        at: (f64, f64),
    }

    /// A window drag in progress, started by `start_window_drag`.
    struct Drag {
        window: Retained<NSWindow>,
        press_at: (f64, f64),
        origin_at_press: (f64, f64),
        by_hand: bool,
    }

    thread_local! {
        // Main thread only: the monitor's handler and the command both run there.
        static PRESS: RefCell<Option<Press>> = const { RefCell::new(None) };
        static DRAG: RefCell<Option<Drag>> = const { RefCell::new(None) };
        static MONITOR: RefCell<Option<Retained<AnyObject>>> = const { RefCell::new(None) };
    }

    fn pointer() -> (f64, f64) {
        let p = NSEvent::mouseLocation();
        (p.x, p.y)
    }

    fn origin(window: &NSWindow) -> (f64, f64) {
        let o = window.frame().origin;
        (o.x, o.y)
    }

    /// Follow one drag event: once the Window Server has evidently not taken
    /// the drag, move the window with the pointer until the release.
    fn follow(drag: &mut Drag) {
        let now = pointer();
        if !drag.by_hand
            && super::should_take_over(drag.press_at, now, drag.origin_at_press, origin(&drag.window))
        {
            drag.by_hand = true;
        }
        if drag.by_hand {
            let (x, y) = super::followed_origin(drag.press_at, now, drag.origin_at_press);
            drag.window.setFrameOrigin(NSPoint::new(x, y));
        }
    }

    /// Install the press monitor. Call once, on the main thread.
    pub fn install_press_monitor() {
        let handler = RcBlock::new(|event: NonNull<NSEvent>| -> *mut NSEvent {
            // SAFETY: AppKit passes the handler a live event for the call.
            let seen = unsafe { event.as_ref() };
            let kind = seen.r#type();
            if kind == NSEventType::LeftMouseDown {
                PRESS.with(|p| *p.borrow_mut() = Some(Press { event: seen.retain(), at: pointer() }));
                DRAG.with(|d| *d.borrow_mut() = None);
            } else if kind == NSEventType::LeftMouseDragged {
                DRAG.with(|d| {
                    if let Some(drag) = d.borrow_mut().as_mut() {
                        follow(drag);
                    }
                });
            } else if kind == NSEventType::LeftMouseUp {
                PRESS.with(|p| *p.borrow_mut() = None);
                DRAG.with(|d| *d.borrow_mut() = None);
            }
            event.as_ptr()
        });
        let mask = NSEventMask(
            NSEventMask::LeftMouseDown.0 | NSEventMask::LeftMouseDragged.0 | NSEventMask::LeftMouseUp.0,
        );
        // SAFETY: the handler returns the event it was given, never null-or-dangling.
        let monitor = unsafe { NSEvent::addLocalMonitorForEventsMatchingMask_handler(mask, &handler) };
        MONITOR.with(|m| *m.borrow_mut() = monitor);
    }

    /// Drag `window` from the press still being held in it, if any: through
    /// the Window Server while the pointer has not moved, and by hand once
    /// it has (the drag events then follow it, in `follow`).
    pub fn drag_from_held_press(window: &NSWindow) {
        if !super::left_button_held(NSEvent::pressedMouseButtons()) {
            return;
        }
        let Some((event, press_at)) = PRESS.with(|p| p.borrow().as_ref().map(|p| (p.event.clone(), p.at))) else {
            return;
        };
        if event.windowNumber() != window.windowNumber() {
            return;
        }
        let mut drag = Drag {
            window: window.retain(),
            press_at,
            origin_at_press: origin(window),
            by_hand: false,
        };
        if super::native_drag_can_start(press_at, pointer()) {
            window.performWindowDragWithEvent(&event);
        } else {
            follow(&mut drag);
        }
        DRAG.with(|d| *d.borrow_mut() = Some(drag));
    }
}

#[cfg(target_os = "macos")]
pub use macos::install_press_monitor;

/// Start a window drag from the press the user is still holding.
///
/// A sync command, so Tauri runs it on the main thread, which AppKit needs.
#[tauri::command]
pub fn start_window_drag(window: tauri::WebviewWindow) {
    #[cfg(target_os = "macos")]
    {
        if objc2::MainThreadMarker::new().is_none() {
            return;
        }
        let Ok(ns_window) = window.ns_window() else {
            return;
        };
        // SAFETY: tao's NSWindow for this window, alive as long as it is; we
        // are on the main thread (checked above), which AppKit requires.
        let ns_window = unsafe { &*(ns_window as *const objc2_app_kit::NSWindow) };
        macos::drag_from_held_press(ns_window);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = window.start_dragging();
    }
}

#[cfg(test)]
mod tests {
    use super::{followed_origin, left_button_held, native_drag_can_start, should_take_over};

    #[test]
    fn the_native_drag_starts_only_while_the_pointer_is_still_at_the_press() {
        assert!(native_drag_can_start((100.0, 200.0), (100.0, 200.0)));
        assert!(native_drag_can_start((100.0, 200.0), (100.5, 199.5)));
        assert!(!native_drag_can_start((100.0, 200.0), (102.0, 200.0)));
        assert!(!native_drag_can_start((100.0, 200.0), (100.0, 190.0)));
    }

    #[test]
    fn take_over_when_the_pointer_has_left_and_the_window_has_not() {
        let o = (300.0, 400.0);
        assert!(should_take_over((100.0, 200.0), (110.0, 200.0), o, o));
        assert!(should_take_over((100.0, 200.0), (100.0, 196.0), o, o));
    }

    #[test]
    fn do_not_take_over_a_drag_the_window_server_is_running() {
        assert!(!should_take_over((100.0, 200.0), (130.0, 200.0), (300.0, 400.0), (330.0, 400.0)));
    }

    #[test]
    fn do_not_take_over_before_the_pointer_has_really_moved() {
        let o = (300.0, 400.0);
        assert!(!should_take_over((100.0, 200.0), (102.0, 201.0), o, o));
    }

    #[test]
    fn the_window_follows_the_pointer_from_where_it_was_pressed() {
        assert_eq!(followed_origin((100.0, 200.0), (150.0, 170.0), (300.0, 400.0)), (350.0, 370.0));
        assert_eq!(followed_origin((100.0, 200.0), (100.0, 200.0), (300.0, 400.0)), (300.0, 400.0));
    }

    #[test]
    fn the_left_button_alone_counts_as_held() {
        assert!(left_button_held(0b1));
    }

    #[test]
    fn the_left_button_with_others_counts_as_held() {
        assert!(left_button_held(0b111));
    }

    #[test]
    fn other_buttons_without_the_left_do_not() {
        assert!(!left_button_held(0));
        assert!(!left_button_held(0b10));
        assert!(!left_button_held(0b100));
    }
}
