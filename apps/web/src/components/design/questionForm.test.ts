import { describe, expect, it } from "vite-plus/test";

import { splitQuestionFormSegments } from "./questionForm";

const FORM = `<question-form id="discovery" title="T">{"questions":[{"id":"a","label":"A","type":"text"}]}</question-form>`;

describe("splitQuestionFormSegments", () => {
  it("splits text, form, text", () => {
    const s = splitQuestionFormSegments(`hi\n${FORM}\nbye`);
    expect(s.map((x) => x.kind)).toEqual(["text", "form", "text"]);
  });
  it("returns plain text untouched", () => {
    expect(splitQuestionFormSegments("hello <b>x</b>")).toEqual([
      { kind: "text", text: "hello <b>x</b>" },
    ]);
  });
  it("hides an unterminated block while streaming", () => {
    const s = splitQuestionFormSegments(`intro\n<question-form id="d">{"questions":[{"id"`);
    expect(s).toEqual([{ kind: "text", text: "intro\n" }]);
  });
  it("hides a partial opening tag", () => {
    expect(splitQuestionFormSegments("intro <question-fo")).toEqual([
      { kind: "text", text: "intro " },
    ]);
  });
  it("keeps a completed form followed by an unterminated one", () => {
    const s = splitQuestionFormSegments(`${FORM}\n<question-form id="x">{"qu`);
    expect(s.map((x) => x.kind)).toEqual(["form"]);
  });
});
