# Third-party notices

## mcpick

Parts of Hanger's behaviour for switching an MCP server off and on derive from
[mcpick](https://github.com/spences10/mcpick) by Scott Spence: the rules for
setting a server's flag (`src-tauri/src/mcp/switch/edit.rs`), the safe write
and its backups (`src-tauri/src/mcp/switch/apply.rs`), and the two `claude mcp`
commands Claude Code is switched through
(`src-tauri/src/mcp/switch/vendor.rs`). Each of those files names the mcpick
source it follows and where it differs. They are written in Rust for Hanger;
no mcpick code is bundled with Hanger, and Hanger never runs mcpick.

mcpick is distributed under the MIT License:

```
MIT License

Copyright (c) 2026 Scott Spence

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
