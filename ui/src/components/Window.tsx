import { useCallback, useRef, type ReactNode } from "react";
import { useWindowStore, type WindowState } from "../stores/window-store";

interface WindowProps {
  win: WindowState;
  children: ReactNode;
  icon?: ReactNode;
}

export function Window({ win, children, icon }: WindowProps) {
  const { focusWindow, closeWindow, moveWindow, resizeWindow, toggleMaximize, minimizeWindow } =
    useWindowStore();
  const dragRef = useRef<{ startX: number; startY: number; winX: number; winY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; winW: number; winH: number } | null>(null);

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (win.isMaximized) return;
      e.preventDefault();
      focusWindow(win.id);
      dragRef.current = { startX: e.clientX, startY: e.clientY, winX: win.x, winY: win.y };

      const onMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const dx = ev.clientX - dragRef.current.startX;
        const dy = ev.clientY - dragRef.current.startY;
        moveWindow(win.id, dragRef.current.winX + dx, dragRef.current.winY + dy);
      };

      const onUp = () => {
        dragRef.current = null;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [win.id, win.x, win.y, win.isMaximized, focusWindow, moveWindow]
  );

  const onResizeStart = useCallback(
    (e: React.MouseEvent) => {
      if (win.isMaximized) return;
      e.preventDefault();
      e.stopPropagation();
      focusWindow(win.id);
      resizeRef.current = { startX: e.clientX, startY: e.clientY, winW: win.w, winH: win.h };

      const onMove = (ev: MouseEvent) => {
        if (!resizeRef.current) return;
        const dw = ev.clientX - resizeRef.current.startX;
        const dh = ev.clientY - resizeRef.current.startY;
        resizeWindow(win.id, resizeRef.current.winW + dw, resizeRef.current.winH + dh);
      };

      const onUp = () => {
        resizeRef.current = null;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [win.id, win.w, win.h, win.isMaximized, focusWindow, resizeWindow]
  );

  if (win.isMinimized) return null;

  const style: React.CSSProperties = win.isMaximized
    ? { position: "absolute", inset: 0, zIndex: win.zIndex, borderRadius: 0 }
    : {
        position: "absolute",
        left: win.x,
        top: win.y,
        width: win.w,
        height: win.h,
        zIndex: win.zIndex,
      };

  return (
    <div
      className="window-frame flex flex-col animate-window-open"
      style={style}
      onMouseDown={() => focusWindow(win.id)}
    >
      {/* Title bar */}
      <div
        className="window-titlebar flex items-center shrink-0 select-none cursor-default"
        onMouseDown={onDragStart}
        onDoubleClick={() => toggleMaximize(win.id)}
        style={{ paddingLeft: 14, paddingRight: 14 }}
      >
        {/* macOS traffic lights — left side */}
        <div className="flex items-center gap-1.5 shrink-0 z-10">
          <button
            className="traffic-light traffic-light-close"
            onClick={(e) => { e.stopPropagation(); closeWindow(win.id); }}
            title="Close"
          />
          <button
            className="traffic-light traffic-light-min"
            onClick={(e) => { e.stopPropagation(); minimizeWindow(win.id); }}
            title="Minimize"
          />
          <button
            className="traffic-light traffic-light-max"
            onClick={(e) => { e.stopPropagation(); toggleMaximize(win.id); }}
            title={win.isMaximized ? "Restore" : "Maximize"}
          />
        </div>

        {/* Title — centered absolutely so it doesn't shift with controls */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-1.5">
            {icon && (
              <span style={{ color: "var(--color-text-secondary)", lineHeight: 0 }}>
                {icon}
              </span>
            )}
            <span
              className="text-xs font-medium truncate"
              style={{ color: "var(--color-text-secondary)", maxWidth: 240, letterSpacing: "-0.01em" }}
            >
              {win.title}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">{children}</div>

      {/* Resize handle */}
      {!win.isMaximized && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
          onMouseDown={onResizeStart}
          style={{ zIndex: 1 }}
        />
      )}
    </div>
  );
}
