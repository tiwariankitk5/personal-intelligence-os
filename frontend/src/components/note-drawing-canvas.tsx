"use client";

import { useEffect, useRef } from "react";
import { Excalidraw, exportToBlob } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

export type ExportedNoteDiagram = {
  sceneData: string;
  previewDataUrl: string;
};

type ExcalidrawApiHandle = {
  getSceneElements: () => unknown[];
  getAppState: () => Record<string, unknown>;
  getFiles: () => Record<string, unknown>;
};

type NoteDrawingCanvasProps = {
  sceneData: string;
  onRegisterSceneExporter: (exporter: () => Promise<ExportedNoteDiagram>) => void;
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
      libraryItems: saved.libraryItems ?? [],
    };
  } catch {
    return null;
  }
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not create the diagram preview."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      if (!result.startsWith("data:image/png;base64,")) {
        reject(new Error("The diagram preview could not be encoded as PNG."));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(blob);
  });
}

export default function NoteDrawingCanvas({ sceneData, onRegisterSceneExporter }: NoteDrawingCanvasProps) {
  const initialData = useRef(restoreScene(sceneData));
  const apiRef = useRef<ExcalidrawApiHandle | null>(null);
  const libraryRef = useRef(initialData.current?.libraryItems ?? []);
  const registerRef = useRef(onRegisterSceneExporter);

  useEffect(() => {
    registerRef.current = onRegisterSceneExporter;
  }, [onRegisterSceneExporter]);

  useEffect(() => {
    const exporter = async (): Promise<ExportedNoteDiagram> => {
      const api = apiRef.current;
      if (!api) throw new Error("The drawing canvas is still loading.");
      const elements = api.getSceneElements();
      if (!elements.length) throw new Error("Draw something before inserting this diagram.");
      const appState = api.getAppState();
      const files = api.getFiles();
      const sceneData = JSON.stringify({
        format: "pios-excalidraw-v1",
        elements,
        appState: {
          viewBackgroundColor: appState.viewBackgroundColor,
          gridSize: appState.gridSize,
          theme: appState.theme,
        },
        files,
        libraryItems: libraryRef.current,
      });
      const blob = await exportToBlob({
        elements: elements as never,
        appState: { ...appState, exportBackground: false } as never,
        files: files as never,
        mimeType: "image/png",
        maxWidthOrHeight: 1600,
        exportPadding: 24,
      });
      return { sceneData, previewDataUrl: await blobToDataUrl(blob) };
    };

    registerRef.current(exporter);
    return () => registerRef.current(() => Promise.reject(new Error("The drawing canvas is closed.")));
  }, []);

  return (
    <div className="pios-excalidraw-shell" aria-label="PIOS design canvas">
      <div className="pios-excalidraw-stage">
        <Excalidraw
          initialData={initialData.current as never}
          theme="light"
          onLibraryChange={(items) => { libraryRef.current = items; }}
          excalidrawAPI={(api) => {
            apiRef.current = api as unknown as ExcalidrawApiHandle;
          }}
        />
      </div>
    </div>
  );
}
