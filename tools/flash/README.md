# Pagina /flash — installazione firmware dal browser

Pagina statica con [ESP Web Tools](https://esphome.github.io/esp-web-tools/)
(esptool-js): l'utente collega l'ESP32-S3 via USB e installa il firmware
direttamente da Chrome/Edge, senza installare nulla.

**Requisiti**: HTTPS (GitHub Pages va bene), browser con Web Serial
(Chrome/Edge desktop; **no Safari/iOS** — per quelli c'è la OTA WiFi `/update`
sull'ESP o un computer con Chrome).

## Contenuto

| File | Provenienza |
|---|---|
| `index.html` | pagina (committata) |
| `manifest.json` | **rigenerato** da `tools/make-flash-release.sh` con la versione |
| `firmware.bin` | build PlatformIO (`.pio/build/esp32s3/`) — non committato |
| `bootloader.bin`, `partitions.bin` | build PlatformIO — non committati |
| `boot_app0.bin` | Arduino core (`~/.platformio/packages/...`) — non committato |

## Aggiornare e pubblicare

```bash
# 1. compila il firmware
cd firmware && pio run -e esp32s3 && cd ..

# 2. copia i binari + rigenera manifest.json con la versione corrente
tools/make-flash-release.sh

# 3. pubblica su branch gh-pages (la pagina vive in tools/flash/)
git subtree push --prefix tools/flash origin gh-pages
```

Poi in GitHub → Settings → Pages → branch `gh-pages`, root.
URL finale: `https://<utente>.github.io/<repo>/`.

> Nota: `git subtree push` richiede che i binari siano **committati** su
> `main` (sono gitignored): per la pubblicazione vanno aggiunti forzatamente
> o usata una worktree. Alternativa semplice: copiare `tools/flash/` in una
> cartella di lavoro separata e pusharla manualmente sul branch `gh-pages`:

```bash
git worktree add ../mk-pages gh-pages 2>/dev/null || git worktree add --orphan ../mk-pages gh-pages
cp tools/flash/* ../mk-pages/
cd ../mk-pages && git add -A && git commit -m "flash page update" && git push origin gh-pages
```

## OTA WiFi (aggiornamenti successivi)

Il firmware espone già `GET/POST /update` (multipart, campo `bin`): aprire
`http://<ip-esp>/update` e caricare `firmware.bin`. La pagina flash web serve
per la prima installazione o per il ripristino.
