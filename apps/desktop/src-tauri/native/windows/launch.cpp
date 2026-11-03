#include <windows.h>

extern "C" bool orbit_launch_is_dark() {
    DWORD light = 1;
    DWORD length = sizeof(light);
    auto status = RegGetValueW(HKEY_CURRENT_USER,
        L"Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
        L"AppsUseLightTheme", RRF_RT_REG_DWORD, nullptr, &light, &length);
    return status == ERROR_SUCCESS && light == 0;
}
