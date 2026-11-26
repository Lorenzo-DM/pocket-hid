#pragma once

#include <stddef.h>
#include <stdint.h>

// Shared command router for all transports (WebSocket, BLE).
// Single-owner architecture:
// - Transports (async_tcp and nimble_host tasks) validate auth/framing and
//   enqueue commands via commands_enqueue_*() (thread-safe, non-blocking).
// - loopTask drains the queue and advances all non-blocking actions (key taps,
//   text typing, consumer keys, macros, NVS, and USB HID) via commands_tick().

enum class Transport : uint8_t {
  WS = 0,
  BLE = 1,
};

typedef void (*TransportSendFn)(uint32_t peerId, const char* json);
typedef void (*BroadcastFn)(const char* json);

void commands_init();

// Register transport reply/broadcast channels (call from setup()).
void commands_set_ws_transport(TransportSendFn send, BroadcastFn broadcast);
void commands_set_ble_transport(TransportSendFn send, BroadcastFn broadcast);

// Thread-safe API callable from transport tasks (WS / BLE):
bool commands_enqueue_welcome(Transport src, uint32_t peerId);
bool commands_enqueue_mouse(int16_t dx, int16_t dy);
bool commands_enqueue_scroll(int16_t dx, int16_t dy);
bool commands_enqueue_json(Transport src, uint32_t peerId, const char* data, size_t len);
bool commands_enqueue_input_clear();

// Call exclusively from loopTask. Returns true if active work remains
// (non-empty queue, pending tap/text/consumer release, or running macro).
bool commands_tick();
