"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { LearningLesson, QuestionDraft, addCourseLesson, editCourseLesson, generateLessonDraft } from "@/lib/api";
import { formatLearningTime, parseLearningTime } from "@/lib/learning-time";

export default function LearningLessonEditor({ objectiveId, lesson, onClose, onSaved }: {
  objectiveId: string; lesson?: LearningLesson; onClose: () => void; onSaved: (id?: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(lesson?.title || "");
  const [url, setUrl] = useState(lesson?.videoId ? `https://www.youtube.com/watch?v=${lesson.videoId}` : "");
  const [minutes, setMinutes] = useState(lesson?.durationMinutes || 10);
  const [start, setStart] = useState(lesson ? formatLearningTime(lesson.startSeconds) : "");
  const [end, setEnd] = useState(lesson?.endSeconds ? formatLearningTime(lesson.endSeconds) : "");
  const [article, setArticle] = useState(lesson?.article || "");
  const [transcript, setTranscript] = useState("");
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [generated, setGenerated] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [timestamped, setTimestamped] = useState(true);
  useEffect(() => { setReviewed(false); }, [title, url, minutes, start, end, article, transcript, questions]);
  async function generate() {
    setBusy(true); setError("");
    try {
      const draft = await generateLessonDraft(objectiveId, title, transcript);
      setArticle(draft.article); setQuestions(draft.questions); setGenerated(true); setReviewed(false); setTimestamped(draft.timestamped);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not create an AI lesson draft."); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const payload = { title, videoUrl: url, durationMinutes: minutes, startSeconds: start.trim() ? parseLearningTime(start) : null, endSeconds: end.trim() ? parseLearningTime(end) : null, article, questions: generated ? questions : lesson ? null : [], aiDraft: generated, reviewed };
      let id: string | undefined;
      if (lesson) { await editCourseLesson(lesson.id, payload); id = lesson.id; }
      else id = (await addCourseLesson(objectiveId, payload)).id;
      await onSaved(id);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save the lesson."); }
    finally { setBusy(false); }
  }
  return <div className="learning-dialog-backdrop"><section className="learning-dialog" role="dialog" aria-modal="true" aria-label={lesson ? "Edit lesson" : "Add lesson"}>
    <header><div><small>BUILD YOUR COURSE</small><h2>{lesson ? "Edit lesson" : "Add a lesson"}</h2></div><button type="button" aria-label="Close lesson editor" disabled={busy} onClick={onClose}>×</button></header>
    {error && <p role="alert" className="learning-error">{error}</p>}
    <form onSubmit={save}>
      <label>Lesson title<input aria-label="Lesson title" required maxLength={240} value={title} onChange={(event) => setTitle(event.target.value)}/></label>
      <label>YouTube video URL (optional)<input aria-label="Lesson video URL" type="url" maxLength={2000} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=…"/></label>
      <p className="learning-help">Add individual videos or chapters. Automatic playlist/transcript import is not connected yet.</p>
      <div className="learning-form-row"><label>Estimated minutes<input aria-label="Lesson minutes" type="number" min={1} max={1440} required value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}/></label><label>Start (mm:ss)<input aria-label="Lesson start" value={start} onChange={(event) => setStart(event.target.value)} placeholder="Video link start"/></label><label>End (optional)<input aria-label="Lesson end" value={end} onChange={(event) => setEnd(event.target.value)} placeholder="mm:ss"/></label></div>
      <p className="learning-help">A start/end range determines the duration. Otherwise, the daily plan uses your estimate.</p>
      <label>Study article / lesson notes<textarea aria-label="Lesson article" rows={7} maxLength={20000} value={article} onChange={(event) => { setArticle(event.target.value); setReviewed(false); }}/></label>
      <details className="learning-ai-draft"><summary>Generate a reviewed draft from a transcript</summary><p>Paste transcript text, ideally with mm:ss timestamps. It is sent to your default chat provider. Up to 10 draft requests per day; provider charges may apply.</p><label>Transcript<textarea aria-label="Lesson transcript" rows={6} maxLength={20000} value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder={"00:00 Introduction\n03:12 Explanation and examples…"}/></label><button type="button" disabled={busy || !title.trim() || !transcript.trim()} onClick={() => void generate()}>{busy ? "Working…" : "Generate lesson draft"}</button></details>
      {generated && <section className="learning-draft-review"><h3>Review before saving</h3><p>Check the draft against your video/transcript. Source quotes anchor the checkpoints; they do not guarantee the AI interpretation is correct.</p>{!timestamped && <p>No timestamps were provided. Replay starts at 0:00 unless you adjust the lesson.</p>}{questions.map((question, index) => <article key={index}><strong>{index + 1}. {question.prompt}</strong><ol>{question.options.map((option, i) => <li key={i}>{option}</li>)}</ol><label>Correct answer<select aria-label={`Correct answer for draft question ${index + 1}`} value={question.correctIndex} onChange={(event) => { setQuestions((current) => current.map((item, i) => i === index ? { ...item, correctIndex: Number(event.target.value) } : item)); setReviewed(false); }}>{question.options.map((option, i) => <option value={i} key={i}>{i + 1}. {option}</option>)}</select></label><p>{question.explanation}</p><blockquote>{question.sourceQuote}</blockquote><small>Replay {formatLearningTime(question.replaySeconds)}</small><button type="button" onClick={() => { setQuestions((current) => current.filter((_, i) => i !== index)); setReviewed(false); }}>Remove question</button></article>)}<label className="learning-checkbox"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)}/>I reviewed this draft and its checkpoint answers.</label></section>}
      {lesson && <p className="learning-help">Saving edits resets completion and checkpoint results. Existing questions stay unless replaced by this AI draft; timestamped notes stay saved.</p>}
      <footer><button type="button" disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={busy || generated && !reviewed}>{busy ? "Saving…" : generated ? "Save reviewed lesson" : "Save lesson"}</button></footer>
    </form>
  </section></div>;
}
