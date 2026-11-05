import { test } from "node:test";
import assert from "node:assert/strict";
import { createNoteWriter } from "../src/lib/note-writer.ts";

type Note = { id: string; text: string };
function fixture() {
  const events: string[] = [];
  const errors: unknown[] = [];
  const server = new Map<string, Note>();
  let pause: (() => Promise<void>) | undefined;
  let fail = false;
  const writer = createNoteWriter<Note>({
    create: async (note) => { events.push(`create:${note.text}`); if (pause) await pause(); if (fail) { fail = false; throw new Error("offline"); } server.set(note.id, note); },
    update: async (note) => { events.push(`update:${note.text}`); if (pause) await pause(); if (fail) { fail = false; throw new Error("offline"); } server.set(note.id, note); },
    remove: async (id) => { events.push(`delete:${id}`); server.delete(id); },
    equal: (a, b) => a.text === b.text,
    onError: (error) => { errors.push(error); },
  });
  return { writer, events, errors, server, setPause: (value: (() => Promise<void>) | undefined) => { pause = value; }, failNext: () => { fail = true; } };
}

test("rapid edits are sent in order and the newest content wins", async () => {
  const f = fixture(); let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  f.setPause(() => gate);
  const first = f.writer.save([{ id: "n", text: "first" }]);
  const second = f.writer.save([{ id: "n", text: "second" }]);
  await Promise.resolve(); assert.deepEqual(f.events, ["create:first"]);
  release(); assert.equal(await first, true); assert.equal(await second, true);
  assert.deepEqual(f.events, ["create:first", "update:second"]);
  assert.equal(f.server.get("n")?.text, "second");
});

test("a failed save is reported and a retry is not mistaken for confirmed data", async () => {
  const f = fixture(); f.failNext();
  assert.equal(await f.writer.save([{ id: "n", text: "keep my edit" }]), false);
  assert.equal(f.errors.length, 1); assert.equal(f.server.size, 0);
  assert.equal(await f.writer.save([{ id: "n", text: "keep my edit" }]), true);
  assert.deepEqual(f.events, ["create:keep my edit", "create:keep my edit"]);
});

test("unchanged notes are not rewritten and deletion follows earlier saves", async () => {
  const f = fixture(); const note = { id: "n", text: "saved" };
  await f.writer.save([note]); await f.writer.save([note]); await f.writer.save([]);
  assert.deepEqual(f.events, ["create:saved", "delete:n"]); assert.equal(f.server.size, 0);
});

test("changing the account generation cancels queued work", async () => {
  const f = fixture(); let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  f.setPause(() => gate);
  const first = f.writer.save([{ id: "old", text: "old account" }]);
  const queued = f.writer.save([{ id: "old", text: "must not run" }]);
  await Promise.resolve(); f.writer.reset([]); release();
  assert.equal(await first, false); assert.equal(await queued, false);
  assert.deepEqual(f.events, ["create:old account"]);
  f.setPause(undefined); await f.writer.save([{ id: "new", text: "new account" }]);
  assert.equal(f.server.get("new")?.text, "new account");
});
