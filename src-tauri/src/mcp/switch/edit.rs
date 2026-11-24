//! Set one server's on/off flag in a config file's text, and leave the rest
//! of the text as its author wrote it.
//!
//! Pure functions: a string in, a string out. No filesystem, no paths, no
//! logging. `context` reads flags with them and `ops` sets them.
//!
//! Neither editor re-serialises. JSON and JSONC go through
//! `jsonc_parser::cst::CstRootNode`, TOML through `toml_edit::DocumentMut`;
//! both keep comments, spacing and key order, so the difference between what
//! comes in and what goes out is the flag.
//!
//! # The rules
//!
//! Ported from mcpick (`client-config.ts` → `set_server_enabled`,
//! `codex-adapter.ts` → `writeEnabled`; Copyright (c) 2026 Scott Spence, MIT
//! licence), with one difference: mcpick rewrites the flag on every server in
//! the file, and these functions touch the named server only.
//!
//! - `SwitchKind::EnabledKey` writes `enabled = <bool>` and removes a
//!   `disabled` key left on that entry.
//! - `SwitchKind::DisabledKey` writes `disabled = <!bool>`, unless the entry
//!   already carries `enabled`: then that key is kept and set, and `disabled`
//!   is removed.
//! - Switching on an entry that has neither key returns the text unchanged,
//!   and so does any switch whose flag already says what was asked. So a file
//!   that was never switched stays byte-identical, and off-then-on gives the
//!   original bytes back wherever the key was already there. Off-then-on of
//!   an entry that had no key leaves an explicit `enabled = true` (or
//!   `disabled = false`) behind.
//! - A flag that holds something other than `true` or `false` reads as
//!   absent, and is never overwritten: `set_enabled` refuses with
//!   `EditError::Unparseable`.
//!
//! # Where a new key goes
//!
//! - TOML: after the last key of the server's own table. An inline table
//!   (`alpha = { command = "x" }`) and dotted keys (`alpha.command = "x"`)
//!   are switched too; each stays in the shape it was written in.
//! - JSON: on a new line, first in the entry. First, because a key added last
//!   needs a comma put on the line above it unless that line already ends in
//!   one, and a key added first needs none: one line is added and no other
//!   line changes, with or without trailing commas. Two exceptions. An entry
//!   written on one line stays on one line. And where a comment shares the
//!   open brace's line (`"beta": { // note`), the key goes last, at the cost
//!   of that comma, because a key put first would carry the comment off with
//!   it.
//!
//! # Limits of the two crates (measured on 2026-11-24)
//!
//! - `toml_edit` 0.25.20 writes `\n` for every line ending and always ends a
//!   document with one, so a CRLF file and a file with no final newline do
//!   not come back as they went in. `toml_text` puts both back. A TOML file
//!   it still cannot reproduce byte for byte before the edit (one with mixed
//!   line endings) is refused, so a switch never changes a line it was not
//!   asked about.
//! - `jsonc-parser` 0.34.0 spreads an object over several lines whenever a
//!   property is inserted into it (`json_insert` folds a one-line entry back),
//!   and drops blank lines directly inside the braces of an object it inserts
//!   into. Nothing here puts those blank lines back.
//! - `CstRootNode::parse` accepts comments even with
//!   `ParseOptions::allow_comments` off, so it cannot say whether a file is
//!   strict JSON. Gemini's state file is checked with serde_json first
//!   (`parse_state`).
//!
//! Read on docs.rs on 2026-11-24, for the calls made here. Under
//! <https://docs.rs/jsonc-parser/0.34.0/jsonc_parser/>: `cst/struct.CstRootNode.html`,
//! `cst/struct.CstObject.html`, `cst/struct.CstObjectProp.html`,
//! `cst/enum.CstNode.html`, `cst/struct.CstBooleanLit.html`,
//! `cst/enum.CstInputValue.html`, `struct.ParseOptions.html`,
//! `errors/struct.ParseError.html`. Under
//! <https://docs.rs/toml_edit/0.25.20/toml_edit/>: `struct.DocumentMut.html`,
//! `enum.Item.html`, `enum.Value.html`, `trait.TableLike.html`,
//! `struct.InlineTable.html`, `struct.Decor.html`, `fn.value.html`,
//! `struct.TomlError.html`.

use jsonc_parser::cst::{CstInputValue, CstObject, CstObjectProp, CstRootNode};
use jsonc_parser::ParseOptions;
use toml_edit::{DocumentMut, InlineTable, Item, TableLike, Value};

use crate::mcp::registry::{Dialect, SwitchKind};

