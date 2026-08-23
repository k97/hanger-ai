//! `tool_cost`: the description half of a tool definition, measured in
//! bytes because bytes are the fact (Karthik, 2026-08-23: not tiktoken).

use tauri_app_lib::mcp::probe::{tool_cost, ProbeResult, ProbedTool};

fn result(tools: Vec<ProbedTool>) -> ProbeResult {
    ProbeResult { tools, ..Default::default() }
}

#[test]
fn sums_utf8_bytes_of_every_description_and_counts_the_described() {
    let r = result(vec![
        ProbedTool { name: "a".into(), description: Some("Get volume".into()) },   // 10 B
        ProbedTool { name: "b".into(), description: None },
        ProbedTool { name: "c".into(), description: Some("0–100".into()) },        // 7 B: the en dash is 3
    ]);
    let cost = tool_cost(&r);
    assert_eq!(cost.tool_count, 3);
    assert_eq!(cost.described_tool_count, 2);
    assert_eq!(cost.description_bytes_total, 17);
    assert_eq!(cost.per_tool.len(), 3);
    assert_eq!(cost.per_tool[0].description_bytes, 10);
    assert_eq!(cost.per_tool[1].description_bytes, 0);
    assert_eq!(cost.per_tool[2].description_bytes, 7);
}

#[test]
fn serialises_camel_case_for_the_panel() {
    let cost = tool_cost(&result(vec![ProbedTool { name: "a".into(), description: Some("x".into()) }]));
    let json = serde_json::to_string(&cost).unwrap();
    assert!(json.contains("\"toolCount\":1"));
    assert!(json.contains("\"describedToolCount\":1"));
    assert!(json.contains("\"descriptionBytesTotal\":1"));
    assert!(json.contains("\"perTool\":[{\"name\":\"a\",\"descriptionBytes\":1}]"));
}
