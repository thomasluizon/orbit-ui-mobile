#pragma once
#include <chrono>

template <typename Channel, typename Time, typename Create>
void renew_channel(Channel& channel, Time now, Create create) {
    if (!channel || channel.ExpirationTime() <= now + std::chrono::hours(2)) {
        if (channel) channel.Close();
        channel = nullptr;
        channel = create();
    }
}
