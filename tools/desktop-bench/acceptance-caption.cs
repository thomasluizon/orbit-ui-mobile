using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public sealed class OrbitCaptionColor {
    public int[] color;
    public int count;
}

public sealed class OrbitCaption {
    public int[] frame;
    public int bottom;
    public bool menuBar;
    public int sampled;
    public OrbitCaptionColor[] colors;
    // DWMWA_USE_IMMERSIVE_DARK_MODE as DwmGetWindowAttribute reads it back: 1 for the dark window theme, 0 for the light one.
    public int darkMode;
    public int darkModeStatus;
}

// Windows PowerShell 5.1 compiles this file with its C# 5 compiler and default references, so it uses neither a later
// language feature nor System.Core.
public static class OrbitCaptionReader {
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
    [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out NativeRect value, int size);
    [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr window, int attribute, out int value, int size);
    [DllImport("dwmapi.dll")] private static extern int DwmFlush();
    private const int ExtendedFrameBounds = 9;
    // tao writes the window theme to attribute 20 on every build after 18985, which includes every Windows 11 build.
    private const int UseImmersiveDarkMode = 20;
    private const int MenuObject = unchecked((int)0xFFFFFFFD);
    private static readonly IntPtr PerMonitorAwareV2 = new IntPtr(-4);

    // The caption spans the visible frame from its top edge to the menu bar, or to the client area without a menu bar.
    // A per-monitor aware thread reads DWMWA_EXTENDED_FRAME_BOUNDS, the menu bar and the screen in the same physical pixels.
    public static OrbitCaption Read(IntPtr window, string capture) {
        if (SetThreadDpiAwarenessContext(PerMonitorAwareV2) == IntPtr.Zero) throw new Win32Exception("Cannot read the caption in physical pixels");
        // DwmFlush waits for the next composition, so the capture shows the caption that the shell last requested.
        DwmFlush();
        NativeRect frame;
        int status = DwmGetWindowAttribute(window, ExtendedFrameBounds, out frame, Marshal.SizeOf(typeof(NativeRect)));
        if (status != 0) throw new InvalidOperationException("DWMWA_EXTENDED_FRAME_BOUNDS failed with HRESULT 0x" + status.ToString("X8"));
        var menu = new MenuBarInfo { Size = Marshal.SizeOf(typeof(MenuBarInfo)) };
        bool menuBar = GetMenuBarInfo(window, MenuObject, 0, ref menu) && menu.Bar.Bottom > menu.Bar.Top;
        int bottom = menu.Bar.Top;
        if (!menuBar) {
            var origin = new NativePoint();
            if (!ClientToScreen(window, ref origin)) throw new Win32Exception();
            bottom = origin.Y;
        }
        int width = frame.Right - frame.Left, height = bottom - frame.Top;
        if (width <= 0 || height <= 0) throw new InvalidOperationException("The window has no caption above its menu bar or client area");
        using (var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb)) {
            using (var graphics = Graphics.FromImage(bitmap)) graphics.CopyFromScreen(frame.Left, frame.Top, 0, 0, new Size(width, height));
            bitmap.Save(capture, ImageFormat.Png);
            // The middle fifth of the middle half holds no icon, title text, caption button or frame edge at any usable width.
            var counts = new Dictionary<int, int>();
            int sampled = 0;
            for (int y = height / 4; y < height - height / 4; y++) {
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
            var colors = new List<OrbitCaptionColor>();
            for (int index = 0; index < ranked.Count && index < 5; index++) {
                int color = ranked[index].Key;
                colors.Add(new OrbitCaptionColor { color = new[] { (color >> 16) & 0xFF, (color >> 8) & 0xFF, color & 0xFF }, count = ranked[index].Value });
            }
            // A failed read-back is a reading, not an error, so the caller polls it and reports its HRESULT.
            int darkMode;
            int darkModeStatus = DwmGetWindowAttribute(window, UseImmersiveDarkMode, out darkMode, sizeof(int));
            return new OrbitCaption { frame = new[] { frame.Left, frame.Top, frame.Right, frame.Bottom }, bottom = bottom,
                menuBar = menuBar, sampled = sampled, colors = colors.ToArray(), darkMode = darkMode, darkModeStatus = darkModeStatus };
        }
    }
}
