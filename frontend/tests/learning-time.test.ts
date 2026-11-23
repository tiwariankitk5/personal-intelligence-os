import test from "node:test";
import assert from "node:assert/strict";
import { formatLearningTime, parseLearningTime } from "../src/lib/learning-time.ts";
test("video note times round-trip between seconds, minutes and hours", () => {
  for (const seconds of [0,59,192,3599,3723,86400]) assert.equal(parseLearningTime(formatLearningTime(seconds)),seconds);
  assert.equal(parseLearningTime("192"),192);
});
test("malformed timestamps cannot silently pin notes at another time", () => {
  for (const value of ["", "abc", "1:99", "1:60:00", "-1", "25:00:00"]) assert.throws(() => parseLearningTime(value));
});
