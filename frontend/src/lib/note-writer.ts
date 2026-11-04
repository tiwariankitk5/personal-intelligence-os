/** Serialises browser writes; this does not replace server-side cross-device conflict control. */
export function createNoteWriter<T extends { id: string }>(io: {
  create: (note: T) => Promise<unknown>;
  update: (note: T) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
  equal: (left: T, right: T) => boolean;
  onError: (error: unknown) => void;
}) {
  let confirmed: T[] = [];
  let generation = 0;
  let queue: Promise<boolean> = Promise.resolve(true);
  return {
    reset(notes: T[]) { generation++; confirmed = [...notes]; },
    save(notes: T[]): Promise<boolean> {
      const snapshot = [...notes];
      const ownerGeneration = generation;
      const work = async () => {
        if (ownerGeneration !== generation) return false;
        const previous = [...confirmed];
        const previousMap = new Map(previous.map((note) => [note.id, note]));
        const nextIds = new Set(snapshot.map((note) => note.id));
        try {
          for (const note of snapshot) {
            if (ownerGeneration !== generation) return false;
            const old = previousMap.get(note.id);
            if (!old) await io.create(note);
            else if (!io.equal(old, note)) await io.update(note);
            if (ownerGeneration !== generation) return false;
            confirmed = [...confirmed.filter((row) => row.id !== note.id), note];
          }
          for (const old of previous) if (!nextIds.has(old.id)) {
            if (ownerGeneration !== generation) return false;
            await io.remove(old.id);
            if (ownerGeneration !== generation) return false;
            confirmed = confirmed.filter((row) => row.id !== old.id);
          }
          confirmed = snapshot;
          return true;
        } catch (error) {
          if (ownerGeneration === generation) io.onError(error);
          return false;
        }
      };
      queue = queue.then(work, work);
      return queue;
    },
  };
}
