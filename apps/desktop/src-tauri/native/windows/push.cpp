#include <windows.h>
#include <MddBootstrap.h>
#include <WindowsAppSDK-VersionInfo.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Microsoft.Windows.PushNotifications.h>
#include <winrt/Microsoft.Windows.AppNotifications.h>
#include <winrt/Microsoft.Windows.AppNotifications.Builder.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <chrono>
#include <string>

using namespace winrt::Microsoft::Windows::PushNotifications;
using namespace winrt::Microsoft::Windows::AppNotifications;
using Callback = void (*)(int, const unsigned char *, size_t);
static Callback callback;
static PushNotificationChannel channel{nullptr};
static PushNotificationManager manager{nullptr};
static winrt::event_token received;
static bool registered = false;
static winrt::guid remoteId;
static AppNotificationManager notifications{nullptr};

struct Apartment {
    HRESULT result = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    Apartment() { if (FAILED(result) && result != RPC_E_CHANGED_MODE) winrt::check_hresult(result); }
    ~Apartment() { if (SUCCEEDED(result)) CoUninitialize(); }
};

static void emit(int kind, std::string const& payload = {}) {
    callback(kind, reinterpret_cast<unsigned char const*>(payload.data()), payload.size());
}

extern "C" int orbit_wns_initialize(wchar_t const* bootstrap, char const* objectId, Callback handler) {
    callback = handler;
    if (manager) return 0;
    try {
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
        notifications.NotificationInvoked([](auto const&, AppNotificationActivatedEventArgs const& arguments) {
            auto values = arguments.Arguments();
            if (values.HasKey(L"orbitNoticeId")) emit(6, winrt::to_string(values.Lookup(L"orbitNoticeId")));
        });
        notifications.Register();
        return 0;
    } catch (...) { return 2; }
}

extern "C" void orbit_push_request(bool prompt, bool token) {
    if (!manager) { emit(0); return; }
    try {
        Apartment apartment;
        auto setting = notifications.Setting();
        if (setting == AppNotificationSetting::Unsupported) { emit(0); return; }
        if (setting != AppNotificationSetting::Enabled) { emit(3); return; }
        if (!token) { emit(2); return; }
        if (!registered) { manager.Register(); registered = true; }
        if (!channel) {
            auto operation = manager.CreateChannelAsync(remoteId);
            if (operation.wait_for(std::chrono::seconds(300)) != winrt::Windows::Foundation::AsyncStatus::Completed) {
                operation.Cancel(); emit(7); return;
            }
            auto result = operation.GetResults();
            if (result.Status() != PushNotificationChannelStatus::CompletedSuccess) { emit(7); return; }
            channel = result.Channel();
        }
        emit(4, winrt::to_string(channel.Uri().ToString()));
    } catch (...) { emit(7); }
}

extern "C" bool orbit_push_show(char const* title, char const* body, char const* identifier) {
    try {
        Apartment apartment;
        auto notice = winrt::Microsoft::Windows::AppNotifications::Builder::AppNotificationBuilder()
            .AddArgument(L"orbitNoticeId", winrt::to_hstring(identifier))
            .AddText(winrt::to_hstring(title)).AddText(winrt::to_hstring(body)).BuildNotification();
        notifications.Show(notice);
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

extern "C" void orbit_push_set_active(bool active) {
    if (!active && notifications) {
        try { Apartment apartment; notifications.RemoveAllAsync().get(); } catch (...) { emit(7); }
    }
}