/// Why a file's text could not be read or edited.
///
/// No variant carries text from the file. A config line can hold a
/// credential, and these errors are on their way to a screen.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EditError {
    /// The file declares no server of that name as a table or an object.
    NotFound,
    /// The file is malformed, or holds something this module will not write
    /// over. The string is a locator (`line 4, column 12`) or one of this
    /// module's own fixed sentences. It is never a parser's message:
    /// toml_edit's quotes the line it failed on.
    Unparseable(String),
    /// Not a dialect, a kind, or a table that is switched by a flag in the
    /// server's own declaration.
    UnsupportedDialect,
}

const FLAG_IS_NOT_A_BOOLEAN: &str =
    "the server's enabled or disabled key holds something other than true or false";
const WOULD_NOT_COME_BACK: &str =
    "the file would not come back byte for byte after a rewrite; mixed line endings are the usual cause";
const NOT_TOML: &str = "the file is not TOML, and the parser did not say where it stops being so";
const STATE_ROOT_IS_NOT_AN_OBJECT: &str = "the state file is not a JSON object";

/// What `dialect::strip_jsonc` lets through to serde_json, and no more:
/// comments and trailing commas. The editor accepts the files the reader
/// accepts.
const JSONC: ParseOptions = ParseOptions {
    allow_comments: true,
    allow_loose_object_property_names: false,
    allow_trailing_commas: true,
    allow_missing_commas: false,
    allow_single_quoted_strings: false,
    allow_hexadecimal_numbers: false,
    allow_unary_plus_numbers: false,
    allow_bare_decimal_point_numbers: false,
    allow_non_finite_numbers: false,
    allow_extended_string_escapes: false,
};

/// What the file says today. `None` means the key is absent, which every
/// flag-switched engine reads as on.
///
/// Both spellings are read under either kind: `enabled: false` and
/// `disabled: true` are `Some(false)`. Where an entry carries both and they
/// disagree, the key the engine is switched by wins.
pub fn read_flag(
    body: &str,
    dialect: Dialect,
    kind: SwitchKind,
    name: &str,
) -> Result<Option<bool>, EditError> {
    let flags = match format_of(dialect, kind)? {
        Format::Json(map_key) => {
            let root = parse_json(body, &JSONC)?;
            json_flags(&json_entry(&root, map_key, name)?)
        }
        Format::Toml => toml_flags(toml_entry(&parse_toml(body)?, name)?),
    };
    Ok(reading(kind, flags))
}

/// The whole file with one server's flag set. Pure: a string in, a string out.
pub fn set_enabled(
    body: &str,
    dialect: Dialect,
    kind: SwitchKind,
    name: &str,
    enabled: bool,
) -> Result<String, EditError> {
    match format_of(dialect, kind)? {
        Format::Json(map_key) => json_set_enabled(body, map_key, kind, name, enabled),
        Format::Toml => toml_set_enabled(body, kind, name, enabled),
    }
}

/// Whether Gemini CLI's state file leaves `name` switched on.
///
/// `body` is `None` when the file does not exist yet. The key is
/// `name.to_lowercase().trim()`, as Gemini's own reader does, and its rule is
/// `state?.enabled ?? true`: only an entry that says `"enabled": false` is
/// off. An `enabled` that is neither a boolean nor null is `Unparseable`:
/// Gemini would decide it by JavaScript truthiness, and this does not guess.
/// Gemini reads the file with `JSON.parse`, so it has to be strict JSON here
/// too.
pub fn gemini_is_enabled(body: Option<&str>, name: &str) -> Result<bool, EditError> {
    let Some(text) = body else { return Ok(true) };
    let root = parse_state(text)?;
    match last_prop(&state_object(&root)?, &gemini_key(name)) {
        Some(entry) => gemini_entry_is_on(&entry),
        None => Ok(true),
    }
}

/// Gemini CLI's state file with `name` switched off or on.
///
/// Off writes `{"enabled": false}` under the key; on removes the key. Other
/// keys are untouched. With no file, off starts from `{}`, and on returns
/// `{}`: there is no key to remove. Where nothing needs to change the text
/// comes back as it went in.
pub fn gemini_set_enabled(
    body: Option<&str>,
    name: &str,
    enabled: bool,
) -> Result<String, EditError> {
    let text = body.unwrap_or("{}");
    let root = parse_state(text)?;
    let state = state_object(&root)?;
    let key = gemini_key(name);
    let off = || CstInputValue::Object(vec![("enabled".to_string(), CstInputValue::Bool(false))]);

    if enabled {
        let held = props_named(&state, &key);
        if held.is_empty() {
            return Ok(text.to_string());
        }
        held.into_iter().for_each(CstObjectProp::remove);
    } else {
        match last_prop(&state, &key) {
            Some(entry) if gemini_entry_is_on(&entry) == Ok(false) => return Ok(text.to_string()),
            Some(entry) => entry.set_value(off()),
            None => {
                state.append(&key, off());
            }
        }
    }
    Ok(root.to_string())
}

