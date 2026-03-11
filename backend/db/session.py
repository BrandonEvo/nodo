from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from core.config import settings

# 1. Configuración del Motor Asíncrono
# echo=True imprime las sentencias SQL en consola solo si estamos en desarrollo
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=(settings.ENVIRONMENT == "development"),
    future=True,
    pool_size=10,        # Conexiones persistentes mantenidas en memoria
    max_overflow=20      # Conexiones extra permitidas bajo picos de tráfico
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