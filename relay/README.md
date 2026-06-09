# Relay residencial de scraping de Amazon

Amazon bloquea la IP del servidor de producción (datacenter) con páginas anti-bot.
Este relay corre en **tu PC / una conexión residencial** y hace el fetch a Amazon
desde ahí; el backend de producción le reenvía los pedidos por un túnel.

```
hellonodo.com (servidor)  ──reenvía POST /scrape──▶  Cloudflare Tunnel  ──▶  relay.py (tu casa)  ──▶  Amazon ✅
```

El relay solo acepta pedidos con el header `X-Relay-Token` correcto (el mismo
`RELAY_TOKEN` que está en el `.env` del servidor).

---

## 1. Correr el relay (en tu PC)

Requisitos: Python 3.10+.

```bash
cd relay
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# El token DEBE ser el mismo que AMAZON_RELAY_TOKEN del .env del servidor:
export RELAY_TOKEN=<el-mismo-valor-que-AMAZON_RELAY_TOKEN-en-el-.env-del-server>   # Windows: set RELAY_TOKEN=...
python relay.py
```

Debe imprimir: `Nodo Amazon Relay escuchando en http://0.0.0.0:8799`.
Probalo local en otra terminal:

```bash
curl -s -X POST http://localhost:8799/scrape \
  -H "Content-Type: application/json" -H "X-Relay-Token: $RELAY_TOKEN" \
  -d '{"url":"https://www.amazon.com/dp/B08N5WRWNW"}'
```

Si te devuelve `{"asin": ..., "name": ..., "price_usd": ...}` → tu IP residencial
funciona. (Si da 503 anti-bot, tu IP también está flageada; probá desde otra red.)

---

## 2. Exponerlo con Cloudflare Tunnel (gratis, sin abrir puertos)

Instalá `cloudflared`: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

### Opción A — Túnel rápido (para probar ya, URL temporal)

```bash
cloudflared tunnel --url http://localhost:8799
```

Te imprime una URL tipo `https://algo-random.trycloudflare.com`. **Esa es tu
`AMAZON_RELAY_URL`.** (Ojo: cambia cada vez que reiniciás cloudflared.)

### Opción B — Túnel con nombre fijo (recomendado para producción)

Usa tu cuenta de Cloudflare (ya tenés hellonodo.com) para un hostname estable
tipo `relay.hellonodo.com`:

```bash
cloudflared tunnel login
cloudflared tunnel create nodo-relay
cloudflared tunnel route dns nodo-relay relay.hellonodo.com
# Crear ~/.cloudflared/config.yml apuntando el tunnel a http://localhost:8799, luego:
cloudflared tunnel run nodo-relay
```

Tu `AMAZON_RELAY_URL` será `https://relay.hellonodo.com`.

---

## 3. Conectarlo al servidor

En el `.env` del servidor, completá:

```
AMAZON_RELAY_URL=https://relay.hellonodo.com      # (o la URL trycloudflare)
AMAZON_RELAY_TOKEN=<el-mismo-token-que-usaste-en-RELAY_TOKEN-arriba>
```

y recreá el backend:

```bash
sg docker -c 'docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d'
```

Listo: cuando `AMAZON_RELAY_URL` está seteada, el backend reenvía el scraping al
relay. Si el relay no responde, cae automáticamente al scraping directo (best-effort).

> **Mantenelo prendido:** el scraping de Amazon solo funciona mientras el relay y
> el túnel estén corriendo en tu PC. Para que ande siempre, dejalo como servicio
> (systemd / Task Scheduler) o en una máquina residencial encendida.
