#include "wifi_mgr.h"
#include <WiFi.h>
#include <ESPmDNS.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <DNSServer.h>
#include <atomic>
#include "config.h"

static const char* NS = "mkcfg";
static DNSServer s_dns;
static bool s_dnsOn = false;
static String s_staSsid;          // ssid in uso (NVS o compilato)
static bool s_hasStaCreds = false;
static bool s_apActive = false;
static bool s_staUp = false;      // STA collegata (ha preso IP)
static bool s_mdnsStarted = false;
static bool s_apResumePending = false;
static uint32_t s_apResumeAt = 0;
static uint32_t s_lastWifiAttempt = 0;

// Flag atomici: scritti dal task eventi WiFi / async_tcp, consumati da loopTask
static std::atomic<bool> s_evtGotIp{false};
static std::atomic<bool> s_evtDisconnected{false};
static std::atomic<bool> s_rebootPending{false};
static uint32_t s_rebootAt = 0;

// ---------------------------------------------------------------------------

static String ap_ssid() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char buf[24];
  snprintf(buf, sizeof(buf), "%s-%02X%02X", MK_AP_BASE_SSID, mac[4], mac[5]);
  return String(buf);
}

static bool is_valid_configured_ssid(const String& ssid) {
  return ssid.length() > 0 && ssid != "YOUR_WIFI_SSID";
}

// Tutte le operazioni su s_dns / softAP / mDNS avvengono solo sul loopTask.
static void ap_start() {
  if (s_apActive) return;
  String apName = ap_ssid();
  WiFi.softAP(apName.c_str(), MK_AP_PASS);
  if (!s_dnsOn) s_dnsOn = s_dns.start(53, "*", WiFi.softAPIP());
  s_apActive = true;
  Serial.printf("[wifi] AP \"%s\" attivo, IP %s\n", apName.c_str(),
                WiFi.softAPIP().toString().c_str());
}

static void ap_stop() {
  if (!s_apActive) return;
  if (s_dnsOn) {
    s_dns.stop();
    s_dnsOn = false;
  }
  WiFi.softAPdisconnect(true);
  s_apActive = false;
  Serial.println("[wifi] AP disattivato (STA connessa)");
}

// Callback dal task eventi WiFi: imposta solo flag atomici (niente I/O diretto)
static void on_wifi_event(WiFiEvent_t ev, WiFiEventInfo_t) {
  switch (ev) {
    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      s_evtGotIp.store(true, std::memory_order_release);
      break;
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      s_evtDisconnected.store(true, std::memory_order_release);
      break;
    default:
      break;
  }
}

void wifi_begin() {
  Preferences prefs;
  prefs.begin(NS, true);
  String ssid = prefs.getString("ssid", "");
  String pass = prefs.getString("pass", "");
  prefs.end();

  WiFi.mode(WIFI_AP_STA); // resta in AP_STA per attivare/spegnere l'AP a runtime
  WiFi.setHostname(MK_HOSTNAME);
  WiFi.onEvent(on_wifi_event);
  ap_start(); // serve subito se le credenziali mancano/non funzionano

  if (ssid.length() > 0) {
    s_staSsid = ssid;
    s_hasStaCreds = true;
    WiFi.begin(ssid.c_str(), pass.c_str());
    s_lastWifiAttempt = millis();
    Serial.printf("[wifi] STA da NVS: \"%s\"\n", ssid.c_str());
  } else if (is_valid_configured_ssid(String(WIFI_SSID))) {
    s_staSsid = WIFI_SSID;
    s_hasStaCreds = true;
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    s_lastWifiAttempt = millis();
    Serial.printf("[wifi] STA da config compilata: \"%s\"\n", WIFI_SSID);
  } else {
    s_staSsid = "";
    s_hasStaCreds = false;
    Serial.println("[wifi] nessuna credenziale STA configurata: attivo solo AP portal");
  }
}

void wifi_loop() {
  const uint32_t now = millis();

  if (s_dnsOn) s_dns.processNextRequest();

  // Evento STA connessa (IP ottenuto)
  if (s_evtGotIp.exchange(false, std::memory_order_acq_rel)) {
    s_staUp = true;
    s_apResumePending = false;
    ap_stop();
    Serial.printf("[wifi] STA connessa: %s\n", WiFi.localIP().toString().c_str());
    if (!s_mdnsStarted) {
      if (MDNS.begin(MK_MDNS_NAME)) {
        MDNS.addService("http", "tcp", MK_WS_PORT);
        s_mdnsStarted = true;
        Serial.printf("[wifi] mDNS attivo: http://%s.local\n", MK_MDNS_NAME);
      }
    }
  }

  // Evento STA disconnessa
  if (s_evtDisconnected.exchange(false, std::memory_order_acq_rel)) {
    if (s_staUp) {
      s_staUp = false;
      if (s_mdnsStarted) {
        MDNS.end();
        s_mdnsStarted = false;
      }
      // Riattiva l'AP solo se la caduta persiste (evita blip del router)
      s_apResumeAt = now + 15000;
      s_apResumePending = true;
    }
  }

  // Riconnessione STA periodica solo se esistono credenziali valide
  if (s_hasStaCreds && WiFi.status() != WL_CONNECTED) {
    if (static_cast<int32_t>(now - s_lastWifiAttempt) >= 10000) {
      s_lastWifiAttempt = now;
      Serial.println("[wifi] STA non connessa, riprovo...");
      WiFi.disconnect();
      WiFi.begin();
    }
  }

  // STA caduta e non rientrata entro la grazia: riattiva l'AP per il fallback
  if (!s_staUp && s_apResumePending &&
      static_cast<int32_t>(now - s_apResumeAt) >= 0) {
    s_apResumePending = false;
    ap_start();
  }

  // Riavvio programmato dopo il salvataggio delle credenziali
  if (s_rebootPending.load(std::memory_order_acquire) &&
      static_cast<int32_t>(now - s_rebootAt) >= 0) {
    Serial.println("[wifi] riavvio per applicare le credenziali");
    delay(100);
    ESP.restart();
  }
}