// --- The rules, once, for both formats -------------------------------------

enum Format {
    /// JSON or JSONC, with the key the servers live under.
    Json(&'static str),
    Toml,
}

/// Which format a dialect is, and for JSON the key its servers live under.
/// The keys repeat the ones `dialect::parse` reads from, for the dialects a
/// flag can switch.
fn format_of(dialect: Dialect, kind: SwitchKind) -> Result<Format, EditError> {
    if !matches!(kind, SwitchKind::EnabledKey | SwitchKind::DisabledKey) {
        return Err(EditError::UnsupportedDialect);
    }
    match dialect {
        Dialect::McpServers => Ok(Format::Json("mcpServers")),
        Dialect::VsCodeServers => Ok(Format::Json("servers")),
        Dialect::OpenCodeMcp => Ok(Format::Json("mcp")),
        Dialect::ZedContextServers => Ok(Format::Json("context_servers")),
        Dialect::AmpSettingsKey => Ok(Format::Json("amp.mcpServers")),
        Dialect::CodexToml => Ok(Format::Toml),
        Dialect::ClaudeJson | Dialect::ClaudeAiConnectors | Dialect::Unsupported => {
            Err(EditError::UnsupportedDialect)
        }
    }
}

/// One flag key as an entry holds it.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Held {
    Absent,
    Bool(bool),
    /// Present, and not `true` or `false`.
    Other,
}

#[derive(Clone, Copy)]
struct Flags {
    enabled: Held,
    disabled: Held,
}

fn reading(kind: SwitchKind, flags: Flags) -> Option<bool> {
    let enabled = match flags.enabled {
        Held::Bool(value) => Some(value),
        _ => None,
    };
    let disabled = match flags.disabled {
        Held::Bool(value) => Some(!value),
        _ => None,
    };
    match kind {
        SwitchKind::DisabledKey => disabled.or(enabled),
        _ => enabled.or(disabled),
    }
}

enum Change {
    Nothing,
    Write {
        key: &'static str,
        value: bool,
        drop_disabled: bool,
    },
}

fn change(kind: SwitchKind, flags: Flags, enabled: bool) -> Result<Change, EditError> {
    if flags.enabled == Held::Other || flags.disabled == Held::Other {
        return Err(EditError::Unparseable(FLAG_IS_NOT_A_BOOLEAN.to_string()));
    }
    let (key, held, value, drop_disabled) =
        if kind == SwitchKind::EnabledKey || flags.enabled != Held::Absent {
            ("enabled", flags.enabled, enabled, flags.disabled != Held::Absent)
        } else {
            ("disabled", flags.disabled, !enabled, false)
        };
    let already_says_it = held == Held::Bool(value);
    let on_with_no_flag = enabled && held == Held::Absent;
    if !drop_disabled && (already_says_it || on_with_no_flag) {
        return Ok(Change::Nothing);
    }
    Ok(Change::Write { key, value, drop_disabled })
}

fn locator(line: usize, column: usize) -> String {
    format!("line {line}, column {column}")
}

// --- JSON and JSONC ---------------------------------------------------------

fn parse_json(body: &str, options: &ParseOptions) -> Result<CstRootNode, EditError> {
    // Line and column only. `ParseError`'s Display adds its kind, which is a
    // fixed sentence today; a locator is all a caller needs and all that is
    // certain to stay free of the file's text.
    CstRootNode::parse(body, options)
        .map_err(|e| EditError::Unparseable(locator(e.line_display(), e.column_display())))
}

fn props_named(object: &CstObject, name: &str) -> Vec<CstObjectProp> {
    object
        .properties()
        .into_iter()
        .filter(|prop| prop.decoded_name().as_deref() == Some(name))
        .collect()
}

/// The last property of that name. Last, because a key written twice is read
/// as its last value by serde_json and by the engines' own parsers, and
/// `CstObject::get` returns the first.
fn last_prop(object: &CstObject, name: &str) -> Option<CstObjectProp> {
    props_named(object, name).pop()
}

