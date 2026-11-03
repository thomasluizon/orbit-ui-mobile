#include "../src-tauri/native/windows/launch.cpp"
#include <cassert>
#include <fstream>
#include <string>
#include <utility>
#include <vector>

static bool shown() {
    return (GetWindowLongPtrW(launch.window, GWL_STYLE) & WS_VISIBLE) != 0;
}

static void assert_centered_mark() {
    UpdateWindow(launch.window);
    RECT bounds{};
    GetClientRect(launch.window, &bounds);
    HDC window = GetDC(launch.window);
    HDC capture = CreateCompatibleDC(window);
    BITMAPINFO format{};
    format.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
    format.bmiHeader.biWidth = bounds.right;
    format.bmiHeader.biHeight = -bounds.bottom;
    format.bmiHeader.biPlanes = 1;
    format.bmiHeader.biBitCount = 32;
    format.bmiHeader.biCompression = BI_RGB;
    void *pixels = nullptr;
    HBITMAP bitmap = CreateDIBSection(window, &format, DIB_RGB_COLORS, &pixels, nullptr, 0);
    assert(window && capture && bitmap && pixels);
    HGDIOBJ previous = SelectObject(capture, bitmap);
    assert(BitBlt(capture, 0, 0, bounds.right, bounds.bottom, window, 0, 0, SRCCOPY));
    GdiFlush();
    const auto *channels = static_cast<const unsigned char *>(pixels);
    const int size = MulDiv(128, GetDpiForWindow(launch.window), 96);
    const int left = (bounds.right - size) / 2, top = (bounds.bottom - size) / 2;
    int mark_pixels = 0;
    for (int y = 0; y < bounds.bottom; ++y) {
        for (int x = 0; x < bounds.right; ++x) {
            const int offset = (y * bounds.right + x) * 4;
            if (RGB(channels[offset + 2], channels[offset + 1], channels[offset]) == launch.canvas) continue;
            assert(x >= left && x < left + size && y >= top && y < top + size);
            ++mark_pixels;
        }
    }
    assert(mark_pixels > size);
    SelectObject(capture, previous);
    DeleteObject(bitmap);
    DeleteDC(capture);
    ReleaseDC(launch.window, window);
}

int main(int count, char *arguments[]) {
    assert(count == 3);
    const bool dark = std::string(arguments[2]) == "dark";
    const unsigned char red = dark ? 9 : 250, blue = dark ? 11 : 250;
    std::ifstream input(arguments[1], std::ios::binary);
    std::vector<unsigned char> png((std::istreambuf_iterator<char>(input)), {});
    assert(!png.empty());
    HWND parent = CreateWindowExW(0, L"STATIC", L"", WS_OVERLAPPEDWINDOW,
        0, 0, 800, 600, nullptr, nullptr, GetModuleHandleW(nullptr), nullptr);
    assert(parent);
    SetWindowPos(parent, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
    assert(orbit_launch_install(parent, png.data(), png.size(), red, red, blue));
    assert(shown() && launch.mark->GetLastStatus() == Gdiplus::Ok);
    assert(GetWindow(parent, GW_CHILD) == launch.window);
    assert_centered_mark();
    auto first = launch.timer;
    assert(orbit_launch_install(parent, png.data(), png.size(), 250, 250, 250));
    assert(shown() && launch.timer == first);
    assert(launch.canvas == RGB(250, 250, 250));
    assert(GetWindow(launch.window, GW_HWNDNEXT) == nullptr);
    orbit_launch_set_visible(parent, false);
    assert(!shown() && !launch.timer);
    assert(orbit_launch_install(parent, png.data(), png.size(), red, red, blue));
    assert(!shown() && !launch.timer && launch.canvas == RGB(red, red, blue));
    orbit_launch_set_visible(parent, true);
    assert(shown() && launch.timer != first);
    SendMessageW(launch.window, WM_TIMER, first, 0);
    assert(shown());
    for (const auto &size : {std::pair{1000, 600}, std::pair{1000, 700}, std::pair{700, 500}}) {
        SetWindowPos(parent, nullptr, 0, 0, size.first, size.second, SWP_NOMOVE | SWP_NOZORDER);
        RECT outer{}, inner{};
        GetClientRect(parent, &outer);
        GetClientRect(launch.window, &inner);
        assert(outer.right == inner.right && outer.bottom == inner.bottom);
        assert_centered_mark();
    }
    SendMessageW(launch.window, WM_TIMER, launch.timer, 0);
    assert(!shown() && !launch.timer);
    orbit_launch_set_visible(parent, true);
    assert(shown() && launch.timer);
    orbit_launch_set_visible(parent, false);
    DestroyWindow(parent);
    return 0;
}
