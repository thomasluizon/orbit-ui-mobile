#include "../src-tauri/native/windows/channel.h"
#include <cassert>
#include <memory>
#include <string>

using Clock = std::chrono::system_clock;
struct Channel {
    struct Endpoint { std::string uri; Clock::time_point expiry; int closes = 0; };
    std::shared_ptr<Endpoint> endpoint;
    Channel(std::nullptr_t = nullptr) {}
    Channel(std::string uri, Clock::time_point expiry) : endpoint(std::make_shared<Endpoint>(Endpoint{uri, expiry})) {}
    explicit operator bool() const { return static_cast<bool>(endpoint); }
    Clock::time_point ExpirationTime() const { return endpoint->expiry; }
    void Close() { endpoint->closes++; }
};

int main() {
    Clock::time_point now{};
    Channel channel;
    int registrations = 0;
    auto create = [&]() {
        registrations++;
        return Channel{registrations == 1 ? "previous" : "replacement", now + std::chrono::hours(24 * 30)};
    };
    renew_channel(channel, now, create);
    assert(channel.endpoint->uri == "previous");
    auto previous = channel.endpoint;
    now += std::chrono::hours(24 * 30) + std::chrono::seconds(1);
    renew_channel(channel, now, create);
    assert(channel.endpoint->uri == "replacement");
    assert(previous->closes == 1);
    renew_channel(channel, now, create);
    assert(channel.endpoint->uri == "replacement");
    assert(registrations == 2);
    now = channel.ExpirationTime() - std::chrono::hours(1);
    renew_channel(channel, now, create);
    assert(registrations == 3);
}
