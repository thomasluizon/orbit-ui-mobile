#include <windows.h>
#include <commctrl.h>

// WHY: Windows 11 shows the snap layouts flyout for a non-client hit of HTMAXBUTTON. The Orbit bar is web content, so a child
// window over the maximize action answers that hit. These sizes are CSS pixels and match apps/web/lib/desktop-window.ts.
static constexpr int kBarHeight = 48;
static constexpr int kControlWidth = 44;
static constexpr int kEndInset = 4;
static constexpr UINT_PTR kParentSubclass = 2;

struct Caption {
    HWND overlay = nullptr;
    void (*hover)(bool) = nullptr;
    bool hovered = false;
    bool pressed = false;
};

static Caption caption;

static void place(HWND parent) {
    RECT client{};
    GetClientRect(parent, &client);
    UINT dpi = GetDpiForWindow(parent);
    int width = MulDiv(kControlWidth, dpi, 96);
    int height = MulDiv(kBarHeight, dpi, 96);
    int inset = MulDiv(kEndInset, dpi, 96);
    SetWindowPos(caption.overlay, HWND_TOP, client.right - inset - 2 * width, 0, width, height, SWP_NOACTIVATE);
}

static void set_hovered(bool hovered) {
    if (caption.hovered == hovered) return;
    caption.hovered = hovered;
    if (caption.hover) caption.hover(hovered);
}

static LRESULT CALLBACK parent_events(HWND window, UINT message, WPARAM word, LPARAM parameter,
    UINT_PTR identifier, DWORD_PTR reference) {
    (void)reference;
    if (message == WM_SIZE || message == WM_DPICHANGED) place(window);
    if (message == WM_NCDESTROY) RemoveWindowSubclass(window, parent_events, identifier);
    return DefSubclassProc(window, message, word, parameter);
}

static LRESULT CALLBACK overlay_events(HWND window, UINT message, WPARAM word, LPARAM parameter) {
    switch (message) {
    case WM_NCHITTEST:
        return HTMAXBUTTON;
    case WM_NCMOUSEMOVE: {
        TRACKMOUSEEVENT track{sizeof(track), TME_LEAVE | TME_NONCLIENT, window, 0};
        TrackMouseEvent(&track);
        set_hovered(true);
        return 0;
    }
    case WM_NCMOUSELEAVE:
        caption.pressed = false;
        set_hovered(false);
        return 0;
    case WM_NCLBUTTONDOWN:
        caption.pressed = word == HTMAXBUTTON;
        return 0;
    case WM_NCLBUTTONUP: {
        bool pressed = caption.pressed;
        caption.pressed = false;
        if (pressed && word == HTMAXBUTTON) {
            HWND parent = GetParent(window);
            PostMessageW(parent, WM_SYSCOMMAND, IsZoomed(parent) ? SC_RESTORE : SC_MAXIMIZE, 0);
        }
        return 0;
    }
    default:
        return DefWindowProcW(window, message, word, parameter);
    }
}

extern "C" bool orbit_caption_install(void *parent, void (*hover)(bool)) {
    if (caption.overlay) return true;
    WNDCLASSW definition{};
    definition.lpfnWndProc = overlay_events;
    definition.hInstance = GetModuleHandleW(nullptr);
    definition.lpszClassName = L"OrbitSnapRegion";
    if (!RegisterClassW(&definition)) return false;
    auto window = static_cast<HWND>(parent);
    caption.hover = hover;
    caption.overlay = CreateWindowExW(0, definition.lpszClassName, L"", WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS,
        0, 0, 0, 0, window, nullptr, definition.hInstance, nullptr);
    if (!caption.overlay || !SetWindowSubclass(window, parent_events, kParentSubclass, 0)) return false;
    place(window);
    return true;
}
