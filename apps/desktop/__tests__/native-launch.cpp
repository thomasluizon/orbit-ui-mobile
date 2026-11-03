#include "../src-tauri/native/windows/launch.cpp"
#include <cassert>
#include <fstream>
#include <vector>

static bool shown() {
    return (GetWindowLongPtrW(launch.window, GWL_STYLE) & WS_VISIBLE) != 0;
}

int main(int count, char *arguments[]) {
    assert(count == 2);
    std::ifstream input(arguments[1], std::ios::binary);
    std::vector<unsigned char> png((std::istreambuf_iterator<char>(input)), {});
    assert(!png.empty());
    HWND parent = CreateWindowExW(0, L"STATIC", L"", WS_OVERLAPPEDWINDOW,
        0, 0, 800, 600, nullptr, nullptr, GetModuleHandleW(nullptr), nullptr);
    assert(parent);
    assert(orbit_launch_install(parent, png.data(), png.size(), 9, 9, 11));
    assert(shown() && launch.mark->GetLastStatus() == Gdiplus::Ok);
    assert(GetWindow(parent, GW_CHILD) == launch.window);
    auto first = launch.timer;
    orbit_launch_set_visible(parent, false);
    assert(!shown() && !launch.timer);
    orbit_launch_set_visible(parent, true);
    assert(shown() && launch.timer != first);
    SendMessageW(launch.window, WM_TIMER, first, 0);
    assert(shown());
    SetWindowPos(parent, nullptr, 0, 0, 1000, 700, SWP_NOMOVE | SWP_NOZORDER);
    RECT outer{}, inner{};
    GetClientRect(parent, &outer);
    GetClientRect(launch.window, &inner);
    assert(outer.right == inner.right && outer.bottom == inner.bottom);
    SendMessageW(launch.window, WM_TIMER, launch.timer, 0);
    assert(!shown() && !launch.timer);
    orbit_launch_set_visible(parent, true);
    assert(shown() && launch.timer);
    orbit_launch_set_visible(parent, false);
    DestroyWindow(parent);
    return 0;
}
