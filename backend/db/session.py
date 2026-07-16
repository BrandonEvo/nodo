from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from core.config import settings

# 1. Configuración del Motor Asíncrono
# echo controlado por SQL_ECHO (off por defecto): en este VM el logging por
# sentencia añade latencia perceptible en cada request.
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.SQL_ECHO,
    future=True,
    pool_size=10,          # por worker: conexiones persistentes en memoria
    max_overflow=15,       # por worker -> 2 workers = 50 conex. máx (< max_connections 100)
    pool_timeout=10,       # falla rápido si el pool se agota, no cuelga el request
    pool_pre_ping=True,    # descarta conexiones muertas tras un restart/blip de Postgres
)

# 2. Fábrica de Sesiones
# expire_on_commit=False es OBLIGATORIO en asincronía para evitar lecturas IO bloqueantes
async_session_maker = sessionmaker(
    bind=engine, 
    class_=AsyncSession, 
    expire_on_commit=False
)

# 3. Dependencia de Inyección para FastAPI
async def get_session() -> AsyncSession:
    """
    Generador asíncrono. Asegura que la conexión a la BD se abra al iniciar 
    la petición HTTP y se cierre limpiamente (o haga rollback) al finalizar.
    """
    async with async_session_maker() as session:
        yield session