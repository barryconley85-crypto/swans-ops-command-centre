import { describe, expect, it } from "vitest";
import { omitUndefinedFields } from "../client/src/lib/firestorePayload";

describe("omitUndefinedFields", () => {
  it("removes omitted optional fields while preserving null and defined values", () => {
    expect(omitUndefinedFields({ assignmentType: "on_call", startTime: undefined, endTime: undefined, note: null, memberId: 42 })).toEqual({ assignmentType: "on_call", note: null, memberId: 42 });
  });
});
