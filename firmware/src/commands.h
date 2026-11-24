#pragma once

#include <stddef.h>
#include <stdint.h>

// Router comandi condiviso dai trasporti (WebSocket, BLE).
// Architettura single-owner:
// - I trasporti (task async_tcp e nimble_host) validano auth/framing e accodano
//   i comandi tramite commands_enqueue_*() (thread-safe, non-bloccante).
// - loopTask drena la coda e avanza tutte le azioni non-bloccanti (tap, text,
//   consumer, macro, accessi NVS e USB HID) chiamando commands_tick().

enum class Transport : uint8_t {
  WS = 0,
  BLE = 1,
};

typedef void (*TransportSendFn)(uint32_t peerId, const char* json);
typedef void (*BroadcastFn)(const char* json);

void commands_init();

// Registra i canali di risposta/broadcast dei trasporti (chiamare in setup()).
void commands_set_ws_transport(TransportSendFn send, BroadcastFn broadcast);
void commands_set_ble_transport(TransportSendFn send, BroadcastFn broadcast);

// API thread-safe chiamabili dai task dei trasporti (WS / BLE):
bool commands_enqueue_welcome(Transport src, uint32_t peerId);
bool commands_enqueue_mouse(int16_t dx, int16_t dy);
bool commands_enqueue_scroll(int16_t dx, int16_t dy);
bool commands_enqueue_json(Transport src, uint32_t peerId, const char* data, size_t len);
bool commands_enqueue_input_clear();

// Chiamare esclusivamente da loopTask. Ritorna true se c'e' lavoro attivo
// (coda non vuota, tap/text/consumer pendenti o macro in corso).
bool commands_tick();
