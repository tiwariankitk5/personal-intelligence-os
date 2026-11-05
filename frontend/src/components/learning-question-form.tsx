"use client";
import { useState } from "react";
import type { FormEvent } from "react";
import { CourseView, addLessonQuestion } from "@/lib/api";
import { formatLearningTime, parseLearningTime } from "@/lib/learning-time";

export default function LearningQuestionForm({ lessonId, startSeconds, onSaved }: { lessonId: string; startSeconds: number; onSaved: (course: CourseView) => void }) {
  const [prompt, setPrompt] = useState(""); const [answers, setAnswers] = useState(""); const [correct, setCorrect] = useState(1);
  const [explanation, setExplanation] = useState(""); const [time, setTime] = useState(formatLearningTime(startSeconds));
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { onSaved(await addLessonQuestion(lessonId, { prompt, options: answers.split("\n").map((value) => value.trim()).filter(Boolean), correctIndex: correct - 1, explanation, replaySeconds: parseLearningTime(time), sourceQuote: "" })); setPrompt(""); setAnswers(""); setExplanation(""); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not add checkpoint."); }
    finally { setBusy(false); }
  }
  return <details className="learning-question-author"><summary>Add a checkpoint question</summary><form onSubmit={save}>
    {error && <p role="alert" className="learning-error">{error}</p>}<label>Question<input aria-label="Checkpoint question" value={prompt} required maxLength={1500} onChange={(event) => setPrompt(event.target.value)}/></label><label>Answers (one per line, 2–5)<textarea aria-label="Checkpoint answers" rows={4} value={answers} required onChange={(event) => setAnswers(event.target.value)}/></label><div className="learning-form-row"><label>Correct answer number<input aria-label="Checkpoint correct answer" type="number" min={1} max={5} value={correct} required onChange={(event) => setCorrect(Number(event.target.value))}/></label><label>Replay timestamp<input aria-label="Checkpoint replay timestamp" value={time} required onChange={(event) => setTime(event.target.value)}/></label></div><label>Explanation<textarea aria-label="Checkpoint explanation" rows={2} maxLength={2000} value={explanation} onChange={(event) => setExplanation(event.target.value)}/></label><button type="submit" disabled={busy}>{busy ? "Saving…" : "Add checkpoint"}</button>
  </form></details>;
}
