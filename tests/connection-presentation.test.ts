import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

test("connection presentation labels AI output, hides absent results and optional questions, and escapes text", () => {
  // Use React's browser/server-rendering build: the suite's react-server condition
  // intentionally disables the rendering API needed to verify the client component.
  const output = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
    import React from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    import connectionModule from "./components/thoughts/ThoughtConnection.tsx";
    const { ConnectionContent } = connectionModule;
    const result = {
      hasConnection: true,
      connection: "<script>unexpected()</script>",
      implication: "A device benchmark could supply evidence.",
      questionToExplore: "Which metric would help?",
    };
    const render = (value) => renderToStaticMarkup(React.createElement(ConnectionContent, { result: value }));
    console.log(JSON.stringify({
      connected: render(result),
      nullQuestion: render({ ...result, questionToExplore: null }),
      omittedQuestion: render({ hasConnection: true, connection: result.connection, implication: result.implication }),
      noConnection: render({ hasConnection: false, connection: null, implication: null, questionToExplore: null }),
    }));
  `], { cwd: process.cwd(), encoding: "utf8" });
  const rendered: { connected: string; nullQuestion: string; omittedQuestion: string; noConnection: string } = JSON.parse(output);
  assert.match(rendered.connected, /AI INTERPRETED/);
  assert.match(rendered.connected, /You were onto something/);
  assert.match(rendered.connected, /Why this matters/);
  assert.match(rendered.connected, /A device benchmark could supply evidence/);
  assert.match(rendered.connected, /Which metric would help/);
  assert.match(rendered.connected, /aria-labelledby="connection-heading"/);
  assert.match(rendered.connected, /&lt;script&gt;/);
  assert.doesNotMatch(rendered.connected, /<script>/);
  for (const withoutQuestion of [rendered.nullQuestion, rendered.omittedQuestion]) {
    assert.match(withoutQuestion, /Why this matters/);
    assert.doesNotMatch(withoutQuestion, /Question to explore/);
    assert.doesNotMatch(withoutQuestion, /Which metric would help/);
  }
  assert.equal(rendered.noConnection, "");
});
