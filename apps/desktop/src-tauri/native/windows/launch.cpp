#include <windows.h>
#include <commctrl.h>
#include <dwmapi.h>
#include <gdiplus.h>
#include <shlwapi.h>
#include <memory>
#include <algorithm>

struct LaunchSurface {
    ULONG_PTR graphics = 0;
    IStream *stream = nullptr;
    std::unique_ptr<Gdiplus::Bitmap> mark;
    HWND window = nullptr;
    COLORREF canvas = 0;
    UINT_PTR timer = 0;
    UINT_PTR sequence = 0;
    ~LaunchSurface() {
        mark.reset();
        if (stream) stream->Release();
        if (graphics) Gdiplus::GdiplusShutdown(graphics);
    }
};

static LaunchSurface launch;

static void finish() {
    KillTimer(launch.window, launch.timer);
    launch.timer = 0;
    ShowWindow(launch.window, SW_HIDE);
}

static void resize(HWND parent) {
    RECT bounds{};
    GetClientRect(parent, &bounds);
    SetWindowPos(launch.window, HWND_TOP, 0, 0, bounds.right, bounds.bottom, SWP_NOACTIVATE);
}

static LRESULT CALLBACK parent_events(HWND window, UINT message, WPARAM word, LPARAM parameter,
    UINT_PTR identifier, DWORD_PTR reference) {
    (void)reference;
    if (message == WM_STYLECHANGING && word == static_cast<WPARAM>(GWL_STYLE)) {
        reinterpret_cast<STYLESTRUCT *>(parameter)->styleNew |= WS_CLIPCHILDREN;
    }
    if (message == WM_SIZE || message == WM_DPICHANGED) resize(window);
    if (message == WM_NCDESTROY) RemoveWindowSubclass(window, parent_events, identifier);
    return DefSubclassProc(window, message, word, parameter);
}

static LRESULT CALLBACK paint(HWND window, UINT message, WPARAM word, LPARAM parameter) {
    if (message == WM_ERASEBKGND) return 1;
    if (message == WM_TIMER) {
        if (word == launch.timer && launch.timer) finish();
        return 0;
    }
    if (message == WM_PAINT) {
        PAINTSTRUCT frame{};
        HDC context = BeginPaint(window, &frame);
        RECT bounds{};
        GetClientRect(window, &bounds);
        HBRUSH canvas = CreateSolidBrush(launch.canvas);
        FillRect(context, &bounds, canvas);
        DeleteObject(canvas);
        if (launch.mark) {
            Gdiplus::Graphics graphics(context);
            int size = MulDiv(128, GetDpiForWindow(window), 96);
            size = (std::min)(size, static_cast<int>((std::min)(bounds.right, bounds.bottom)));
            graphics.SetInterpolationMode(Gdiplus::InterpolationModeHighQualityBicubic);
            graphics.DrawImage(launch.mark.get(), (bounds.right - size) / 2,
                (bounds.bottom - size) / 2, size, size);
        }
        EndPaint(window, &frame);
        return 0;
    }
    return DefWindowProcW(window, message, word, parameter);
}

extern "C" void orbit_launch_set_visible(void *parent, bool visible) {
    if (!launch.window) return;
    if (!visible) {
        finish();
        return;
    }
    resize(static_cast<HWND>(parent));
    KillTimer(launch.window, launch.timer);
    launch.timer = ++launch.sequence;
    ShowWindow(launch.window, SW_SHOWNOACTIVATE);
    if (!SetTimer(launch.window, launch.timer, 15000, nullptr)) {
        finish();
        return;
    }
    RedrawWindow(launch.window, nullptr, nullptr, RDW_INVALIDATE | RDW_UPDATENOW);
}

// WHY: Windows 10 rejects DWMWA_CAPTION_COLOR and keeps the immersive caption of the window theme, which is the intended fallback.
static void paint_caption(HWND window, COLORREF canvas) {
    DwmSetWindowAttribute(window, DWMWA_CAPTION_COLOR, &canvas, sizeof(canvas));
}

extern "C" bool orbit_launch_install(void *parent, const unsigned char *png, size_t length,
    unsigned char red, unsigned char green, unsigned char blue) {
    paint_caption(static_cast<HWND>(parent), RGB(red, green, blue));
    if (!launch.graphics) {
        Gdiplus::GdiplusStartupInput input;
        if (Gdiplus::GdiplusStartup(&launch.graphics, &input, nullptr) != Gdiplus::Ok) return false;
    }
    IStream *stream = SHCreateMemStream(png, static_cast<UINT>(length));
    if (!stream) return false;
    std::unique_ptr<Gdiplus::Bitmap> mark(Gdiplus::Bitmap::FromStream(stream));
    if (!mark || mark->GetLastStatus() != Gdiplus::Ok) {
        mark.reset();
        stream->Release();
        return false;
    }
    launch.mark = std::move(mark);
    if (launch.stream) launch.stream->Release();
    launch.stream = stream;
    launch.canvas = RGB(red, green, blue);
    if (launch.window) {
        InvalidateRect(launch.window, nullptr, FALSE);
        return true;
    }
    WNDCLASSW definition{};
    definition.style = CS_HREDRAW | CS_VREDRAW;
    definition.lpfnWndProc = paint;
    definition.hInstance = GetModuleHandleW(nullptr);
    definition.lpszClassName = L"OrbitLaunchSurface";
    if (!RegisterClassW(&definition)) return false;
    auto window = static_cast<HWND>(parent);
    SetWindowLongPtrW(window, GWL_STYLE, GetWindowLongPtrW(window, GWL_STYLE) | WS_CLIPCHILDREN);
    for (HWND sibling = GetWindow(window, GW_CHILD); sibling;
        sibling = GetWindow(sibling, GW_HWNDNEXT)) {
        SetWindowLongPtrW(sibling, GWL_STYLE, GetWindowLongPtrW(sibling, GWL_STYLE) | WS_CLIPSIBLINGS);
    }
    launch.window = CreateWindowExW(0, definition.lpszClassName, L"", WS_CHILD | WS_CLIPSIBLINGS,
        0, 0, 0, 0, window, nullptr, definition.hInstance, nullptr);
    if (!launch.window || !SetWindowSubclass(window, parent_events, 1, 0)) return false;
    orbit_launch_set_visible(parent, true);
    return true;
}

extern "C" bool orbit_launch_is_dark() {
    DWORD light = 1;
    DWORD length = sizeof(light);
    auto status = RegGetValueW(HKEY_CURRENT_USER,
        L"Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
        L"AppsUseLightTheme", RRF_RT_REG_DWORD, nullptr, &light, &length);
    return status == ERROR_SUCCESS && light == 0;
}
