#include "wifi_mgr.h"
#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <Preferences.h>
#include <DNSServer.h>
#include "config.h"

static const char* NS = "mkcfg";
static Preferences s_prefs;
static DNSServer s_dns;
static bool s_dnsOn = false;
static String s_staSsid;   // ssid in uso (NVS o compilato)
static volatile uint32_t s_rebootAt = 0; // 0 = nessun riavvio programmato

// ---------------------------------------------------------------------------

static String ap_ssid() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char buf[24];
  snprintf(buf, sizeof(buf), "%s-%02X%02X", MK_AP_BASE_SSID, mac[4], mac[5]);
  return String(buf);
}

void wifi_begin() {
  s_prefs.begin(NS, true);
  String ssid = s_prefs.getString("ssid", "");
  String pass = s_prefs.getString("pass", "");
  s_prefs.end();

  // AP sempre attivo: captive portal per la config (WPA2)
  WiFi.mode(WIFI_AP_STA);
  String apName = ap_ssid();
  WiFi.softAP(apName.c_str(), MK_AP_PASS);
  Serial.printf("[wifi] AP \"%s\" attivo, IP %s\n", apName.c_str(), WiFi.softAPIP().toString().c_str());

  s_dnsOn = s_dns.start(53, "*", WiFi.softAPIP());

  if (ssid.length() > 0) {
    s_staSsid = ssid;
    WiFi.begin(ssid.c_str(), pass.c_str());
    Serial.printf("[wifi] STA da NVS: \"%s\"\n", ssid.c_str());
  } else {
    s_staSsid = WIFI_SSID;
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    Serial.printf("[wifi] STA da config compilata: \"%s\"\n", WIFI_SSID);
  }
  WiFi.setHostname(MK_HOSTNAME);
}

void wifi_loop() {
  if (s_dnsOn) s_dns.processNextRequest();

  // riavvio programmato dopo il salvataggio delle credenziali
  if (s_rebootAt != 0 && millis() > s_rebootAt) {
    Serial.println("[wifi] riavvio per applicare le credenziali");
    delay(100);
    ESP.restart();
  }
}

bool wifi_save_credentials(const String& ssid, const String& pass) {
  if (ssid.length() == 0 || ssid.length() > 32 || pass.length() > 63) return false;
  s_prefs.begin(NS, false);
  s_prefs.putString("ssid", ssid);
  s_prefs.putString("pass", pass);
  s_prefs.end();
  return true;
}

// ---------------------------------------------------------------------------
// Portal: pagina di config + probe captive + diagnostica
// ---------------------------------------------------------------------------

static const char PORTAL_HTML[] PROGMEM = R"rawliteral(<!doctype html>
<html lang="it"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MK-Remote — Config WiFi</title>
<style>
 body{font-family:system-ui,sans-serif;background:#101216;color:#e6e8ec;
      max-width:420px;margin:0 auto;padding:24px}
 input{width:100%;box-sizing:border-box;padding:12px;border-radius:8px;
       border:1px solid #333a45;background:#1a1d23;color:#e6e8ec;font-size:1rem}
 button{width:100%;padding:14px;margin-top:14px;border:none;border-radius:10px;
        background:#4a90d9;color:#fff;font-size:1rem;font-weight:600}
 .m{color:#8b909b;font-size:.85rem}
</style></head><body>
<h1>MK-Remote</h1>
<p class="m">Configurazione WiFi: le credenziali vengono salvate sul dispositivo (NVS).</p>
<form method="POST" action="/save">
  <p>SSID<br><input name="ssid" maxlength="32" autocomplete="off" required></p>
  <p>Password<br><input name="pass" type="password" maxlength="63"></p>
  <button>Salva e riavvia</button>
</form>
</body></html>)rawliteral";

static const char SAVED_HTML[] PROGMEM = R"rawliteral(<!doctype html>
<html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MK-Remote</title></head>
<body style="font-family:system-ui;padding:24px">
<p>Credenziali salvate. Il dispositivo si riavvia tra poco…</p>
</body></html>)rawliteral";

void wifi_portal_routes(AsyncWebServer& server) {
  // pagina di configurazione
  server.on("/", HTTP_GET, [](AsyncWebServerRequest* req) {
    req->send_P(200, "text/html", PORTAL_HTML);
  });

  server.on("/save", HTTP_POST, [](AsyncWebServerRequest* req) {
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
    req->send_P(200, "text/html", SAVED_HTML);
  });

  // diagnostica rapida
  server.on("/wifi-info", HTTP_GET, [](AsyncWebServerRequest* req) {
    String s = "{\"sta_ssid\":\"" + s_staSsid + "\"";
    s += ",\"sta_connected\":" + String(WiFi.status() == WL_CONNECTED ? "true" : "false");
    s += ",\"ip\":\"" + (WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : WiFi.softAPIP().toString()) + "\"";
    s += ",\"ap_ssid\":\"" + ap_ssid() + "\"}";
    req->send(200, "application/json", s);
  });

  // probe captive portal (Android, iOS, Windows) -> reindirizza al portal
  server.on("/generate_204", HTTP_GET, [](AsyncWebServerRequest* req) {
    req->redirect(String("http://") + WiFi.softAPIP().toString() + "/");
  });
  server.on("/hotspot-detect.html", HTTP_GET, [](AsyncWebServerRequest* req) {
    req->redirect(String("http://") + WiFi.softAPIP().toString() + "/");
  });
  server.on("/connecttest.txt", HTTP_GET, [](AsyncWebServerRequest* req) {
    req->redirect(String("http://") + WiFi.softAPIP().toString() + "/");
  });
  server.on("/ncsi.txt", HTTP_GET, [](AsyncWebServerRequest* req) {
    req->redirect(String("http://") + WiFi.softAPIP().toString() + "/");
  });
  server.on("/fwlink", HTTP_GET, [](AsyncWebServerRequest* req) {
    req->redirect(String("http://") + WiFi.softAPIP().toString() + "/");
  });
}