fn json_entry(root: &CstRootNode, map_key: &str, name: &str) -> Result<CstObject, EditError> {
    root.object_value()
        .and_then(|file| last_prop(&file, map_key))
        .and_then(|servers| servers.object_value())
        .and_then(|servers| last_prop(&servers, name))
        .and_then(|entry| entry.object_value())
        .ok_or(EditError::NotFound)
}

fn json_flags(entry: &CstObject) -> Flags {
    let held = |key: &str| match last_prop(entry, key) {
        None => Held::Absent,
        Some(prop) => match prop.value().and_then(|value| value.as_boolean_lit()) {
            Some(literal) => Held::Bool(literal.value()),
            None => Held::Other,
        },
    };
    Flags { enabled: held("enabled"), disabled: held("disabled") }
}

fn json_set_enabled(
    body: &str,
    map_key: &str,
    kind: SwitchKind,
    name: &str,
    enabled: bool,
) -> Result<String, EditError> {
    let root = parse_json(body, &JSONC)?;
    let entry = json_entry(&root, map_key, name)?;
    let Change::Write { key, value, drop_disabled } = change(kind, json_flags(&entry), enabled)?
    else {
        return Ok(body.to_string());
    };
    if drop_disabled {
        props_named(&entry, "disabled").into_iter().for_each(CstObjectProp::remove);
    }
    match last_prop(&entry, key).and_then(|prop| prop.value()).and_then(|v| v.as_boolean_lit()) {
        Some(literal) => literal.set_value(value),
        None => json_insert(&entry, key, value),
    }
    Ok(root.to_string())
}

/// Add `key` to an entry that does not have it. See "Where a new key goes" in
/// the module doc.
fn json_insert(entry: &CstObject, key: &str, value: bool) {
    let before = entry.children();
    if before.iter().any(|child| child.is_newline()) {
        let comment_beside_brace = before
            .iter()
            .skip(1)
            .take_while(|child| !child.is_newline())
            .any(|child| child.is_comment());
        if comment_beside_brace {
            entry.append(key, CstInputValue::Bool(value));
        } else {
            entry.insert(0, key, CstInputValue::Bool(value));
        }
        return;
    }

    // An entry on one line. jsonc-parser gives every property a line of its
    // own once one is inserted, so each line break it added is taken out
    // again, and the indent after it becomes whatever followed the open brace
    // before: a space in `{ "a": 1 }`, nothing in `{"a":1}`.
    let pad = before
        .get(1)
        .and_then(|child| child.as_whitespace())
        .map(|space| space.value())
        .unwrap_or_default();
    entry.insert(0, key, CstInputValue::Bool(value));
    let mut after_newline = false;
    for child in entry.children() {
        if child.is_newline() {
            child.remove();
            after_newline = true;
            continue;
        }
        if after_newline {
            if let Some(indent) = child.as_whitespace() {
                if pad.is_empty() {
                    child.remove();
                } else {
                    indent.set_value(pad.clone());
                }
            }
        }
        after_newline = false;
    }
}

// --- Gemini CLI's state file ------------------------------------------------

fn gemini_key(name: &str) -> String {
    name.to_lowercase().trim().to_string()
}

/// The state file as an editable tree, once it is known to be something
/// `JSON.parse` would accept. serde_json makes that check, and builds
/// nothing: jsonc-parser's tree takes comments whatever its options say.
fn parse_state(text: &str) -> Result<CstRootNode, EditError> {
    serde_json::from_str::<serde::de::IgnoredAny>(text)
        .map_err(|e| EditError::Unparseable(locator(e.line(), e.column())))?;
    parse_json(text, &JSONC)
}

fn state_object(root: &CstRootNode) -> Result<CstObject, EditError> {
    root.object_value()
        .ok_or_else(|| EditError::Unparseable(STATE_ROOT_IS_NOT_AN_OBJECT.to_string()))
}

/// `state?.enabled ?? true`, for one entry of the state file.
fn gemini_entry_is_on(entry: &CstObjectProp) -> Result<bool, EditError> {
    let Some(state) = entry.object_value() else { return Ok(true) };
    let Some(value) = last_prop(&state, "enabled").and_then(|prop| prop.value()) else {
        return Ok(true);
    };
    if let Some(literal) = value.as_boolean_lit() {
        return Ok(literal.value());
    }
    if value.as_null_keyword().is_some() {
        return Ok(true);
    }
    Err(EditError::Unparseable(FLAG_IS_NOT_A_BOOLEAN.to_string()))
}

// --- Codex TOML -------------------------------------------------------------

