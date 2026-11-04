"use client";

import { useEffect, useRef } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

type NoteDrawingCanvasProps = {
  sceneData: string;
  onSceneChange: (scene: string) => void;
};

function restoreScene(sceneData: string) {
  if (!sceneData) return null;
  try {
    const saved = JSON.parse(sceneData);
    if (!saved || saved.format !== "pios-excalidraw-v1" || !Array.isArray(saved.elements)) return null;
    return {
      elements: saved.elements,
      appState: saved.appState ?? {},
      files: saved.files ?? {},
    };
  } catch {
    return null;
  }
}

export default function NoteDrawingCanvas({ sceneData, onSceneChange }: NoteDrawingCanvasProps) {
  // The parent keys this component by note id, so this initial scene is read once per note.
  const initialData = useRef(restoreScene(sceneData));
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestScene = useRef("");
  const onSceneChangeRef = useRef(onSceneChange);

  useEffect(() => {
    onSceneChangeRef.current = onSceneChange;
  }, [onSceneChange]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  return (
    <div className="pios-excalidraw-shell" aria-label="Note drawing canvas">
      <div className="pios-excalidraw-heading">
        <div>
          <strong>Visual canvas</strong>
          <span>Sketch ideas, map systems, draw diagrams, and annotate freely.</span>
        </div>
        <span className="pios-excalidraw-format">EXCALIDRAW</span>
      </div>
      <div className="pios-excalidraw-stage">
        <Excalidraw
          initialData={initialData.current as never}
          theme="light"
          onChange={(elements, appState, files) => {
            latestScene.current = JSON.stringify({
              format: "pios-excalidraw-v1",
              elements,
              appState: {
                viewBackgroundColor: appState.viewBackgroundColor,
                gridSize: appState.gridSize,
                theme: appState.theme,
              },
              files,
            });
            if (saveTimer.current) clearTimeout(saveTimer.current);
            saveTimer.current = setTimeout(() => {
              if (latestScene.current) onSceneChangeRef.current(latestScene.current);
              saveTimer.current = null;
            }, 400);
          }}
        />
      </div>
      <p className="pios-excalidraw-hint">
        Drawing changes are staged with this note. Select <strong>Save changes</strong> above or below to persist the page.
      </p>
    </div>
  );
}
