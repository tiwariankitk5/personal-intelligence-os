"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ApiObjective, CourseView, LearningLesson, LessonFeedback, createObjective, deleteObjective,
  getCourse, setCoursePace, deleteCourseLesson, setLessonComplete, answerLessonQuestion,
  removeLessonQuestion, addLessonTimedNote, removeLessonTimedNote, exportLessonTimedNote,
} from "@/lib/api";
import { formatLearningTime, parseLearningTime } from "@/lib/learning-time";
import LearningLessonEditor from "./learning-lesson-editor";
import LearningQuestionForm from "./learning-question-form";

type Props = {
  objectives: ApiObjective[]; onCreated: (objective: ApiObjective) => void; onRemoved: (id: string) => void;
  onProgress: (id: string, progress: number) => void; onNoteExported: () => Promise<void>;
  onOpenProviders: () => void; onToast: (message: string) => void;
};
export default function LearningWorkspace({ objectives, onCreated, onRemoved, onProgress, onNoteExported, onOpenProviders, onToast }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(objectives[0]?.id || null);
  const selectedRef = useRef(selectedId); selectedRef.current = selectedId;
  const [course, setCourse] = useState<CourseView | null>(null);
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [createOpen, setCreateOpen] = useState(!objectives.length);
  const [title, setTitle] = useState(""); const [category, setCategory] = useState("Backend Engineering");
  const [description, setDescription] = useState("");
  const [editorOpen, setEditorOpen] = useState(false); const [editing, setEditing] = useState<LearningLesson | undefined>();
  const pendingSeek = useRef<{ lesson: string; seconds: number } | null>(null);
  const [seekSeconds, setSeekSeconds] = useState(0); const [play, setPlay] = useState(false); const [videoNonce, setVideoNonce] = useState(0);
  const [noteBody, setNoteBody] = useState(""); const [noteTime, setNoteTime] = useState("0:00");
  const [choices, setChoices] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<Record<string, LessonFeedback>>({}); const [placement, setPlacement] = useState(false);
  const objective = objectives.find((item) => item.id === selectedId);
  const lesson = course?.lessons.find((item) => item.id === lessonId);

  function apply(value: CourseView) {
    if (selectedRef.current !== value.objectiveId) return;
    setCourse(value); onProgress(value.objectiveId, value.progress);
    setLessonId((old) => value.lessons.some((item) => item.id === old) ? old : value.lessons[0]?.id || null);
  }
  async function refresh(id = selectedRef.current) {
    if (!id) return;
    try { const value = await getCourse(id); if (selectedRef.current === id) { apply(value); setError(""); } return value; }
    catch (error) { if (selectedRef.current === id) setError(error instanceof Error ? error.message : "Could not load this course."); }
  }
  useEffect(() => {
    if (selectedId && !objectives.some((item) => item.id === selectedId)) setSelectedId(objectives[0]?.id || null);
  }, [objectives, selectedId]);
  useEffect(() => {
    let active = true; setCourse(null); setError("");
    if (!selectedId) { setLoading(false); return; }
    setLoading(true);
    getCourse(selectedId).then((value) => { if (active) apply(value); })
      .catch((error) => { if (active) setError(error instanceof Error ? error.message : "Could not load course."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // Fetch only when selecting a different course, not when its progress updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);
  useEffect(() => {
    const current = course?.lessons.find((item) => item.id === lessonId);
    const target = pendingSeek.current?.lesson === lessonId ? pendingSeek.current : null;
    setSeekSeconds(target?.seconds ?? current?.startSeconds ?? 0); setNoteTime(formatLearningTime(current?.startSeconds || 0));
    setPlay(Boolean(target)); pendingSeek.current = null; setNoteBody(""); setChoices({}); setFeedback({}); setPlacement(false);
    // Preserve typed notes when only checkpoint/progress data refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);
  async function mutate(work: () => Promise<CourseView>) {
    setBusy(true); setError("");
    try { apply(await work()); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not save this learning change."); }
    finally { setBusy(false); }
  }
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { const value = await createObjective(title.trim(), description.trim(), category.trim()); onCreated(value); setSelectedId(value.id); setCreateOpen(false); setTitle(""); setDescription(""); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not create objective."); }
    finally { setBusy(false); }
  }
  async function removeCourse() {
    if (!objective || !window.confirm(`Delete "${objective.title}" and its lessons/checkpoints/learning notes? Copies saved in PIOS Notes remain.`)) return;
    setBusy(true);
    try { await deleteObjective(objective.id); onRemoved(objective.id); setSelectedId(objectives.find((item) => item.id !== objective.id)?.id || null); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not delete course."); }
    finally { setBusy(false); }
  }
  function seek(seconds: number) { setSeekSeconds(seconds); setPlay(true); setVideoNonce((value) => value + 1); }
  async function answer(id: string) {
    if (choices[id] === undefined || !selectedId) return;
    setBusy(true); setError("");
    try { const value = await answerLessonQuestion(id, choices[id], placement); setFeedback((current) => ({ ...current, [id]: value })); await refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not check this answer."); }
    finally { setBusy(false); }
  }
  async function pinNote(event: FormEvent) {
    event.preventDefault(); if (!lesson) return;
    setBusy(true); setError("");
    try { apply(await addLessonTimedNote(lesson.id, parseLearningTime(noteTime), noteBody)); setNoteBody(""); onToast("Learning note saved at its timestamp."); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not save learning note."); }
    finally { setBusy(false); }
  }
  async function saveInNotes(id: string) {
    setBusy(true); setError("");
    try { await exportLessonTimedNote(id); await refresh(); onToast("Saved in PIOS Notes."); try { await onNoteExported(); } catch { setError("The note was saved. Refresh PIOS Notes to reload its list."); } }
    catch (error) { setError(error instanceof Error ? error.message : "Could not save in PIOS Notes."); }
    finally { setBusy(false); }
  }

  return <section className="learning-workspace">
    <header className="learning-heading"><div><small>DELIBERATE PRACTICE</small><h1>Your learning workspace</h1><p>Build a course, learn in focused sessions, and keep notes at the moment they matter.</p></div><button className="primary" onClick={() => setCreateOpen((value) => !value)}>New objective</button></header>
    {error && <div className="learning-error" role="alert">{error} {selectedId && <button onClick={() => void refresh()}>Retry loading course</button>}</div>}
    <div className="learning-layout">
      <aside className="learning-course-list" aria-label="Learning courses">
        {createOpen && <form onSubmit={create} className="learning-create"><h2>Create an objective</h2><label>What do you want to learn?<input aria-label="Learning objective title" required maxLength={240} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Master distributed systems"/></label><label>Category<input aria-label="Learning objective category" maxLength={120} value={category} onChange={(event) => setCategory(event.target.value)}/></label><label>Description<textarea aria-label="Learning objective description" rows={3} maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)}/></label><button className="primary" disabled={busy || !title.trim()}>Create objective</button></form>}
        <h2>My courses <span>{objectives.length}</span></h2>
        {objectives.map((item) => <button className={`learning-course-link ${item.id === selectedId ? "active" : ""}`} key={item.id} disabled={busy} onClick={() => setSelectedId(item.id)}><small>{item.category}</small><strong>{item.title}</strong><span>{item.progress}% complete</span><i><b style={{ width: `${item.progress}%` }}/></i></button>)}
        {!objectives.length && <p className="learning-help">Start with one goal. Add your first video or reading lesson after creating it.</p>}
      </aside>
      <main className="learning-course-main">
        {!selectedId && <div className="learning-empty"><h2>A clear path from watching to understanding.</h2><p>Video lessons, a daily plan, timestamped notes and checkpoint practice belong together.</p><button onClick={() => setCreateOpen(true)}>Create your first objective</button></div>}
        {loading && <p role="status">Loading your course…</p>}
        {course && objective && <>
          <header className="learning-course-header"><div><small>{objective.category}</small><h2>{objective.title}</h2>{objective.description && <p>{objective.description}</p>}</div><div><strong>{course.progress}%</strong><button onClick={() => void removeCourse()} disabled={busy}>Delete course</button></div></header>
          <div className="learning-course-controls"><label>Daily study time<select aria-label="Daily study time" value={course.dailyMinutes} disabled={busy} onChange={(event) => void mutate(() => setCoursePace(course.objectiveId, Number(event.target.value)))}>{[15,30,60,90,120,180,240].map((value) => <option value={value} key={value}>{value} minutes</option>)}</select></label><span>{course.lessons.length} lessons · {course.plan.length ? `about ${course.plan[course.plan.length - 1].day} study days remaining` : "No remaining scheduled lessons"}</span><button className="primary" onClick={() => { setEditing(undefined); setEditorOpen(true); }} disabled={busy}>Add lesson</button></div>
          {!!course.plan.length && <details className="learning-plan"><summary>Your daily plan</summary><ol>{course.plan.map((block, index) => <li key={index}><strong>Day {block.day}</strong><button onClick={() => { const seconds = (course.lessons.find((item) => item.id === block.lessonId)?.startSeconds || 0) + block.offsetMinutes * 60; if (lessonId === block.lessonId) seek(seconds); else { pendingSeek.current = { lesson: block.lessonId, seconds }; setLessonId(block.lessonId); } }}>{block.title}{block.offsetMinutes ? ` · from ${formatLearningTime(block.offsetMinutes * 60)}` : ""}</button><span>{block.minutes} min</span></li>)}</ol></details>}
          {!course.lessons.length ? <div className="learning-empty"><h3>Add your first lesson</h3><p>Use a YouTube link or a reading article. You can draft notes/checkpoints from a pasted transcript with your connected AI provider.</p><button onClick={() => { setEditing(undefined); setEditorOpen(true); }}>Add first lesson</button><button onClick={onOpenProviders}>Configure AI provider</button></div> : <div className="learning-lesson-layout">
            <nav className="learning-lesson-list" aria-label="Course lessons">{course.lessons.map((item, index) => <button key={item.id} className={item.id === lessonId ? "active" : ""} disabled={busy} onClick={() => setLessonId(item.id)}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{item.title}</strong><small>{item.known ? "Known · placement" : item.completed ? "Completed" : `${item.durationMinutes} min · ${item.videoId ? "video" : "reading"}`}</small></div></button>)}</nav>
            {lesson && <article className="learning-lesson-detail">
              <header><div><small>{lesson.videoId ? "VIDEO LESSON" : "READING LESSON"}</small><h3>{lesson.title}</h3></div><div><button disabled={busy} onClick={() => { setEditing(lesson); setEditorOpen(true); }}>Edit lesson</button><button disabled={busy} onClick={() => { if (window.confirm("Delete this lesson, its checkpoints and learning notes?")) void mutate(() => deleteCourseLesson(lesson.id)); }}>Delete lesson</button></div></header>
              {lesson.videoId && <div className="learning-video"><iframe key={`${lesson.id}:${seekSeconds}:${videoNonce}`} title={`Video lesson: ${lesson.title}`} src={`https://www.youtube-nocookie.com/embed/${lesson.videoId}?start=${seekSeconds}${lesson.endSeconds ? `&end=${lesson.endSeconds}` : ""}&autoplay=${play ? 1 : 0}&rel=0`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/><a href={`https://www.youtube.com/watch?v=${lesson.videoId}&t=${seekSeconds}s`} target="_blank" rel="noreferrer">Open this moment on YouTube</a></div>}
              <section className="learning-article"><h4>Study notes</h4><div>{lesson.article || "Add study notes with Edit lesson, or generate a reviewed draft from a transcript."}</div></section>
              <section className="learning-timed-notes"><h4>Notes pinned to a moment</h4><form onSubmit={pinNote}><label>Timestamp (mm:ss)<input aria-label="Learning note timestamp" value={noteTime} required onChange={(event) => setNoteTime(event.target.value)}/></label><label>Your note<textarea aria-label="Learning note text" value={noteBody} required maxLength={4000} rows={3} onChange={(event) => setNoteBody(event.target.value)} placeholder="Capture the idea in your own words…"/></label><button disabled={busy || !noteBody.trim()}>Pin learning note</button></form>
                {lesson.notes.map((note) => <article key={note.id}><button className="learning-time" onClick={() => seek(note.seconds)} disabled={!lesson.videoId}>{formatLearningTime(note.seconds)}</button><p>{note.body}</p><div><button disabled={busy} onClick={() => void saveInNotes(note.id)}>{note.exportedNoteId ? "Saved in PIOS Notes" : "Save in PIOS Notes"}</button><button disabled={busy} onClick={() => { if (window.confirm("Delete this learning note? Its saved PIOS copy remains.")) void mutate(() => removeLessonTimedNote(note.id)); }}>Delete learning note</button></div></article>)}
              </section>
              <section className="learning-checkpoints"><header><h4>Checkpoint practice</h4>{!!lesson.questions.length && <button aria-pressed={placement} onClick={() => setPlacement((value) => !value)}>{placement ? "Placement mode on" : "Check what I know"}</button>}</header>
                {placement && <p className="learning-help">Passing every checkpoint marks this lesson as known and removes it from your remaining study plan.</p>}
                {lesson.questions.map((question) => <fieldset key={question.id}><legend>{question.prompt}</legend>{question.options.map((option, index) => <label className="learning-radio" key={index}><input type="radio" name={question.id} value={index} checked={choices[question.id] === index} onChange={() => setChoices((current) => ({ ...current, [question.id]: index }))}/>{option}</label>)}<div><button disabled={busy || choices[question.id] === undefined} onClick={() => void answer(question.id)}>Check answer</button><small>{question.passed ? "Passed" : "Not passed yet"}</small><button disabled={busy} onClick={() => { if (window.confirm("Remove this checkpoint?")) void mutate(() => removeLessonQuestion(question.id)); }}>Remove checkpoint</button></div>{feedback[question.id] && <div className={feedback[question.id].correct ? "learning-feedback correct" : "learning-feedback"}><strong>{feedback[question.id].correct ? feedback[question.id].known ? "Known lesson — removed from your plan" : "Correct" : "Not quite — review the explanation"}</strong><p>{feedback[question.id].explanation}</p>{feedback[question.id].sourceQuote && <blockquote>{feedback[question.id].sourceQuote}</blockquote>}{lesson.videoId && <button onClick={() => seek(feedback[question.id].replaySeconds)}>Replay {formatLearningTime(feedback[question.id].replaySeconds)}</button>}</div>}</fieldset>)}
                {!lesson.questions.length && <p className="learning-help">No checkpoints yet. Add one below, or generate questions with a reviewed transcript draft.</p>}
                <LearningQuestionForm key={lesson.id} lessonId={lesson.id} startSeconds={lesson.startSeconds} onSaved={apply}/>
              </section>
              <footer className="learning-completion"><span>{lesson.known ? "Known from placement" : lesson.completed ? "Lesson completed" : "Complete the lesson and pass its checkpoints."}</span><button className="primary" disabled={busy} onClick={() => void mutate(() => setLessonComplete(lesson.id, !(lesson.completed || lesson.known)))}>{lesson.completed || lesson.known ? "Review again" : "Mark lesson complete"}</button></footer>
            </article>}
          </div>}
        </>}
      </main>
    </div>
    {editorOpen && selectedId && <LearningLessonEditor key={editing?.id || "new"} objectiveId={selectedId} lesson={editing} onClose={() => setEditorOpen(false)} onSaved={async (id) => { await refresh(); if (id) setLessonId(id); setEditorOpen(false); onToast("Lesson saved."); }}/>
    }
  </section>;
}
