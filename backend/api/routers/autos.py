"""
MÓDULO: AUTOS — Calculadora de Importación de Vehículos USA → Guatemala
- POST /api/autos/calcular → Desglose completo de costos
- GET  /api/autos/estados  → Lista de estados USA disponibles
"""
from fastapi import APIRouter, Depends, HTTPException
from models import User
from api.deps import current_active_user
from models.schemas import (
    AutosCalculoInput, AutosCalculoResult,
    AutosCostoVehiculo, AutosCostoImportacion,
    AutosImpuestosGT, AutosCostoReparacion,
)

router = APIRouter(tags=["Autos (Importación de Vehículos)"])

# ── Constantes del negocio ────────────────────────────────────────────────────

COMISION_BANCARIA_VEHICULO_USD  = 40.0   # cargo fijo por transferencia de compra
COMISION_BANCARIA_LOGISTICA_USD = 40.0   # cargo fijo por transferencia de logística
COMISION_TRANSF_PCT             = 0.04   # 4% sobre grúa y barco (fee de transacción)
STORAGE_USD                     = 200.0  # almacenaje en puerto USA (fijo)

DEFAULT_TC          = 8.0       # Q/USD
DEFAULT_TRAMITE_GTQ = 1650.0    # trámite aduanero Guatemala
DEFAULT_SAT_PCT     = 0.32      # % impuestos SAT sobre costo vehículo GTQ

# Costos fijos Guatemala (placas, agencia, etc.)
TACUACINA_GTQ           = 875.0
PRIMERAS_PLACAS_GTQ     = 950.0
CALCOMANIA_GTQ          = 650.0
FACTURACION_GTQ         = 200.0
INSUMOS_GTQ             = 100.0
CONTADOR_GTQ            = 125.0
GRUA_LOCAL_GTQ          = 275.0

SIZE_SURCHARGES: dict[str, dict[str, float]] = {
    "normal":  {"grua": 0.0,   "barco": 0.0},
    "mediano": {"grua": 100.0, "barco": 150.0},
    "grande":  {"grua": 200.0, "barco": 300.0},
}

# ── Matriz de estados USA ─────────────────────────────────────────────────────
# Formato: code → {label, grua_usd, barco_usd, puerto}
# grua_usd  = transporte desde origen hasta puerto de exportación
# barco_usd = flete marítimo puerto USA → Guatemala

