#include <windows.h>
#include <commctrl.h>

// WHY: Windows 11 shows the snap layouts flyout for a non-client hit of HTMAXBUTTON. The Orbit bar is web content, so a child
// window over the maximize action answers that hit. These sizes are CSS pixels and match apps/web/lib/desktop-window.ts.
static constexpr int kBarHeight = 48;
static constexpr int kControlWidth = 44;
static constexpr int kEndInset = 4;
static constexpr UINT_PTR kParentSubclass = 2;
// A layered window lets mouse input through where its alpha is zero (Win32 "Layered Windows", hit testing), so the region
// keeps the lowest visible alpha: its black fill adds 1/255 over the page, and the page glyph, hover and press stay visible.
static constexpr BYTE kRegionAlpha = 1;

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
    definition.hbrBackground = static_cast<HBRUSH>(GetStockObject(BLACK_BRUSH));
    definition.lpszClassName = L"OrbitSnapRegion";
    if (!RegisterClassW(&definition)) return false;
    auto window = static_cast<HWND>(parent);
    caption.hover = hover;
    // Windows 8 and later accept WS_EX_LAYERED on a child window; the shell manifest declares those versions. The region starts
    // hidden, because a hidden window takes no hit test: it answers only once the page reports the bar under it.
    caption.overlay = CreateWindowExW(WS_EX_LAYERED, definition.lpszClassName, L"", WS_CHILD | WS_CLIPSIBLINGS,
        0, 0, 0, 0, window, nullptr, definition.hInstance, nullptr);
    if (!caption.overlay || !SetLayeredWindowAttributes(caption.overlay, 0, kRegionAlpha, LWA_ALPHA)) return false;
    if (!SetWindowSubclass(window, parent_events, kParentSubclass, 0)) return false;
    place(window);
    return true;
}

// The shell shows the region while the page reports the bar and hides it when the bar goes away or a new document loads. Neither
// case leaves a bar that shows the hover fill, so hiding resets the pointer state without a report to the page.
extern "C" void orbit_caption_set_active(void *parent, bool active) {
    if (!caption.overlay) return;
    if (active) {
        place(static_cast<HWND>(parent));
        ShowWindow(caption.overlay, SW_SHOWNOACTIVATE);
        return;
    }
    ShowWindow(caption.overlay, SW_HIDE);
    caption.pressed = false;
    caption.hovered = false;
}
