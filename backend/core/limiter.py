from slowapi import Limiter
from starlette.requests import Request


def client_ip_key(request: Request) -> str:
    # nginx (tras Cloudflare real_ip) pone la IP real del cliente en X-Real-IP y la
    # cadena en X-Forwarded-For. Sin leerlos, request.client.host es la IP del
    # contenedor nginx para TODOS -> un solo balde global compartido. Leemos el
    # header directo (como LoginRateLimitMiddleware) en vez de depender del rewrite
    # de --proxy-headers, cuya semántica varía entre versiones de uvicorn.
    xri = request.headers.get("x-real-ip")
    if xri:
        return xri.strip()
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# El default es un backstop holgado: nginx es el shaper primario por-IP (más barato,
# en el borde). Los endpoints sensibles conservan su @limiter.limit estricto, que
# gana por ser el más ajustado.
limiter = Limiter(key_func=client_ip_key, default_limits=["600/minute"])
