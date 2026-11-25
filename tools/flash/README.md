# Pagina /flash — installazione firmware dal browser

Pagina statica con [ESP Web Tools](https://esphome.github.io/esp-web-tools/)
(esptool-js): l'utente collega l'ESP32-S3 via USB e installa il firmware
direttamente da Chrome/Edge, senza installare nulla.

**Requisiti**: HTTPS (Web Serial funziona solo su secure context), browser con
Web Serial (Chrome/Edge desktop; **no Safari/iOS** — per quelli c'è la OTA WiFi
`/update` sull'ESP o un computer con Chrome).

**Host**: la pagina va
pubblicata su un qualsiasi host statico HTTPS. Opzioni in ordine di semplicità:

1. **Reverse proxy HTTPS** (es. nginx/caddy): servire la cartella
   `tools/flash/` come static root. Se il dominio è pubblico e gestito via
   DNS, Let's Encrypt dà il certificato gratis; in alternativa un certificato
   della CA interna fidata dal browser.
2. **GitHub Pages / static Pages**: deploy su
   branch `pages`), vale la procedura del worktree qui sotto con quel branch.
3. Qualsiasi hosting statico (anche GitHub Pages, se in futuro).

## Contenuto

| File | Provenienza |
|---|---|
| `index.html` | pagina (committata) |
| `manifest.json` | **rigenerato** da `tools/make-flash-release.sh` con la versione |
| `firmware.bin` | build PlatformIO (`.pio/build/esp32s3/`) — non committato |
| `bootloader.bin`, `partitions.bin` | build PlatformIO — non committati |
| `boot_app0.bin` | Arduino core (`~/.platformio/packages/...`) — non committato |

## Aggiornare i binari

```bash
# 1. compila il firmware
cd firmware && pio run -e esp32s3 && cd ..

# 2. copia i binari + rigenera manifest.json con la versione corrente
tools/make-flash-release.sh
```

## Pubblicare (reverse proxy statico)

```bash
# sincronizza la cartella sul server che la serve in HTTPS
rsync -av tools/flash/ server:/var/www/pocket-hid/flash/
```

## Pubblicare (branch `pages`, se l'istanza lo supporta)

I binari sono gitignored su `main`: per il branch di pubblicazione usare una
worktree e aggiungerli lì:

```bash
git worktree add ../mk-pages pages 2>/dev/null || git worktree add --orphan ../mk-pages pages
cp tools/flash/* ../mk-pages/
cd ../mk-pages && git add -A && git commit -m "flash page update" && git push origin pages
```

## OTA WiFi (aggiornamenti successivi)

Il firmware espone già `GET/POST /update` (multipart, campo `bin`): aprire
`http://<ip-esp>/update` e caricare `firmware.bin`. La pagina flash web serve
per la prima installazione o per il ripristino.
