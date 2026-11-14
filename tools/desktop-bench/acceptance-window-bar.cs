using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Threading;

public sealed class OrbitWindowBarColor {
    public int[] color;
    public int count;
}

public sealed class OrbitWindowBarReading {
    // The visible frame in physical pixels, and the height between its top edge and the top of the client area.
    public int[] frame;
    public int captionHeight;
    // GetMenuBarInfo reports the rectangle of an attached menu, or null without one. menuBar is true only when part of that
    // rectangle lies above the client area, the non-client strip where Windows paints a menu bar.
    public int[] menuRect;
    public bool menuBar;
    public int sampled;
    public OrbitWindowBarColor[] colors;
    // The menu, minimize, maximize and close areas, in that order.
    public OrbitWindowBarAction[] actions;
}

// The middle of one action area as row-major 0xRRGGBB values, so the runner can tell a glyph on the canvas from a blank or
// covered area.
public sealed class OrbitWindowBarAction {
    public string name;
    public int width;
    public int height;
    public int[] pixels;
}

// The open popup menu of the installed app: its menu handle, and its rectangle in physical pixels.
public sealed class OrbitPopupMenu {
    public long menu;
    public int[] rect;
    // Where the shell anchors the popup: the start of the menu action, under the bar.
    public int[] anchor;
}

public sealed class OrbitWindowState {
    public int[] rect;
    public bool zoomed;
    public bool iconic;
    public bool visible;
}

