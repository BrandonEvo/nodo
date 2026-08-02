"""
Las cifras de plata del Personal Shopper.

Estos tests existen por un bug real: el mismo cierre reportaba tres utilidades
distintas (Q649.26 en /stats, Q1002.62 en /store/sessions, Q714.34 la correcta).
Nadie lo notó porque nada verificaba la aritmética. El caso de referencia de
abajo es una corrida real reproducida contra las filas crudas.

Son puros: no tocan la base. La aritmética del dinero no necesita Postgres para
ser correcta, y estos tests deben poder correrse sin escribirle a producción.
"""
import uuid
from datetime import datetime, timedelta
from decimal import Decimal

from api.routers.shopper_catalog import _prorate_coupons, _summarize_window


# ── Andamio mínimo: _summarize_window sólo lee estos atributos ────────────────

class _Res:
    def __init__(self, status, qty, created_at, phone="5555", rid=None, item_id=None):
        self.id = rid or uuid.uuid4()
        self.status = status
        self.quantity = qty
        self.created_at = created_at
        self.client_phone = phone
        self.catalog_item_id = item_id or uuid.uuid4()


class _Item:
    def __init__(self, title, price, cost):
        self.title = title
        self.price_gtq = Decimal(str(price))
        self.calc_total_cost_gtq = None if cost is None else Decimal(str(cost))


T0 = datetime(2026, 8, 2, 15, 42, 36)
T1 = T0 + timedelta(minutes=4)
IN_WINDOW = T0 + timedelta(minutes=1)
RATIO = Decimal("0.7")   # assumed_cost_ratio, sólo aplica si el ítem no pasó por la calculadora


def _window(rows, share=None):
    return _summarize_window(rows, T0, T1, RATIO, share or {})


# ── Prorrateo del cupón ───────────────────────────────────────────────────────

def test_prorrateo_reparte_proporcional_al_bruto():
    ot = uuid.uuid4()
    a, b = uuid.uuid4(), uuid.uuid4()
    share = _prorate_coupons(
        {ot: Decimal("234.93")},
        [(a, ot, Decimal("1478.24")), (b, ot, Decimal("871.04"))],
    )
    assert share[a] == Decimal("147.83")
    assert share[b] == Decimal("87.10")
    assert share[a] + share[b] == Decimal("234.93")   # no se pierde ni se inventa un centavo


def test_la_parte_de_la_linea_caida_no_se_reasigna_a_la_entregada():
    """El bug original: el cupón de un pedido de dos ítems se otorgó sobre AMBOS,
    pero uno no se consiguió. Cargarle el descuento entero al que sí se entregó
    hunde la ganancia por plata que nunca se regaló."""
    ot = uuid.uuid4()
    perfume, crocs = uuid.uuid4(), uuid.uuid4()
    share = _prorate_coupons(
        {ot: Decimal("118.43")},
        [(perfume, ot, Decimal("533.48")), (crocs, ot, Decimal("650.79"))],
    )
    assert share[perfume] == Decimal("53.35")
    assert share[crocs] == Decimal("65.08")
    # Si el crocs no se entrega, su parte simplemente no se suma a ningún balde:
    # lo que se imputa a lo entregado son 53.35, no los 118.43 completos.


def test_pedido_sin_cupon_no_aparece_en_el_reparto():
    assert _prorate_coupons({}, [(uuid.uuid4(), uuid.uuid4(), Decimal("100"))]) == {}


def test_pedido_de_bruto_cero_no_divide_por_cero():
    ot = uuid.uuid4()
    assert _prorate_coupons({ot: Decimal("50")}, [(uuid.uuid4(), ot, Decimal("0"))]) == {}


# ── Cifras de la ventana de venta (/store/sessions) ───────────────────────────

def test_entregado_descuenta_el_cupon_de_ingreso_y_utilidad():
    r = _Res("entregada", 1, IN_WINDOW)
    item = _Item("Airfryer", "1478.24", "1094.99")
    out = _window([(r, item)], {r.id: Decimal("147.83")})

    assert out["delivered_revenue_gtq"] == 1330.41    # 1478.24 - 147.83
    assert out["delivered_profit_gtq"] == 235.42      # (1478.24 - 1094.99) - 147.83
    assert out["delivered_coupon_gtq"] == 147.83


