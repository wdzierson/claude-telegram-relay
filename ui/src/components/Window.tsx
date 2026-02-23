import { useCallback, useRef, type ReactNode } from "react";
import { X, Minus, Maximize2, Minimize2 } from "lucide-react";
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
      className="flex flex-col animate-window-open"
      style={{
        ...style,
        border: "1px solid var(--color-glass-border)",
        borderRadius: "var(--radius-window)",
        overflow: "hidden",
        background: "var(--color-glass)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}
      onMouseDown={() => focusWindow(win.id)}
    >
      {/* Title bar */}
      <div
        className="flex items-center justify-between px-4 shrink-0 select-none cursor-default"
        style={{
          height: 40,
          background: "transparent",
          borderBottom: "1px solid var(--color-glass-border)",
        }}
        onMouseDown={onDragStart}
        onDoubleClick={() => toggleMaximize(win.id)}
      >
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="text-text-secondary shrink-0">{icon}</span>}
          <span
            className="font-body text-xs truncate"
            style={{ color: "var(--color-text-secondary)" }}
          >
            {win.title}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            className="p-1.5 rounded-full hover:bg-white/5 transition-colors"
            onClick={(e) => { e.stopPropagation(); minimizeWindow(win.id); }}
          >
            <Minus size={12} className="text-text-secondary" />
          </button>
          <button
            className="p-1.5 rounded-full hover:bg-white/5 transition-colors"
            onClick={(e) => { e.stopPropagation(); toggleMaximize(win.id); }}
          >
            {win.isMaximized ? (
              <Minimize2 size={12} className="text-text-secondary" />
            ) : (
              <Maximize2 size={12} className="text-text-secondary" />
            )}
          </button>
          <button
            className="p-1.5 rounded-full hover:bg-status-error/20 transition-colors"
            onClick={(e) => { e.stopPropagation(); closeWindow(win.id); }}
          >
            <X size={12} className="text-text-secondary" />
          </button>
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
