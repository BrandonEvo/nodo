#!/usr/bin/env python3
"""Smoke test de autenticación — verifica que AMBOS ingresos funcionen.

No requiere dependencias (solo stdlib). Prueba el stack en vivo tal como lo
usa el navegador desde afuera:

  1. Frontend sirve (GET /)
  2. Registro local      -> POST /api/auth/register-workspace
  3. Login local         -> POST /api/auth/cookie-login (cookies httpOnly)
  4. Sesión              -> GET  /api/auth/session
  5. Usuario             -> GET  /api/users/me
  6. Módulos (dashboard) -> GET  /api/tenant-modules/my-modules
  7. Login Google        -> GET  /api/auth/google/login (redirect a Google OK)

Uso:
    python3 scripts/smoke_test_auth.py
    BASE_URL=http://35.208.20.242.nip.io python3 scripts/smoke_test_auth.py
"""
import os
import sys
import json
import time
import uuid
import urllib.request
import urllib.error
import urllib.parse
from http.cookiejar import CookieJar

BASE_URL = os.getenv("BASE_URL", "http://localhost").rstrip("/")

jar = CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

PASS, FAIL = 0, 0


def _check(name, ok, detail=""):
    global PASS, FAIL
    mark = "\033[92mPASS\033[0m" if ok else "\033[91mFAIL\033[0m"
    print(f"  [{mark}] {name}" + (f"  — {detail}" if detail else ""))
    if ok:
        PASS += 1
    else:
        FAIL += 1
    return ok


def _req(method, path, *, data=None, json_body=None, headers=None, follow=True):
    url = BASE_URL + path
    h = {"Accept": "application/json", **(headers or {})}
    body = None
    if json_body is not None:
        body = json.dumps(json_body).encode()
        h["Content-Type"] = "application/json"
    elif data is not None:
        body = urllib.parse.urlencode(data).encode()
        h["Content-Type"] = "application/x-www-form-urlencoded"
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    t0 = time.time()
    try:
        resp = (opener if follow else _no_redirect_opener).open(req, timeout=130)
        return resp.status, resp.read(), resp.headers, time.time() - t0
    except urllib.error.HTTPError as e:
        # e.headers es un HTTPMessage: .get() es case-insensitive (Location/location)
        return e.code, e.read(), e.headers, time.time() - t0


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None  # convierte 30x en HTTPError para capturar el Location


_no_redirect_opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(jar), _NoRedirect
)


def main():
    print(f"\n== Smoke test de autenticación contra {BASE_URL} ==\n")
    email = f"smoke_{uuid.uuid4().hex[:12]}@example.com"
    password = "Test1234"

    # 1. Frontend
    st, _, _, dt = _req("GET", "/")
    _check("Frontend responde", st == 200, f"HTTP {st} ({dt:.2f}s)")

    # 2. Registro local
    st, body, _, dt = _req("POST", "/api/auth/register-workspace",
                           json_body={"tenant_name": "Smoke", "email": email, "password": password})
    _check("Registro local (register-workspace)", st == 201, f"HTTP {st} ({dt:.2f}s)")

    # 3. Login local
    st, body, _, dt = _req("POST", "/api/auth/cookie-login",
                           data={"username": email, "password": password})
    cookies = {c.name for c in jar}
    _check("Login local (cookie-login)", st == 200, f"HTTP {st} ({dt:.2f}s)")
    _check("Cookies de sesión presentes",
           {"access_token", "refresh_token"} <= cookies,
           f"cookies={sorted(cookies)}")

    # 4. Sesión
    st, body, _, dt = _req("GET", "/api/auth/session")
    tenant_id = ""
    if st == 200:
        try:
            tenant_id = json.loads(body).get("tenant_id", "")
        except Exception:
            pass
    _check("Sesión activa (/auth/session)", st == 200 and bool(tenant_id),
           f"HTTP {st} tenant_id={tenant_id[:8]}… ({dt:.2f}s)")

    # 5. Usuario
    st, _, _, dt = _req("GET", "/api/users/me")
    _check("Perfil de usuario (/users/me)", st == 200, f"HTTP {st} ({dt:.2f}s)")

    # 6. Módulos del dashboard
    st, body, _, dt = _req("GET", "/api/tenant-modules/my-modules",
                           headers={"X-Tenant-Id": tenant_id})
    _check("Módulos del dashboard (/tenant-modules/my-modules)", st == 200,
           f"HTTP {st} ({dt:.2f}s)")

    # 7. Login Google — debe redirigir a Google con redirect_uri público válido
    st, _, hdrs, dt = _req("GET", "/api/auth/google/login", follow=False)
    loc = hdrs.get("Location", "")
    parsed = urllib.parse.urlparse(loc)
    qs = urllib.parse.parse_qs(parsed.query)
    redirect_uri = qs.get("redirect_uri", [""])[0]
    _check("Login Google redirige a Google", st in (301, 302, 303, 307) and parsed.netloc == "accounts.google.com",
           f"HTTP {st} -> {parsed.netloc} ({dt:.2f}s)")
    _check("redirect_uri público (no localhost)",
           redirect_uri.endswith("/api/auth/google/callback") and "localhost" not in redirect_uri,
           redirect_uri)

    print(f"\n== Resultado: {PASS} PASS, {FAIL} FAIL ==")
    if FAIL == 0:
        print("Ambos ingresos están correctamente cableados. ✅")
        print("Nota Google: además, el redirect_uri de arriba debe estar registrado")
        print("en Google Cloud Console > Credenciales > URIs de redireccionamiento.\n")
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