fn parse_toml(body: &str) -> Result<DocumentMut, EditError> {
    // `TomlError`'s Display quotes the source line it failed on and its
    // message can name a key, so neither leaves this function: only where the
    // error starts. `dialect::parse_codex_toml` cuts its error down the same
    // way, for the same reason.
    body.parse::<DocumentMut>().map_err(|e| {
        let Some(span) = e.span() else {
            return EditError::Unparseable(NOT_TOML.to_string());
        };
        let mut end = span.start.min(body.len());
        while !body.is_char_boundary(end) {
            end -= 1;
        }
        let before = &body[..end];
        let line = before.matches('\n').count() + 1;
        let column = before.rsplit('\n').next().unwrap_or("").chars().count() + 1;
        EditError::Unparseable(locator(line, column))
    })
}

fn toml_declared<'a>(doc: &'a DocumentMut, table: &str, name: &str) -> Option<&'a dyn TableLike> {
    doc.get(table)
        .and_then(Item::as_table_like)
        .and_then(|servers| servers.get(name))
        .and_then(Item::as_table_like)
}

/// The server's entry under `mcp_servers`. A server found only under the
/// legacy `tools` table is read by `dialect::parse_codex_toml` and is not
/// switched here: `enabled` was confirmed for `[mcp_servers.*]` alone.
fn toml_entry<'a>(doc: &'a DocumentMut, name: &str) -> Result<&'a dyn TableLike, EditError> {
    match toml_declared(doc, "mcp_servers", name) {
        Some(entry) => Ok(entry),
        None if toml_declared(doc, "tools", name).is_some() => Err(EditError::UnsupportedDialect),
        None => Err(EditError::NotFound),
    }
}

fn toml_flags(entry: &dyn TableLike) -> Flags {
    let held = |key: &str| match entry.get(key) {
        None => Held::Absent,
        Some(item) => item.as_bool().map(Held::Bool).unwrap_or(Held::Other),
    };
    Flags { enabled: held("enabled"), disabled: held("disabled") }
}

fn toml_set_enabled(
    body: &str,
    kind: SwitchKind,
    name: &str,
    enabled: bool,
) -> Result<String, EditError> {
    let mut doc = parse_toml(body)?;
    let flags = toml_flags(toml_entry(&doc, name)?);
    let Change::Write { key, value, drop_disabled } = change(kind, flags, enabled)? else {
        return Ok(body.to_string());
    };
    if toml_text(&doc, body) != body {
        return Err(EditError::Unparseable(WOULD_NOT_COME_BACK.to_string()));
    }

    let item = doc
        .get_mut("mcp_servers")
        .and_then(Item::as_table_like_mut)
        .and_then(|servers| servers.get_mut(name))
        .ok_or(EditError::NotFound)?;
    if let Some(entry) = item.as_table_like_mut() {
        if drop_disabled {
            entry.remove("disabled");
        }
    }
    let adding = item.as_table_like().is_some_and(|entry| !entry.contains_key(key));
    if adding {
        if let Some(inline) = item.as_inline_table_mut() {
            close_up_last_value(inline);
        }
    }
    let entry = item.as_table_like_mut().ok_or(EditError::NotFound)?;
    match entry.get_mut(key) {
        // Keep what surrounds the old value: a comment after it stays.
        Some(Item::Value(held)) => {
            let mut next = Value::from(value);
            *next.decor_mut() = held.decor().clone();
            *held = next;
        }
        _ => {
            entry.insert(key, toml_edit::value(value));
        }
    }
    Ok(toml_text(&doc, body))
}

/// toml_edit keeps the old last value's trailing space when it adds a value
/// after it, which reads `{ a = 1 , b = 2 }`. The new value brings its own
/// space before the brace, so the old one is dropped.
fn close_up_last_value(inline: &mut InlineTable) {
    let Some((_, last)) = inline.iter_mut().last() else { return };
    let only_space = last
        .decor()
        .suffix()
        .and_then(|suffix| suffix.as_str())
        .is_some_and(|suffix| suffix.trim().is_empty());
    if only_space {
        last.decor_mut().set_suffix("");
    }
}

/// The document as text, with the two things toml_edit does not keep put
/// back: CRLF line endings, where `body` used them throughout, and the lack
/// of a final newline.
fn toml_text(doc: &DocumentMut, body: &str) -> String {
    let mut text = doc.to_string();
    let crlf_throughout =
        body.contains("\r\n") && body.matches('\n').count() == body.matches("\r\n").count();
    if crlf_throughout {
        text = text.replace('\n', "\r\n");
    }
    if !body.ends_with('\n') {
        let ending = if crlf_throughout { "\r\n" } else { "\n" };
        if let Some(unended) = text.strip_suffix(ending) {
            text = unended.to_string();
        }
    }
    text
}
