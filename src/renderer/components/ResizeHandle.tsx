import { useEffect, useRef } from "react";

interface ResizeHandleProps {
  side: "left" | "right";
  onResize: (delta: number) => void;
}

export function ResizeHandle({ side, onResize }: ResizeHandleProps) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  useEffect(() => {
    const move = (event: PointerEvent): void => {
      if (!dragging.current) return;
      const rawDelta = event.clientX - lastX.current;
      lastX.current = event.clientX;
      onResize(side === "left" ? rawDelta : -rawDelta);
    };
    const up = (): void => {
      dragging.current = false;
      document.body.classList.remove("resizing-panels");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [onResize, side]);

  return (
    <div
      className={`resize-handle ${side}`}
      onPointerDown={(event) => {
        dragging.current = true;
        lastX.current = event.clientX;
        document.body.classList.add("resizing-panels");
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
    />
  );
}
