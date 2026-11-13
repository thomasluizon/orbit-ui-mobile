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
    private const int ExtendedFrameBounds = 9;
    private const int MenuObject = unchecked((int)0xFFFFFFFD);
    private const int BarCssHeight = 48;
    private static readonly IntPtr PerMonitorAwareV2 = new IntPtr(-4);

    private static NativeRect Frame(IntPtr window) {
        if (SetThreadDpiAwarenessContext(PerMonitorAwareV2) == IntPtr.Zero) throw new Win32Exception("Cannot read the window in physical pixels");
        NativeRect frame;
        int status = DwmGetWindowAttribute(window, ExtendedFrameBounds, out frame, Marshal.SizeOf(typeof(NativeRect)));
        if (status != 0) throw new InvalidOperationException("DWMWA_EXTENDED_FRAME_BOUNDS failed with HRESULT 0x" + status.ToString("X8"));
        return frame;
    }

    // The Orbit bar is page content, so a window without a native caption has its client area at the top of its frame.
    // A per-monitor aware thread reads the frame, the client origin, the menu bar and the screen in the same physical pixels.
    public static OrbitWindowBarReading Read(IntPtr window, string capture) {
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
        int bar = (int)Math.Round(BarCssHeight * GetDpiForWindow(window) / 96.0);
        if (width <= 0 || height <= bar) throw new InvalidOperationException("The window is smaller than its top bar");
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
                menuRect = attached ? new[] { menu.Bar.Left, menu.Bar.Top, menu.Bar.Right, menu.Bar.Bottom } : null };
        }
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
