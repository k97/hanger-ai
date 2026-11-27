// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() -> std::process::ExitCode {
    // `Hanger AI mcp`: Hanger's own MCP server, before anything Tauri starts.
    let args: Vec<String> = std::env::args().collect();
    if let Some(code) = tauri_app_lib::mcp_server::run_from_args(&args) {
        return code;
    }
    tauri_app_lib::run();
    std::process::ExitCode::SUCCESS
}
