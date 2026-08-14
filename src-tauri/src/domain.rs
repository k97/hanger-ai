use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum Scope {
    Global { agent: String },
    /// Committed to the repository — `.mcp.json` and friends. Shared with the
    /// team.
    Project { agent: String, root: String },
    /// Declared in a machine-level file but keyed to one repository —
    /// `~/.claude.json` `projects[root]`. Private to this user; never in
    /// version control. Renders in the repo pane, not the profile.
    Local { agent: String, root: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub path: String,
    pub source_origin: Option<String>,
    pub scope: Option<Scope>,
    pub drifted: Option<bool>,
    pub is_symlink: Option<bool>,
    pub source_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parse_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parse_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub link_state: Option<LinkState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub global_config_path: Option<String>,
    pub project_footprints: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tool {
    pub id: String,
    pub name: String,
    pub command: String,
    /// Arguments the command needs to actually be a server.
    ///
    /// `~/.claude.json` declares spades-audio as `node <path-to-index.js>`.
    /// Without the arguments the Verify probe launches a bare Node REPL that
    /// never speaks MCP, so the panel's tool list can never populate.
    #[serde(default)]
    pub args: Vec<String>,
    pub transport: String,
    pub config_path: String,
    pub scope: Scope,
    pub owning_agent: String,
    pub drifted: Option<bool>,
    pub is_symlink: Option<bool>,
    pub source_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parse_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parse_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub link_state: Option<LinkState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rule {
    pub id: String,
    pub name: String,
    pub path: String,
    pub content: String,
    pub scope: Option<Scope>,
    pub drifted: Option<bool>,
    pub is_symlink: Option<bool>,
    pub source_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parse_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parse_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub link_state: Option<LinkState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectScan {
    pub path: String,
    pub layered: bool,
    pub rule_chains: std::collections::HashMap<String, Vec<String>>,
    pub parse_warnings: Vec<String>,
    /// Directories beneath this root that qualify as repositories in their own
    /// right. Collected during the walk this root already performs, so probing
    /// costs nothing extra. Includes candidates that are already linked — the
    /// frontend subtracts the linked set.
    #[serde(default)]
    pub nested_repo_candidates: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subagent {
    pub id: String,
    pub name: String,
    pub description: String,
    pub path: String,
    pub declared_tools: Vec<String>,
    pub scope: Option<Scope>,
    pub source_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parse_status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parse_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub link_state: Option<LinkState>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Inventory {
    pub skills: Vec<Skill>,
    pub agents: Vec<Agent>,
    pub tools: Vec<Tool>,
    pub rules: Vec<Rule>,
    pub subagents: Vec<Subagent>,
    pub project_scans: Vec<ProjectScan>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleSection {
    pub heading: Option<String>,
    pub heading_level: usize,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedRuleMergeData {
    pub source_sections: Vec<RuleSection>,
    pub target_sections: Vec<RuleSection>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum Mechanism {
    Symlink,
    Copy,
    TrackedCopy,
}

/// Hydrated view joining deployment `links` table with `assets.abs_path` (as `source_path`).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct HydratedLink {
    pub id: i64,
    pub asset_id: i64,
    pub dest_root_id: i64,
    pub source_path: String,
    pub dest_path: String,
    pub mechanism: Mechanism,
    pub source_hash: String,
    pub dest_hash: Option<String>,
    pub created_at: i64,
    pub last_verified_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LinkState {
    Linked,
    Drifted,
    Foreign,
    Broken,
    Pending,
}

impl serde::Serialize for LinkState {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self {
            LinkState::Linked => serializer.serialize_str("linked"),
            LinkState::Drifted => serializer.serialize_str("drifted"),
            LinkState::Foreign => serializer.serialize_str("foreign"),
            LinkState::Broken => serializer.serialize_str("broken"),
            LinkState::Pending => serializer.serialize_none(),
        }
    }
}

impl<'de> serde::Deserialize<'de> for LinkState {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let opt = Option::<String>::deserialize(deserializer)?;
        match opt.as_deref() {
            Some("linked") => Ok(LinkState::Linked),
            Some("drifted") => Ok(LinkState::Drifted),
            Some("foreign") => Ok(LinkState::Foreign),
            Some("broken") => Ok(LinkState::Broken),
            None => Ok(LinkState::Pending),
            Some(other) => Err(serde::de::Error::custom(format!("Unknown LinkState: {}", other))),
        }
    }
}

pub fn resolve_state(
    link: &HydratedLink,
    source_hash_now: Option<&str>,
    dest_exists: bool,
    symlink_target: Option<&std::path::Path>,
) -> LinkState {
    if !dest_exists {
        return LinkState::Broken;
    }

    match link.mechanism {
        Mechanism::Symlink => {
            match symlink_target {
                Some(target) => {
                    let expected_source = std::path::Path::new(&link.source_path);
                    if target == expected_source {
                        LinkState::Linked
                    } else {
                        LinkState::Foreign
                    }
                }
                None => {
                    // Destination exists on disk (dest_exists == true), but symlink_target is None (destination holds a regular file).
                    // Outcome: Foreign. Destination exists as an asset, but its filesystem mechanism (regular file) does not match
                    // the managed link (Symlink). It represents a local unmanaged edit/replacement, not a missing file (Broken).
                    LinkState::Foreign
                }
            }
        }
        Mechanism::Copy | Mechanism::TrackedCopy => {
            if symlink_target.is_some() {
                // Destination holds a symlink when Mechanism expects Copy/TrackedCopy -> Mechanism mismatch (Foreign)
                return LinkState::Foreign;
            }

            match source_hash_now {
                Some(now_hash) => {
                    if link.source_hash == now_hash {
                        LinkState::Linked
                    } else {
                        LinkState::Drifted
                    }
                }
                None => LinkState::Pending, // Pass 2 pending
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CategoryCount {
    pub total: usize,
    pub global: usize,
    pub project: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CategoryCountNode {
    pub category: String,
    pub count: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RepoTreeNode {
    pub path: String,
    pub label: String,
    pub total: usize,
    pub categories: Vec<CategoryCountNode>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GlobalTreeNode {
    pub total: usize,
    pub categories: Vec<CategoryCountNode>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TreeCounts {
    pub global: GlobalTreeNode,
    pub repositories: Vec<RepoTreeNode>,
    pub repositories_total: usize,
    pub total: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AssetCounts {
    pub total_assets: usize,
    pub skill: Option<CategoryCount>,
    pub rule: Option<CategoryCount>,
    pub subagent: Option<CategoryCount>,
    pub tool: Option<CategoryCount>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub engines: Option<std::collections::HashMap<String, usize>>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_assets_carry_resolved_link_state() {
        let skill = Skill {
            id: "s1".into(),
            name: "test-skill".into(),
            description: "".into(),
            version: "1.0".into(),
            path: "/path".into(),
            source_origin: None,
            scope: None,
            drifted: None,
            is_symlink: Some(true),
            source_path: None,
            parse_status: None,
            parse_error: None,
            link_state: Some(LinkState::Linked),
        };
        let tool = Tool {
            id: "t1".into(),
            name: "test-tool".into(),
            command: "".into(),
            args: vec![],
            transport: "".into(),
            config_path: "/path".into(),
            scope: Scope::Global { agent: "claude".into() },
            owning_agent: "claude".into(),
            drifted: None,
            is_symlink: None,
            source_path: None,
            parse_status: None,
            parse_error: None,
            link_state: Some(LinkState::Foreign),
        };
        let rule = Rule {
            id: "r1".into(),
            name: "test-rule".into(),
            path: "/path".into(),
            content: "".into(),
            scope: None,
            drifted: None,
            is_symlink: None,
            source_path: None,
            parse_status: None,
            parse_error: None,
            link_state: Some(LinkState::Broken),
        };
        let subagent = Subagent {
            id: "sa1".into(),
            name: "test-subagent".into(),
            description: "".into(),
            path: "/path".into(),
            declared_tools: vec![],
            scope: None,
            source_path: None,
            parse_status: None,
            parse_error: None,
            link_state: None,
        };

        assert_eq!(skill.link_state, Some(LinkState::Linked));
        assert_eq!(tool.link_state, Some(LinkState::Foreign));
        assert_eq!(rule.link_state, Some(LinkState::Broken));
        assert_eq!(subagent.link_state, None);
    }

    #[test]
    fn local_scope_serialises_distinctly_from_project_scope() {
        let local = Scope::Local { agent: "claude-code".into(), root: "/repo/a".into() };
        let project = Scope::Project { agent: "claude-code".into(), root: "/repo/a".into() };

        let local_json = serde_json::to_string(&local).unwrap();
        let project_json = serde_json::to_string(&project).unwrap();

        assert!(local_json.contains("Local"), "got {}", local_json);
        assert_ne!(local_json, project_json, "Local must not serialise as Project");

        let round_tripped: Scope = serde_json::from_str(&local_json).unwrap();
        assert_eq!(round_tripped, local);
    }
}

