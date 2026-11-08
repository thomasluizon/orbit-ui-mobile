#include <windows.h>
#include <sddl.h>
#include <MddBootstrap.h>
#include <WindowsAppSDK-VersionInfo.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Microsoft.Windows.PushNotifications.h>
#include <winrt/Microsoft.Windows.AppNotifications.h>
#include <winrt/Microsoft.Windows.AppNotifications.Builder.h>
#include <winrt/Microsoft.Windows.AppLifecycle.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <chrono>
#include <string>
#include <cstdlib>
#include "channel.h"

using namespace winrt::Microsoft::Windows::PushNotifications;
using namespace winrt::Microsoft::Windows::AppNotifications;
using Callback = void (*)(int, const unsigned char *, size_t);
static Callback callback;
static PushNotificationChannel channel{nullptr};
static PushNotificationManager manager{nullptr};
static winrt::event_token received;
static winrt::event_token invoked;
static bool initialized = false;
static bool registered = false;
static winrt::guid remoteId;

extern "C" bool orbit_push_protect_file(wchar_t const* path) {
    PSECURITY_DESCRIPTOR descriptor = nullptr;
    if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(
            L"D:P(A;;FA;;;OW)", SDDL_REVISION_1, &descriptor, nullptr)) return false;
    auto protectedFile = SetFileSecurityW(
        path, DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION, descriptor);
    LocalFree(descriptor);
    return protectedFile != FALSE;
}
static AppNotificationManager notifications{nullptr};
static CO_MTA_USAGE_COOKIE mtaCookie = nullptr;

static void shutdown_runtime() {
    if (mtaCookie) CoDecrementMTAUsage(mtaCookie);
}

struct Apartment {
    HRESULT result = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    Apartment() { if (FAILED(result) && result != RPC_E_CHANGED_MODE) winrt::check_hresult(result); }
    ~Apartment() { if (SUCCEEDED(result)) CoUninitialize(); }
};

static void emit(int kind, std::string const& payload = {}) {
    callback(kind, reinterpret_cast<unsigned char const*>(payload.data()), payload.size());
}

static bool activated(AppNotificationActivatedEventArgs const& arguments) {
    auto values = arguments.Arguments();
    if (values.HasKey(L"orbitNotice")) {
        bool done = values.HasKey(L"orbitAction") && values.Lookup(L"orbitAction") == L"done";
        emit(done ? 8 : 6, winrt::to_string(values.Lookup(L"orbitNotice")));
        return true;
    }
    return false;
}

extern "C" bool orbit_push_activate() {
    try {
        Apartment apartment;
        auto activation = winrt::Microsoft::Windows::AppLifecycle::AppInstance::GetCurrent().GetActivatedEventArgs();
        if (!activation) return false;
        auto arguments = activation.Data().try_as<AppNotificationActivatedEventArgs>();
        if (!arguments) return false;
        return activated(arguments);
    } catch (...) { return false; }
}

extern "C" int orbit_wns_initialize(wchar_t const* bootstrap, char const* objectId, Callback handler) {
    callback = handler;
    if (initialized) return 0;
    try {
        if (!mtaCookie) {
            winrt::check_hresult(CoIncrementMTAUsage(&mtaCookie));
            std::atexit(shutdown_runtime);
        }
        Apartment apartment;
        HMODULE library = LoadLibraryExW(bootstrap, nullptr, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS);
        if (!library) return 1;
        auto initialize = reinterpret_cast<decltype(&MddBootstrapInitialize2)>(GetProcAddress(library, "MddBootstrapInitialize2"));
        if (!initialize) return 1;
        PACKAGE_VERSION minimum{};
        minimum.Version = WINDOWSAPPSDK_RUNTIME_VERSION_UINT64;
        HRESULT result = initialize(WINDOWSAPPSDK_RELEASE_MAJORMINOR, WINDOWSAPPSDK_RELEASE_VERSION_TAG_W, minimum, MddBootstrapInitializeOptions_None);
        if (FAILED(result)) return 1;
        if (!PushNotificationManager::IsSupported()) return 2;
        manager = PushNotificationManager::Default();
        remoteId = winrt::guid{winrt::to_hstring(objectId)};
        received = manager.PushReceived([](auto const&, PushNotificationReceivedEventArgs const& arguments) {
            auto payload = arguments.Payload();
            emit(5, std::string(payload.begin(), payload.end()));
        });
        notifications = AppNotificationManager::Default();
        invoked = notifications.NotificationInvoked([](auto const&, AppNotificationActivatedEventArgs const& arguments) {
            activated(arguments);
        });
        notifications.Register();
        initialized = true;
        return 0;
    } catch (...) {
        try { if (manager) manager.PushReceived(received); } catch (...) {}
        try { if (notifications) notifications.NotificationInvoked(invoked); } catch (...) {}
        notifications = nullptr;
        manager = nullptr;
        return 1;
    }
}

