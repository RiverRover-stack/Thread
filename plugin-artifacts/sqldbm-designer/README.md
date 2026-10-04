# SqlDBM Designer

Private plugin configuration using SqlDBM's existing MCP service. No custom backend or new application dependency is introduced.

## Files and data flow

- plugin.json: plugin identity and listing.
- mcp.json: remote server connection; OAuth is performed by the host.
- skills/sqldbm-design/SKILL.md: model inspection, design edits, verification, and export workflow.

Request -> host assistant -> SqlDBM MCP -> project/revision -> retrieved SQL or JSON -> host file tools -> local file or downloadable attachment.

## Connect and verify

Install the private plugin in a compatible host and connect SqlDBM through OAuth. Your company must enable MCP access and MCP Write, and your account needs the relevant project permissions. No credentials are included in this package.

Start with: "List my SqlDBM projects." Then inspect an existing design. To test writes, explicitly request a small test project in your chosen dialect, inspect its generated DDL, change one column through a new revision, and retrieve the updated model. Finally request: "Export this project's SQL to my PC" and verify the saved file or download.

## Export limitations

Direct local saves require host filesystem tools and a permitted destination. A cloud-only host needs file-generation support and a user download; this plugin does not grant remote servers access to your PC. Native canvas PNG/PDF export is not verified. Model JSON is a metadata export, not a guaranteed re-importable project file.

## Verification status

Configuration and workflow prepared from official documentation on 2026-10-02. Authenticated tool discovery, account entitlements, create/edit operations, and an end-to-end export remain unverified until sign-in. Debug connection and permissions first, then the tool response, then file generation.

Reference: https://support.sqldbm.com/hc/en-us/articles/46156179855117-SqlDBM-MCP-Server