// Windows PowerShell 5.1 compiles this file with its C# 5 compiler and default references, so it uses neither a later
// language feature nor System.Core.
public static class OrbitWindowBarReader {
    [StructLayout(LayoutKind.Sequential)] private struct NativeRect { public int Left, Top, Right, Bottom; }
    [StructLayout(LayoutKind.Sequential)] private struct NativePoint { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] private struct MenuBarInfo {
        public int Size;
        public NativeRect Bar;
        public IntPtr Menu;
        public IntPtr MenuWindow;
        public int Flags;
    }
    [DllImport("user32.dll")] private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] private static extern bool GetMenuBarInfo(IntPtr window, int objectId, int item, ref MenuBarInfo info);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool ClientToScreen(IntPtr window, ref NativePoint point);
    [DllImport("user32.dll")] private static extern uint GetDpiForWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] private static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extra);
    [DllImport("user32.dll")] private static extern bool IsZoomed(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr window, int command);
    [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out NativeRect value, int size);
    [DllImport("dwmapi.dll")] private static extern int DwmFlush();
    [DllImport("user32.dll", SetLastError = true)] private static extern bool GetClientRect(IntPtr window, out NativeRect rect);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool GetWindowRect(IntPtr window, out NativeRect rect);
    private delegate bool WindowVisitor(IntPtr window, IntPtr parameter);
    [DllImport("user32.dll")] private static extern bool EnumWindows(WindowVisitor visitor, IntPtr parameter);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern int GetClassNameW(IntPtr window, System.Text.StringBuilder text, int capacity);
    [DllImport("user32.dll")] private static extern IntPtr SendMessageW(IntPtr window, uint message, IntPtr word, IntPtr parameter);
    [DllImport("user32.dll")] private static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
    private const int ExtendedFrameBounds = 9;
    private const int MenuObject = unchecked((int)0xFFFFFFFD);
    // CSS pixels of the bar, matching apps/web/lib/desktop-window.ts (apps/desktop/__tests__/config.test.ts checks them).
    private const int BarCssHeight = 48;
    private const int ControlCssWidth = 44;
    private const int EndCssInset = 4;
    // TrackPopupMenu shows a menu in a window of the system menu class, and MN_GETHMENU returns that window's menu.
    private const string PopupMenuClass = "#32768";
    private const uint MenuHandle = 0x01E1;
    private static readonly IntPtr PerMonitorAwareV2 = new IntPtr(-4);

    private static void UsePhysicalPixels() {
        if (SetThreadDpiAwarenessContext(PerMonitorAwareV2) == IntPtr.Zero) throw new Win32Exception("Cannot read the window in physical pixels");
    }

    private static NativeRect Frame(IntPtr window) {
        UsePhysicalPixels();
        NativeRect frame;
        int status = DwmGetWindowAttribute(window, ExtendedFrameBounds, out frame, Marshal.SizeOf(typeof(NativeRect)));
        if (status != 0) throw new InvalidOperationException("DWMWA_EXTENDED_FRAME_BOUNDS failed with HRESULT 0x" + status.ToString("X8"));
        return frame;
    }

    // The Orbit bar is page content, so a window without a native caption has its client area at the top of its frame.
    // A per-monitor aware thread reads the frame, the client origin, the menu bar and the screen in the same physical pixels.
    public static OrbitWindowBarReading Read(IntPtr window, string capture) {
        // A minimized window has no bar to read.
        if (IsIconic(window)) return null;
        // DwmFlush waits for the next composition, so the capture shows the frame that the page last requested.
        DwmFlush();
        NativeRect frame = Frame(window);
        var origin = new NativePoint();
        if (!ClientToScreen(window, ref origin)) throw new Win32Exception();
        // The shell keeps its native menu attached for the menu commands. A client area that starts at the frame top leaves
        // that menu no strip to paint in, although GetMenuBarInfo still reports its rectangle.
        var menu = new MenuBarInfo { Size = Marshal.SizeOf(typeof(MenuBarInfo)) };
        bool attached = GetMenuBarInfo(window, MenuObject, 0, ref menu);
        bool menuBar = attached && Math.Min(menu.Bar.Bottom, origin.Y) > Math.Max(menu.Bar.Top, frame.Top);
        int width = frame.Right - frame.Left, height = frame.Bottom - frame.Top;
        uint dpi = GetDpiForWindow(window);
        int bar = Scale(BarCssHeight, dpi);
        if (width <= 0 || height <= bar) {
            // A window that turns minimized during the reading has the small frame of a minimized window and no bar.
            if (IsIconic(window)) return null;
            throw new InvalidOperationException("The window is smaller than its top bar");
        }
        NativeRect client;
        if (!GetClientRect(window, out client)) throw new Win32Exception();
        using (var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb)) {
            using (var graphics = Graphics.FromImage(bitmap)) graphics.CopyFromScreen(frame.Left, frame.Top, 0, 0, new Size(width, height));
            bitmap.Save(capture, ImageFormat.Png);
            // The middle fifth of the middle half of the bar holds no window action at any usable width.
            var counts = new Dictionary<int, int>();
            int sampled = 0;
            for (int y = bar / 4; y < bar - bar / 4; y++) {
                for (int x = width * 2 / 5; x < width * 3 / 5; x++) {
                    int color = bitmap.GetPixel(x, y).ToArgb() & 0xFFFFFF;
                    int count;
                    counts.TryGetValue(color, out count);
                    counts[color] = count + 1;
                    sampled++;
                }
            }
            var ranked = new List<KeyValuePair<int, int>>(counts);
            ranked.Sort((first, second) => second.Value.CompareTo(first.Value));
            var colors = new List<OrbitWindowBarColor>();
            for (int index = 0; index < ranked.Count && index < 5; index++) {
                int color = ranked[index].Key;
                colors.Add(new OrbitWindowBarColor { color = new[] { (color >> 16) & 0xFF, (color >> 8) & 0xFF, color & 0xFF }, count = ranked[index].Value });
            }
            return new OrbitWindowBarReading { frame = new[] { frame.Left, frame.Top, frame.Right, frame.Bottom },
                captionHeight = origin.Y - frame.Top, menuBar = menuBar, sampled = sampled, colors = colors.ToArray(),
                menuRect = attached ? new[] { menu.Bar.Left, menu.Bar.Top, menu.Bar.Right, menu.Bar.Bottom } : null,
                actions = Actions(bitmap, origin.X - frame.Left, origin.Y - frame.Top, client.Right - client.Left, dpi) };
        }
    }

    private static int Scale(int css, uint dpi) {
        return (int)Math.Round(css * dpi / 96.0);
    }

    // The middle half of each action area in both directions, where the 20px glyph sits: the menu action starts at the end
    // inset, and minimize, maximize and close end at the other end inset. Client coordinates map to the capture by the
    // offset of the client origin in the frame.
    private static OrbitWindowBarAction[] Actions(Bitmap bitmap, int clientLeft, int clientTop, int clientWidth, uint dpi) {
        int bar = Scale(BarCssHeight, dpi), control = Scale(ControlCssWidth, dpi), inset = Scale(EndCssInset, dpi);
        int end = clientLeft + clientWidth - inset;
        var starts = new[] { clientLeft + inset, end - 3 * control, end - 2 * control, end - control };
        var names = new[] { "menu", "minimize", "maximize", "close" };
        int top = clientTop + bar / 4, height = bar - 2 * (bar / 4), width = control - 2 * (control / 4);
        var actions = new OrbitWindowBarAction[names.Length];
        for (int index = 0; index < names.Length; index++) {
            int left = starts[index] + control / 4;
            var pixels = new int[width * height];
            // A point outside the capture reads -1, which is neither canvas nor glyph.
            for (int y = 0; y < height; y++) {
                for (int x = 0; x < width; x++) {
                    bool inside = left + x >= 0 && left + x < bitmap.Width && top + y >= 0 && top + y < bitmap.Height;
                    pixels[y * width + x] = inside ? bitmap.GetPixel(left + x, top + y).ToArgb() & 0xFFFFFF : -1;
                }
            }
            actions[index] = new OrbitWindowBarAction { name = names[index], width = width, height = height, pixels = pixels };
        }
        return actions;
    }

    // Parks the pointer in the middle of the window, below the bar, so no bar action shows its hover fill during a reading.
    public static void Park(IntPtr window) {
        if (IsIconic(window)) return;
        NativeRect frame = Frame(window);
        SetCursorPos(frame.Left + (frame.Right - frame.Left) / 2, frame.Top + (frame.Bottom - frame.Top) / 2);
    }

    // The visible popup menu that a thread of the process shows, or null when none is open.
    public static OrbitPopupMenu Popup(IntPtr window, int processId) {
        UsePhysicalPixels();
        IntPtr found = IntPtr.Zero;
        EnumWindows((candidate, parameter) => {
            uint owner;
            GetWindowThreadProcessId(candidate, out owner);
            if (owner != (uint)processId || !IsWindowVisible(candidate)) return true;
            var name = new System.Text.StringBuilder(64);
            GetClassNameW(candidate, name, name.Capacity);
            if (name.ToString() != PopupMenuClass) return true;
            found = candidate;
            return false;
        }, IntPtr.Zero);
        if (found == IntPtr.Zero) return null;
        NativeRect rect;
        if (!GetWindowRect(found, out rect)) throw new Win32Exception();
        var origin = new NativePoint();
        if (!ClientToScreen(window, ref origin)) throw new Win32Exception();
        uint dpi = GetDpiForWindow(window);
        return new OrbitPopupMenu { menu = SendMessageW(found, MenuHandle, IntPtr.Zero, IntPtr.Zero).ToInt64(),
            rect = new[] { rect.Left, rect.Top, rect.Right, rect.Bottom },
            anchor = new[] { origin.X + Scale(EndCssInset, dpi), origin.Y + Scale(BarCssHeight, dpi) } };
    }

    // Escape closes an open popup menu, as a person closes it.
    public static void Dismiss() {
        keybd_event(0x1B, 0, 0, UIntPtr.Zero);
        keybd_event(0x1B, 0, 2, UIntPtr.Zero);
    }

    public static OrbitWindowState State(IntPtr window) {
        NativeRect frame = Frame(window);
        return new OrbitWindowState { rect = new[] { frame.Left, frame.Top, frame.Right, frame.Bottom },
            zoomed = IsZoomed(window), iconic = IsIconic(window), visible = IsWindowVisible(window) };
    }

    private const uint LeftDown = 0x0002;
    private const uint LeftUp = 0x0004;

    // A press on the empty part of the bar, a fifth of the way in, which holds no window action at any usable width.
    private static NativePoint BarPoint(IntPtr window) {
        NativeRect frame = Frame(window);
        int bar = (int)Math.Round(BarCssHeight * GetDpiForWindow(window) / 96.0);
        return new NativePoint { X = frame.Left + (frame.Right - frame.Left) / 5, Y = frame.Top + bar / 2 };
    }

    public static void Drag(IntPtr window, int distance) {
        NativePoint point = BarPoint(window);
        SetCursorPos(point.X, point.Y);
        Thread.Sleep(100);
        mouse_event(LeftDown, 0, 0, 0, UIntPtr.Zero);
        for (int step = 1; step <= 10; step++) {
            Thread.Sleep(30);
            SetCursorPos(point.X + distance * step / 10, point.Y);
        }
        mouse_event(LeftUp, 0, 0, 0, UIntPtr.Zero);
    }

    // A pointer press in the middle of the maximize action: client right - end inset - 1.5 controls, half the bar down. There the
    // snap region of caption.cpp answers HTMAXBUTTON, and its button release maximizes or restores the window.
    public static void ClickMaximize(IntPtr window) {
        UsePhysicalPixels();
        NativeRect client;
        if (!GetClientRect(window, out client)) throw new Win32Exception();
        var origin = new NativePoint();
        if (!ClientToScreen(window, ref origin)) throw new Win32Exception();
        uint dpi = GetDpiForWindow(window);
        int control = Scale(ControlCssWidth, dpi), inset = Scale(EndCssInset, dpi), bar = Scale(BarCssHeight, dpi);
        SetCursorPos(origin.X + client.Right - inset - control - control / 2, origin.Y + bar / 2);
        Thread.Sleep(100);
        mouse_event(LeftDown, 0, 0, 0, UIntPtr.Zero);
        Thread.Sleep(60);
        mouse_event(LeftUp, 0, 0, 0, UIntPtr.Zero);
    }

    public static void DoubleClick(IntPtr window) {
        NativePoint point = BarPoint(window);
        SetCursorPos(point.X, point.Y);
        Thread.Sleep(100);
        for (int click = 0; click < 2; click++) {
            mouse_event(LeftDown, 0, 0, 0, UIntPtr.Zero);
            mouse_event(LeftUp, 0, 0, 0, UIntPtr.Zero);
            Thread.Sleep(60);
        }
    }

    // SW_RESTORE; a minimized window has no bar to press.
    public static void Restore(IntPtr window) {
        ShowWindow(window, 9);
    }
}
