import { create } from "zustand";

export interface WindowState {
  id: string;
  appId: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW: number;
  minH: number;
  zIndex: number;
  isMinimized: boolean;
  isMaximized: boolean;
  preMaximize?: { x: number; y: number; w: number; h: number };
}

interface OpenWindowParams {
  appId: string;
  title: string;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  x?: number;
  y?: number;
}

interface WindowStoreState {
  windows: Record<string, WindowState>;
  nextZIndex: number;
  openWindow: (params: OpenWindowParams) => string;
  closeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  moveWindow: (id: string, x: number, y: number) => void;
  resizeWindow: (id: string, w: number, h: number) => void;
  toggleMaximize: (id: string) => void;
  minimizeWindow: (id: string) => void;
  restoreWindow: (id: string) => void;
  setTitle: (id: string, title: string) => void;
}

let windowCounter = 0;

export const useWindowStore = create<WindowStoreState>()((set, get) => ({
  windows: {},
  nextZIndex: 1,

  openWindow(params: OpenWindowParams): string {
    const id = `win_${++windowCounter}`;
    const { nextZIndex } = get();
    const cascade = (windowCounter % 10) * 30;

    const win: WindowState = {
      id,
      appId: params.appId,
      title: params.title,
      x: params.x ?? 80 + cascade,
      y: params.y ?? 50 + cascade,
      w: params.w,
      h: params.h,
      minW: params.minW ?? 300,
      minH: params.minH ?? 200,
      zIndex: nextZIndex,
      isMinimized: false,
      isMaximized: false,
    };

    set((s) => ({
      windows: { ...s.windows, [id]: win },
      nextZIndex: s.nextZIndex + 1,
    }));

    return id;
  },

  closeWindow(id: string) {
    set((s) => {
      const { [id]: _, ...rest } = s.windows;
      return { windows: rest };
    });
  },

  focusWindow(id: string) {
    set((s) => {
      const win = s.windows[id];
      if (!win) return s;
      return {
        windows: {
          ...s.windows,
          [id]: { ...win, zIndex: s.nextZIndex, isMinimized: false },
        },
        nextZIndex: s.nextZIndex + 1,
      };
    });
  },

  moveWindow(id: string, x: number, y: number) {
    set((s) => {
      const win = s.windows[id];
      if (!win) return s;
      return { windows: { ...s.windows, [id]: { ...win, x, y } } };
    });
  },

  resizeWindow(id: string, w: number, h: number) {
    set((s) => {
      const win = s.windows[id];
      if (!win) return s;
      return {
        windows: {
          ...s.windows,
          [id]: {
            ...win,
            w: Math.max(w, win.minW),
            h: Math.max(h, win.minH),
          },
        },
      };
    });
  },

  toggleMaximize(id: string) {
    set((s) => {
      const win = s.windows[id];
      if (!win) return s;

      if (win.isMaximized) {
        const prev = win.preMaximize ?? { x: 80, y: 50, w: win.w, h: win.h };
        return {
          windows: {
            ...s.windows,
            [id]: { ...win, ...prev, isMaximized: false, preMaximize: undefined },
          },
        };
      }

      return {
        windows: {
          ...s.windows,
          [id]: {
            ...win,
            preMaximize: { x: win.x, y: win.y, w: win.w, h: win.h },
            isMaximized: true,
          },
        },
      };
    });
  },

  minimizeWindow(id: string) {
    set((s) => {
      const win = s.windows[id];
      if (!win) return s;
      return {
        windows: { ...s.windows, [id]: { ...win, isMinimized: true } },
      };
    });
  },

  restoreWindow(id: string) {
    const { focusWindow } = get();
    focusWindow(id);
  },

  setTitle(id: string, title: string) {
    set((s) => {
      const win = s.windows[id];
      if (!win) return s;
      return { windows: { ...s.windows, [id]: { ...win, title } } };
    });
  },
}));