static char const* setting_name(AppNotificationSetting setting) {
    switch (setting) {
        case AppNotificationSetting::Enabled: return "Enabled";
        case AppNotificationSetting::DisabledForApplication: return "DisabledForApplication";
        case AppNotificationSetting::DisabledForUser: return "DisabledForUser";
        case AppNotificationSetting::DisabledByGroupPolicy: return "DisabledByGroupPolicy";
        case AppNotificationSetting::DisabledByManifest: return "DisabledByManifest";
        case AppNotificationSetting::Unsupported: return "Unsupported";
    }
    return "Unknown";
}

// App notifications are unsupported in an elevated process, so each unsupported answer names the token elevation.
static char const* elevation() {
    HANDLE token = nullptr;
    if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &token)) return "unknown";
    TOKEN_ELEVATION value{};
    DWORD length = 0;
    bool known = GetTokenInformation(token, TokenElevation, &value, sizeof(value), &length) != FALSE;
    CloseHandle(token);
    if (!known) return "unknown";
    return value.TokenIsElevated ? "true" : "false";
}

extern "C" void orbit_push_request(bool prompt, bool token) {
    (void)prompt;
    if (!manager) { emit(0, std::string("manager=null elevated=") + elevation()); return; }
    try {
        Apartment apartment;
        auto setting = notifications.Setting();
        if (setting == AppNotificationSetting::Unsupported) {
            emit(0, std::string("setting=") + setting_name(setting) + " isSupported=" +
                (PushNotificationManager::IsSupported() ? "true" : "false") + " elevated=" + elevation());
            return;
        }
        if (setting != AppNotificationSetting::Enabled) { emit(3); return; }
        if (!token) { emit(2); return; }
        if (!registered) { manager.Register(); registered = true; }
        renew_channel(channel, winrt::clock::now(), []() -> PushNotificationChannel {
            auto operation = manager.CreateChannelAsync(remoteId);
            if (operation.wait_for(std::chrono::seconds(300)) != winrt::Windows::Foundation::AsyncStatus::Completed) {
                operation.Cancel(); return nullptr;
            }
            auto result = operation.GetResults();
            if (result.Status() != PushNotificationChannelStatus::CompletedSuccess) return nullptr;
            return result.Channel();
        });
        if (!channel) { emit(7); return; }
        emit(4, winrt::to_string(channel.Uri().ToString()));
    } catch (...) { emit(7); }
}

extern "C" bool orbit_push_show(char const* title, char const* body, char const* activation, bool done, char const* label) {
    try {
        Apartment apartment;
        using namespace winrt::Microsoft::Windows::AppNotifications::Builder;
        auto builder = AppNotificationBuilder()
            .AddArgument(L"orbitNotice", winrt::to_hstring(activation))
            .AddText(winrt::to_hstring(title)).AddText(winrt::to_hstring(body));
        if (done) builder.AddButton(AppNotificationButton(winrt::to_hstring(label))
            .AddArgument(L"orbitNotice", winrt::to_hstring(activation)).AddArgument(L"orbitAction", L"done"));
        notifications.Show(builder.BuildNotification());
        return true;
    } catch (...) { return false; }
}

extern "C" bool orbit_push_stop() {
    try {
        Apartment apartment;
        if (channel) { channel.Close(); channel = nullptr; }
        if (registered) { manager.Unregister(); registered = false; }
        if (notifications) notifications.RemoveAllAsync().get();
        return true;
    } catch (...) { return false; }
}
