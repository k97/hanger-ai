use tauri_app_lib::mcp::identity::{normalise_launch, LaunchNote};

fn v(xs: &[&str]) -> Vec<String> { xs.iter().map(|s| s.to_string()).collect() }

#[test]
fn an_interpreter_resolves_to_its_basename() {
    let n = normalise_launch("/opt/homebrew/bin/node", &v(&["server.js"]), &[], None);
    assert_eq!(n.command, "node");
    assert!(n.notes.iter().any(|x| matches!(x, LaunchNote::InterpreterBasename { .. })));
}

#[test]
fn a_windows_shim_unwraps_to_its_posix_twin() {
    let a = normalise_launch("cmd", &v(&["/c", "npx", "-y", "server"]), &[], None);
    let b = normalise_launch("npx", &v(&["-y", "server"]), &[], None);
    assert_eq!((a.command.clone(), a.args.clone()), (b.command, b.args));
}

#[test]
fn documented_flag_equivalences_fold_and_undocumented_ones_do_not() {
    let short = normalise_launch("npx", &v(&["-y", "srv"]), &[], None);
    let long  = normalise_launch("npx", &v(&["--yes", "srv"]), &[], None);
    assert_eq!(short.args, long.args, "-y and --yes are documented equivalents");

    let a = normalise_launch("npx", &v(&["-q", "srv"]), &[], None);
    let b = normalise_launch("npx", &v(&["--quiet", "srv"]), &[], None);
    assert_ne!(a.args, b.args, "a false conflict is recoverable; a missed one is not");
}

#[test]
fn argument_order_is_preserved() {
    let n = normalise_launch("npx", &v(&["-y", "a", "b"]), &[], None);
    assert_eq!(n.args, v(&["--yes", "a", "b"]));
}

#[test]
fn env_key_names_round_trip_through_normalisation() {
    let n = normalise_launch("npx", &v(&["srv"]), &v(&["API_KEY", "HOME"]), None);
    assert_eq!(n.env_keys, v(&["API_KEY", "HOME"]));
}

#[test]
fn a_workspace_token_expands_against_the_root_it_is_given() {
    let a = normalise_launch("node", &v(&["${workspaceFolder}/server.js"]), &[], Some("/repo/alpha"));
    let b = normalise_launch("node", &v(&["${workspaceFolder}/server.js"]), &[], Some("/repo/beta"));
    assert_ne!(a.args, b.args, "same text, different repositories, different launches");
    assert_eq!(a.args, v(&["/repo/alpha/server.js"]));
}

#[test]
fn an_unexpandable_workspace_token_is_noted_rather_than_silently_kept() {
    let n = normalise_launch("node", &v(&["${workspaceFolder}/server.js"]), &[], None);
    assert_eq!(n.args, v(&["${workspaceFolder}/server.js"]), "left literal");
    assert!(
        n.notes.iter().any(|x| matches!(x, LaunchNote::Unexpandable { .. })),
        "a token we could not resolve must be visible, not silently compared as equal"
    );
}