static bool wifi_save_credentials(const String& ssid, const String& pass) {
  if (ssid.length() == 0 || ssid.length() > 32 || pass.length() > 63) return false;
  Preferences prefs;
  prefs.begin(NS, false);
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.end();
  return true;
}

static String extract_portal_token(AsyncWebServerRequest* req) {
  if (req->hasHeader("X-MK-Token")) return req->header("X-MK-Token");
  if (req->hasParam("token", true)) return req->getParam("token", true)->value();
  if (req->hasParam("token")) return req->getParam("token")->value();
  return "";
}

// ---------------------------------------------------------------------------
// Portal: pagina di config + probe captive + diagnostica
// ---------------------------------------------------------------------------

static String build_portal_html() {
  String html =
    "<!doctype html><html lang='it'><head>"
    "<meta charset='utf-8'>"
    "<meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>MK-Remote — Config WiFi</title>"
    "<style>"
    "body{font-family:system-ui,sans-serif;background:#101216;color:#e6e8ec;"
    "max-width:420px;margin:0 auto;padding:24px}"
    "input{width:100%;box-sizing:border-box;padding:12px;border-radius:8px;"
    "border:1px solid #333a45;background:#1a1d23;color:#e6e8ec;font-size:1rem}"
    "button{width:100%;padding:14px;margin-top:14px;border:none;border-radius:10px;"
    "background:#4a90d9;color:#fff;font-size:1rem;font-weight:600}"
    ".m{color:#8b909b;font-size:.85rem}"
    "</style></head><body>"
    "<h1>MK-Remote</h1>"
    "<p class='m'>Configurazione WiFi: le credenziali vengono salvate sul dispositivo (NVS).</p>"
    "<form method='POST' action='/save'>"
    "<p>SSID<br><input name='ssid' maxlength='32' autocomplete='off' required></p>"
    "<p>Password<br><input name='pass' type='password' maxlength='63'></p>";
  if (mk_token_enabled()) {
    html += "<p>Token<br><input name='token' type='password' required></p>";
  }
  html += "<button>Salva e riavvia</button></form></body></html>";
  return html;
}

static const char SAVED_HTML[] =
  "<!doctype html><html lang='it'><head><meta charset='utf-8'>"
  "<meta name='viewport' content='width=device-width,initial-scale=1'>"
  "<title>MK-Remote</title></head>"
  "<body style='font-family:system-ui;padding:24px'>"
  "<p>Credenziali salvate. Il dispositivo si riavvia tra poco…</p>"
  "</body></html>";

void wifi_portal_routes(AsyncWebServer& server, const char* portalBase) {
  // Pagina di configurazione ("/" senza PWA, "/portal" con PWA montata)
  server.on(portalBase, HTTP_GET, [](AsyncWebServerRequest* req) {
    req->send(200, "text/html", build_portal_html());
  });

  server.on("/save", HTTP_POST, [](AsyncWebServerRequest* req) {
    const String token = extract_portal_token(req);
    if (!mk_token_valid(token.c_str())) {
      req->send(401, "text/plain", "token non valido");
      return;
    }
    if (!req->hasParam("ssid", true)) {
      req->send(400, "text/plain", "manca ssid");
      return;
    }
    String ssid = req->getParam("ssid", true)->value();
    String pass = req->hasParam("pass", true) ? req->getParam("pass", true)->value() : "";
    if (!wifi_save_credentials(ssid, pass)) {
      req->send(400, "text/plain", "parametri non validi");
      return;
    }
    s_rebootAt = millis() + 1500;
    s_rebootPending.store(true, std::memory_order_release);
    req->send(200, "text/html", SAVED_HTML);
  });

  // Diagnostica rapida (serializzata via ArduinoJson: sicura con SSID speciali)
  server.on("/wifi-info", HTTP_GET, [](AsyncWebServerRequest* req) {
    const bool connected = (WiFi.status() == WL_CONNECTED);
    JsonDocument d;
    d["sta_ssid"] = s_staSsid;
    d["sta_connected"] = connected;
    d["ip"] = connected ? WiFi.localIP().toString() : WiFi.softAPIP().toString();
    d["ap_ssid"] = ap_ssid();
    String out;
    serializeJson(d, out);
    req->send(200, "application/json", out);
  });

  // Probe captive portal (Android, iOS, Windows) -> reindirizza al portal
  String probeTarget = String("http://") + WiFi.softAPIP().toString() + portalBase;
  server.on("/generate_204", HTTP_GET, [probeTarget](AsyncWebServerRequest* req) {
    req->redirect(probeTarget);
  });
  server.on("/hotspot-detect.html", HTTP_GET, [probeTarget](AsyncWebServerRequest* req) {
    req->redirect(probeTarget);
  });
  server.on("/connecttest.txt", HTTP_GET, [probeTarget](AsyncWebServerRequest* req) {
    req->redirect(probeTarget);
  });
  server.on("/ncsi.txt", HTTP_GET, [probeTarget](AsyncWebServerRequest* req) {
    req->redirect(probeTarget);
  });
  server.on("/fwlink", HTTP_GET, [probeTarget](AsyncWebServerRequest* req) {
    req->redirect(probeTarget);
  });
}
