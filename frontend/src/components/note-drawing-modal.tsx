"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

type DrawingTool = "pen" | "line" | "arrow" | "rectangle" | "ellipse" | "eraser";
type Point = { x: number; y: number };

type NoteDrawingModalProps = {
  onClose: () => void;
  onInsert: (dataUrl: string) => void;
};

const TOOL_OPTIONS: { id: DrawingTool; label: string; shortcut: string }[] = [
  { id: "pen", label: "Pen", shortcut: "P" },
  { id: "line", label: "Line", shortcut: "L" },
  { id: "arrow", label: "Arrow", shortcut: "A" },
  { id: "rectangle", label: "Rectangle", shortcut: "R" },
  { id: "ellipse", label: "Ellipse", shortcut: "O" },
  { id: "eraser", label: "Eraser", shortcut: "E" },
];

const COLORS = ["#24352b", "#397b5c", "#4b83b8", "#9a72bd", "#cc795e", "#d3ae4d"];

export default function NoteDrawingModal({ onClose, onInsert }: NoteDrawingModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<ImageData[]>([]);
  const startRef = useRef<Point | null>(null);
  const snapshotRef = useRef<ImageData | null>(null);
  const drawingRef = useRef(false);
  const [tool, setTool] = useState<DrawingTool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [stroke, setStroke] = useState(3);
  const [error, setError] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.lineCap = "round";
    context.lineJoin = "round";
  }, []);

  const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * event.currentTarget.width,
      y: ((event.clientY - rect.top) / rect.height) * event.currentTarget.height,
    };
  };

  const remember = (context: CanvasRenderingContext2D) => {
    historyRef.current.push(context.getImageData(0, 0, context.canvas.width, context.canvas.height));
    if (historyRef.current.length > 25) historyRef.current.shift();
  };

  const drawShape = (context: CanvasRenderingContext2D, from: Point, to: Point) => {
    context.strokeStyle = tool === "eraser" ? "#ffffff" : color;
    context.lineWidth = tool === "eraser" ? Math.max(18, stroke * 5) : stroke;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    if (tool === "line" || tool === "arrow") {
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
      if (tool === "arrow") {
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const head = Math.max(13, stroke * 5);
        context.beginPath();
        context.moveTo(to.x, to.y);
        context.lineTo(to.x - head * Math.cos(angle - Math.PI / 6), to.y - head * Math.sin(angle - Math.PI / 6));
        context.moveTo(to.x, to.y);
        context.lineTo(to.x - head * Math.cos(angle + Math.PI / 6), to.y - head * Math.sin(angle + Math.PI / 6));
        context.stroke();
      }
    } else if (tool === "rectangle") {
      context.strokeRect(from.x, from.y, to.x - from.x, to.y - from.y);
    } else if (tool === "ellipse") {
      const rx = Math.abs(to.x - from.x) / 2;
      const ry = Math.abs(to.y - from.y) / 2;
      context.ellipse((from.x + to.x) / 2, (from.y + to.y) / 2, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
      context.stroke();
    }
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const point = pointFromEvent(event);
    remember(context);
    startRef.current = point;
    snapshotRef.current = context.getImageData(0, 0, canvas.width, canvas.height);
    drawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    if (tool === "pen" || tool === "eraser") {
      context.beginPath();
      context.moveTo(point.x, point.y);
      context.strokeStyle = tool === "eraser" ? "#ffffff" : color;
      context.lineWidth = tool === "eraser" ? Math.max(18, stroke * 5) : stroke;
      context.lineCap = "round";
      context.lineJoin = "round";
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !startRef.current) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const point = pointFromEvent(event);
    if (tool === "pen" || tool === "eraser") {
      context.lineTo(point.x, point.y);
      context.stroke();
      return;
    }
    if (snapshotRef.current) context.putImageData(snapshotRef.current, 0, 0);
    drawShape(context, startRef.current, point);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false;
    startRef.current = null;
    snapshotRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const undo = () => {
    const previous = historyRef.current.pop();
    const context = canvasRef.current?.getContext("2d");
    if (previous && context) context.putImageData(previous, 0, 0);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    remember(context);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  };

  const insert = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dataUrl = canvas.toDataURL("image/jpeg", 0.52);
    if (dataUrl.length > 78_000) dataUrl = canvas.toDataURL("image/jpeg", 0.34);
    if (dataUrl.length > 88_000) {
      setError("This diagram is too detailed to fit safely in a note. Reduce its size or simplify the drawing.");
      return;
    }
    onInsert(dataUrl);
  };

  return (
    <div className="modal-backdrop note-drawing-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="note-drawing-modal" role="dialog" aria-modal="true" aria-labelledby="note-drawing-title">
        <header className="note-drawing-header">
          <div><span className="eyebrow">PIOS CANVAS</span><h2 id="note-drawing-title">Draw a diagram</h2><p>Sketch flows, architecture, data structures, and study diagrams.</p></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close drawing canvas">×</button>
        </header>
        <div className="note-drawing-tools">
          <div className="note-drawing-tool-group">
            {TOOL_OPTIONS.map((option) => <button type="button" key={option.id} className={tool === option.id ? "active" : ""} onClick={() => setTool(option.id)} title={option.label + " (" + option.shortcut + ")"}>{option.label}<kbd>{option.shortcut}</kbd></button>)}
          </div>
          <div className="note-drawing-tool-group note-drawing-colors" aria-label="Drawing colours">
            {COLORS.map((item) => <button type="button" key={item} aria-label={"Use " + item} title={item} className={color === item ? "active" : ""} style={{ background: item }} onClick={() => setColor(item)} />)}
          </div>
          <label className="note-drawing-width">Stroke <input type="range" min="1" max="9" value={stroke} onChange={(event) => setStroke(Number(event.target.value))}/></label>
          <div className="note-drawing-tool-group note-drawing-history"><button type="button" onClick={undo}>Undo</button><button type="button" onClick={clear}>Clear</button></div>
        </div>
        <div className="note-drawing-canvas-wrap">
          <canvas ref={canvasRef} width={960} height={540} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp} aria-label="Drawing canvas"/>
        </div>
        <footer className="note-drawing-footer">
          <span>{error || "The drawing is saved as an image inside this note."}</span>
          <div><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button type="button" className="button button-primary" onClick={insert}>Insert drawing</button></div>
        </footer>
      </section>
    </div>
  );
}