STATE_MATRIX: dict[str, dict] = {
    # ── Puerto Houston, TX ── barco base $925 ───────────────────────────────
    "TX": {"label": "Texas",          "grua": 150.0, "barco": 925.0, "puerto": "Houston"},
    "LA": {"label": "Louisiana",      "grua": 175.0, "barco": 925.0, "puerto": "Houston"},
    "OK": {"label": "Oklahoma",       "grua": 225.0, "barco": 925.0, "puerto": "Houston"},
    "AR": {"label": "Arkansas",       "grua": 250.0, "barco": 925.0, "puerto": "Houston"},
    "MS": {"label": "Mississippi",    "grua": 225.0, "barco": 925.0, "puerto": "Houston"},
    "AL": {"label": "Alabama",        "grua": 275.0, "barco": 925.0, "puerto": "Houston"},
    "TN": {"label": "Tennessee",      "grua": 325.0, "barco": 925.0, "puerto": "Houston"},
    "KY": {"label": "Kentucky",       "grua": 375.0, "barco": 925.0, "puerto": "Houston"},
    "MO": {"label": "Missouri",       "grua": 350.0, "barco": 925.0, "puerto": "Houston"},
    "KS": {"label": "Kansas",         "grua": 375.0, "barco": 925.0, "puerto": "Houston"},
    "IL": {"label": "Illinois",       "grua": 425.0, "barco": 925.0, "puerto": "Houston"},
    "IN": {"label": "Indiana",        "grua": 400.0, "barco": 925.0, "puerto": "Houston"},
    "WI": {"label": "Wisconsin",      "grua": 475.0, "barco": 925.0, "puerto": "Houston"},
    "MN": {"label": "Minnesota",      "grua": 500.0, "barco": 925.0, "puerto": "Houston"},
    "IA": {"label": "Iowa",           "grua": 450.0, "barco": 925.0, "puerto": "Houston"},
    "NE": {"label": "Nebraska",       "grua": 450.0, "barco": 925.0, "puerto": "Houston"},
    "ND": {"label": "North Dakota",   "grua": 550.0, "barco": 925.0, "puerto": "Houston"},
    "SD": {"label": "South Dakota",   "grua": 525.0, "barco": 925.0, "puerto": "Houston"},
    # ── Puerto Miami, FL ── barco base $875 ────────────────────────────────
    "FL": {"label": "Florida",        "grua": 175.0, "barco": 875.0, "puerto": "Miami"},
    "GA": {"label": "Georgia",        "grua": 250.0, "barco": 875.0, "puerto": "Miami"},
    "SC": {"label": "South Carolina", "grua": 275.0, "barco": 875.0, "puerto": "Miami"},
    "NC": {"label": "North Carolina", "grua": 325.0, "barco": 875.0, "puerto": "Miami"},
    "VA": {"label": "Virginia",       "grua": 375.0, "barco": 875.0, "puerto": "Miami"},
    "WV": {"label": "West Virginia",  "grua": 375.0, "barco": 875.0, "puerto": "Miami"},
    "MD": {"label": "Maryland",       "grua": 400.0, "barco": 875.0, "puerto": "Miami"},
    "DC": {"label": "Washington D.C.","grua": 400.0, "barco": 875.0, "puerto": "Miami"},
    "DE": {"label": "Delaware",       "grua": 400.0, "barco": 875.0, "puerto": "Miami"},
    "PA": {"label": "Pennsylvania",   "grua": 425.0, "barco": 875.0, "puerto": "Miami"},
    "NJ": {"label": "New Jersey",     "grua": 440.0, "barco": 875.0, "puerto": "Miami"},
    "NY": {"label": "New York",       "grua": 450.0, "barco": 875.0, "puerto": "Miami"},
    "CT": {"label": "Connecticut",    "grua": 460.0, "barco": 875.0, "puerto": "Miami"},
    "RI": {"label": "Rhode Island",   "grua": 465.0, "barco": 875.0, "puerto": "Miami"},
    "MA": {"label": "Massachusetts",  "grua": 475.0, "barco": 875.0, "puerto": "Miami"},
    "NH": {"label": "New Hampshire",  "grua": 490.0, "barco": 875.0, "puerto": "Miami"},
    "VT": {"label": "Vermont",        "grua": 500.0, "barco": 875.0, "puerto": "Miami"},
    "ME": {"label": "Maine",          "grua": 515.0, "barco": 875.0, "puerto": "Miami"},
    "OH": {"label": "Ohio",           "grua": 400.0, "barco": 875.0, "puerto": "Miami"},
    "MI": {"label": "Michigan",       "grua": 425.0, "barco": 875.0, "puerto": "Miami"},
    # ── Puerto Los Ángeles, CA ── barco base $1,350 ─────────────────────────
    "CA": {"label": "California",     "grua": 175.0, "barco": 1350.0, "puerto": "Los Ángeles"},
    "NV": {"label": "Nevada",         "grua": 200.0, "barco": 1350.0, "puerto": "Los Ángeles"},
    "AZ": {"label": "Arizona",        "grua": 225.0, "barco": 1350.0, "puerto": "Los Ángeles"},
    "OR": {"label": "Oregon",         "grua": 275.0, "barco": 1350.0, "puerto": "Los Ángeles"},
    "WA": {"label": "Washington",     "grua": 325.0, "barco": 1350.0, "puerto": "Los Ángeles"},
    "ID": {"label": "Idaho",          "grua": 300.0, "barco": 1350.0, "puerto": "Los Ángeles"},
    "UT": {"label": "Utah",           "grua": 275.0, "barco": 1350.0, "puerto": "Los Ángeles"},
    "CO": {"label": "Colorado",       "grua": 325.0, "barco": 1350.0, "puerto": "Los Ángeles"},
    "NM": {"label": "New Mexico",     "grua": 250.0, "barco": 1350.0, "puerto": "Los Ángeles"},
    "MT": {"label": "Montana",        "grua": 400.0, "barco": 1350.0, "puerto": "Los Ángeles"},
    "WY": {"label": "Wyoming",        "grua": 375.0, "barco": 1350.0, "puerto": "Los Ángeles"},
    "AK": {"label": "Alaska",         "grua": 600.0, "barco": 1350.0, "puerto": "Los Ángeles"},
    "HI": {"label": "Hawaii",         "grua": 500.0, "barco": 1350.0, "puerto": "Los Ángeles"},
}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/estados")
async def listar_estados(_user: User = Depends(current_active_user)):
    """Lista todos los estados USA con su puerto y costo base de grúa."""
    return [
        {
            "code":   code,
            "label":  data["label"],
            "puerto": data["puerto"],
            "grua_base_usd": data["grua"],
            "barco_base_usd": data["barco"],
        }
        for code, data in STATE_MATRIX.items()
    ]