def test_sin_cupon_la_utilidad_es_precio_menos_costo():
    r = _Res("entregada", 2, IN_WINDOW)
    out = _window([(r, _Item("Stanley", "492.25", "364.63"))])

    assert out["delivered_revenue_gtq"] == 984.50
    assert out["delivered_profit_gtq"] == 255.24
    assert out["delivered_coupon_gtq"] == 0.0


def test_lo_apartado_no_entregado_no_cuenta_como_plata_cobrada():
    """revenue_gtq es lo apartado (bruto, aún puede evaporarse); delivered_* es lo
    que de verdad se cobró. Mezclarlos es la mentira que /stats vino a matar."""
    r = _Res("confirmada", 1, IN_WINDOW)
    out = _window([(r, _Item("Lego", "1192.64", "883.43"))])

    assert out["revenue_gtq"] == 1192.64
    assert out["delivered_revenue_gtq"] == 0.0
    assert out["delivered_profit_gtq"] == 0.0


def test_canceladas_y_no_disponibles_no_suman_ingreso():
    rows = [
        (_Res("cancelada", 1, IN_WINDOW), _Item("Instant Pot", "1554.54", "1151.51")),
        (_Res("no_disponible", 1, IN_WINDOW), _Item("Crocs", "650.79", "482.06")),
    ]
    out = _window(rows)
    assert out["revenue_gtq"] == 0.0
    assert out["cancelled_lines"] == 2
    assert out["units"] == 0


def test_reserva_fuera_de_la_ventana_se_ignora():
    fuera = _Res("entregada", 1, T1 + timedelta(hours=3))
    assert _window([(fuera, _Item("Echo", "605", "448.15"))])["units"] == 0


def test_item_sin_calculadora_cae_al_costo_asumido():
    r = _Res("entregada", 1, IN_WINDOW)
    out = _window([(r, _Item("Manual", "100", None))])
    assert out["delivered_profit_gtq"] == 30.0        # 100 - (100 * 0.7)


# ── El cierre completo: la corrida real que destapó el bug ────────────────────

def test_cierre_real_reconcilia_con_la_auditoria():
    """Venta relámpago del 2026-08-02, 5 clientes / 8 líneas.
    Verificado a mano contra las filas crudas: la utilidad es Q714.34."""
    maria_a, maria_b = uuid.uuid4(), uuid.uuid4()
    andrea_perf = uuid.uuid4()

    rows = [
        # María: cupón de 234.93 sobre sus dos líneas, ambas entregadas
        (_Res("entregada", 1, IN_WINDOW, "5551", maria_a), _Item("Airfryer", "1478.24", "1094.99")),
        (_Res("entregada", 2, IN_WINDOW, "5551", maria_b), _Item("Velas", "435.52", "322.61")),
        # Josué: sin cupón
        (_Res("entregada", 2, IN_WINDOW, "5552"), _Item("Stanley", "492.25", "364.63")),
        # Andrea: cupón de 118.43 sobre perfume + crocs; el crocs no se consiguió
        (_Res("entregada", 1, IN_WINDOW, "5553", andrea_perf), _Item("Perfume", "533.48", "395.17")),
        (_Res("no_disponible", 1, IN_WINDOW, "5553"), _Item("Crocs", "650.79", "482.06")),
        # En vuelo y caídas
        (_Res("en_camino", 1, IN_WINDOW, "5554"), _Item("Lego", "1192.64", "883.43")),
        (_Res("comprada", 1, IN_WINDOW, "5555"), _Item("Echo", "605", "448.15")),
        (_Res("cancelada", 1, IN_WINDOW, "5555"), _Item("Instant Pot", "1554.54", "1151.51")),
    ]
    share = {
        maria_a: Decimal("147.83"), maria_b: Decimal("87.10"),   # 234.93
        andrea_perf: Decimal("53.35"),                           # de 118.43; 65.08 muere con el crocs
    }
    out = _window(rows, share)

    assert out["delivered_units"] == 6
    assert out["delivered_coupon_gtq"] == 288.28        # NO 353.36: el crocs no se entregó
    assert out["delivered_revenue_gtq"] == 3578.98      # 3867.26 bruto - 288.28
    assert out["delivered_profit_gtq"] == 714.34        # ni 1002.62 (ignora cupón) ni 649.26
    assert out["clients"] == 5
    assert out["cancelled_lines"] == 2
