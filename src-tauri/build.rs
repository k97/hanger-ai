use std::path::PathBuf;

/// Files in `target/<profile>/deps` above which the build warns.
///
/// A freshly built tree holds roughly 3,500. The tree that prompted this held
/// 291,142 and `target/` was 94.2 GiB. 25,000 is about seven times a clean
/// build: high enough never to fire during normal work, low enough to be years
/// away from a full disk.
const DEFAULT_WARN_AT: usize = 25_000;

/// Warn when `deps/` has accumulated superseded artifacts.
///
/// Cargo never garbage-collects `target/`. Its automatic collection, stable
/// since 1.88, only touches `~/.cargo`; collecting `target/` is still
/// unimplemented (rust-lang/cargo#13136). Every rebuild adds artifacts keyed by
/// content hash and removes none, so the directory grows without bound and
/// silently — this one reached 94.2 GiB before anyone looked.
///
/// It counts directory entries rather than measuring bytes, for two reasons.
/// A single `read_dir` is O(1) syscalls where summing sizes is O(files), and
/// walking is slowest exactly when the directory is worst — a size check would
/// get more expensive the more it was needed. And file count measures the
/// cause directly: five copies of the same 380 MB archive is five entries.
///
/// Skipped under `CI`, where every runner starts empty and the warning could
/// only ever be noise.
fn warn_if_deps_have_accumulated() {
    if std::env::var_os("CI").is_some() {
        return;
    }

    // OUT_DIR is <target>/<profile>/build/<pkg>-<hash>/out, so the profile
    // directory holding `deps` is four levels up.
    let Some(out_dir) = std::env::var_os("OUT_DIR").map(PathBuf::from) else {
        return;
    };
    let Some(deps) = out_dir.ancestors().nth(3).map(|p| p.join("deps")) else {
        return;
    };
    let Ok(entries) = std::fs::read_dir(&deps) else {
        return;
    };

    let warn_at = std::env::var("HANGER_DEPS_WARN_AT")
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(DEFAULT_WARN_AT);

    let count = entries.count();
    if count > warn_at {
        println!(
            "cargo:warning=target/{} holds {} files (a clean build is ~3,500). \
             Cargo never evicts superseded build artifacts. Run `bun run tidy` \
             from the repo root; see docs/setup.md -> Build Artifact Hygiene.",
            deps.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("deps"),
            count
        );
    }
}

fn main() {
    warn_if_deps_have_accumulated();
    tauri_build::build()
}