@router.post("/calcular", response_model=AutosCalculoResult)
async def calcular_importacion(
    body: AutosCalculoInput,
    _user: User = Depends(current_active_user),
):
    """Calcula el costo total de importar un vehículo desde USA a Guatemala."""
    state = STATE_MATRIX.get(body.state_code.upper())
    if not state:
        raise HTTPException(status_code=400, detail=f"Estado no reconocido: {body.state_code}")

    tc      = body.tipo_cambio          if body.tipo_cambio          else DEFAULT_TC
    tramite = body.tramite_aduanero_gtq if body.tramite_aduanero_gtq else DEFAULT_TRAMITE_GTQ
    sat_pct = body.porcentaje_sat       if body.porcentaje_sat       else DEFAULT_SAT_PCT
    surcharge = SIZE_SURCHARGES.get(body.vehicle_size, SIZE_SURCHARGES["normal"])

    # ── Costo Vehículo ────────────────────────────────────────────────────────
    cr_usd      = max(0.0, body.costo_real_usd)
    com_veh_usd = COMISION_BANCARIA_VEHICULO_USD
    total_veh_usd = cr_usd + com_veh_usd

    costo_vehiculo = AutosCostoVehiculo(
        costo_real_usd          = round(cr_usd, 2),
        costo_real_gtq          = round(cr_usd * tc, 2),
        comision_bancaria_usd   = com_veh_usd,
        comision_bancaria_gtq   = round(com_veh_usd * tc, 2),
        total_usd               = round(total_veh_usd, 2),
        total_gtq               = round(total_veh_usd * tc, 2),
    )

    # ── Costo Importación ─────────────────────────────────────────────────────
    grua_usd       = state["grua"] + surcharge["grua"]
    com_grua_usd   = round(grua_usd * COMISION_TRANSF_PCT, 2)
    barco_usd      = state["barco"] + surcharge["barco"]
    com_barco_usd  = round(barco_usd * COMISION_TRANSF_PCT, 2)
    storage_usd    = STORAGE_USD
    com_log_usd    = COMISION_BANCARIA_LOGISTICA_USD
    total_imp_usd  = grua_usd + com_grua_usd + barco_usd + com_barco_usd + storage_usd + com_log_usd

    costo_importacion = AutosCostoImportacion(
        grua_usd                        = grua_usd,
        grua_gtq                        = round(grua_usd * tc, 2),
        comision_grua_usd               = com_grua_usd,
        comision_grua_gtq               = round(com_grua_usd * tc, 2),
        barco_usd                       = barco_usd,
        barco_gtq                       = round(barco_usd * tc, 2),
        comision_barco_usd              = com_barco_usd,
        comision_barco_gtq              = round(com_barco_usd * tc, 2),
        storage_usd                     = storage_usd,
        storage_gtq                     = round(storage_usd * tc, 2),
        comision_bancaria_logistica_usd = com_log_usd,
        comision_bancaria_logistica_gtq = round(com_log_usd * tc, 2),
        total_usd                       = round(total_imp_usd, 2),
        total_gtq                       = round(total_imp_usd * tc, 2),
        puerto                          = state["puerto"],
    )

    # ── Impuestos Guatemala ───────────────────────────────────────────────────
    imp_sat_gtq = round(costo_vehiculo.total_gtq * sat_pct, 2)
    total_gt_gtq = round(
        imp_sat_gtq + tramite + TACUACINA_GTQ + PRIMERAS_PLACAS_GTQ +
        CALCOMANIA_GTQ + FACTURACION_GTQ + INSUMOS_GTQ + CONTADOR_GTQ + GRUA_LOCAL_GTQ, 2
    )

    impuestos = AutosImpuestosGT(
        impuestos_sat_gtq           = imp_sat_gtq,
        tramite_aduanero_gtq        = tramite,
        tacuacina_gtq               = TACUACINA_GTQ,
        primeras_placas_gtq         = PRIMERAS_PLACAS_GTQ,
        calcomania_gtq              = CALCOMANIA_GTQ,
        facturacion_legalizacion_gtq= FACTURACION_GTQ,
        insumos_gasolina_gtq        = INSUMOS_GTQ,
        contador_gtq                = CONTADOR_GTQ,
        grua_local_gtq              = GRUA_LOCAL_GTQ,
        total_gtq                   = total_gt_gtq,
    )

    # ── Costo Reparación ──────────────────────────────────────────────────────
    rep_total = round(
        body.rep_llave + body.rep_repuestos + body.rep_pintura +
        body.rep_mano_obra + body.rep_otros, 2
    )

    reparacion = AutosCostoReparacion(
        llave_gtq     = body.rep_llave,
        repuestos_gtq = body.rep_repuestos,
        pintura_gtq   = body.rep_pintura,
        mano_obra_gtq = body.rep_mano_obra,
        otros_gtq     = body.rep_otros,
        total_gtq     = rep_total,
    )

    # ── Totales finales ───────────────────────────────────────────────────────
    costo_final = round(
        costo_vehiculo.total_gtq + costo_importacion.total_gtq +
        impuestos.total_gtq + reparacion.total_gtq, 2
    )
    utilidad = round(body.precio_venta_gtq - costo_final, 2)

    return AutosCalculoResult(
        state_label             = state["label"],
        puerto                  = state["puerto"],
        tipo_cambio             = tc,
        tramite_aduanero_gtq    = tramite,
        porcentaje_sat          = sat_pct,
        costo_vehiculo          = costo_vehiculo,
        costo_importacion       = costo_importacion,
        impuestos_guatemala     = impuestos,
        costo_reparacion        = reparacion,
        costo_final_gtq         = costo_final,
        precio_venta_gtq        = body.precio_venta_gtq,
        utilidad_gtq            = utilidad,
    )
