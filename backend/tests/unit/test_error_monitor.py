"""
Agrupación de errores. Puros, no tocan la base.

Lo que se prueba acá es que el panel no se vuelva inútil por ruido: si cada
request fallido genera una fila distinta, un endpoint que se pollea entierra el
bug real bajo mil copias de sí mismo.
"""
from api.routers.system import ErrorEventRead  # noqa: F401  (valida que el schema importe)
from api.services.error_monitor import _fingerprint, _normalize_path


def _tb(file_line: str) -> str:
    return f'Traceback (most recent call last):\n  File "{file_line}", line 1, in x\n'


def test_el_mismo_bug_en_la_misma_ruta_comparte_firma():
    a = _fingerprint(ValueError("user 3f2a no encontrado"), "/api/x", "GET", _tb("/app/x.py"))
    b = _fingerprint(ValueError("user 9b1c no encontrado"), "/api/x", "GET", _tb("/app/x.py"))
    assert a == b, "el id del usuario no debe partir el mismo bug en dos"


def test_distinto_tipo_de_error_no_se_mezcla():
    tb = _tb("/app/x.py")
    assert _fingerprint(ValueError("x"), "/api/x", "GET", tb) != \
           _fingerprint(KeyError("x"), "/api/x", "GET", tb)


def test_distinta_ruta_no_se_mezcla():
    tb = _tb("/app/x.py")
    assert _fingerprint(ValueError("x"), "/api/a", "GET", tb) != \
           _fingerprint(ValueError("x"), "/api/b", "GET", tb)


def test_distinto_origen_en_el_codigo_no_se_mezcla():
    """Mismo tipo y misma ruta, pero reventando en otro archivo: son dos bugs."""
    assert _fingerprint(ValueError("x"), "/api/x", "GET", _tb("/app/a.py")) != \
           _fingerprint(ValueError("x"), "/api/x", "GET", _tb("/app/b.py"))


def test_la_firma_entra_en_la_columna():
    fp = _fingerprint(ValueError("x"), "/api/x", "GET", _tb("/app/x.py"))
    assert len(fp) <= 64


def test_los_uuid_de_la_ruta_se_colapsan():
    a = _normalize_path("/api/shopper-catalog/676be0a6-ef67-4be7-9a5e-39de25812a61/pulse")
    b = _normalize_path("/api/shopper-catalog/11111111-2222-4333-8444-555555555555/pulse")
    assert a == b == "/api/shopper-catalog/{id}/pulse"


def test_los_numeros_de_la_ruta_se_colapsan():
    assert _normalize_path("/api/x/42") == _normalize_path("/api/x/7") == "/api/x/{n}"


def test_la_ruta_se_recorta_a_la_columna():
    assert len(_normalize_path("/api/" + "a" * 900)) <= 500
