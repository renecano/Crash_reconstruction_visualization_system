"""Aplicación FastAPI. Punto de entrada: ``uvicorn croquis_api.main:app``."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from croquis_api import __version__
from croquis_api.relato import router as relato_router
from croquis_api.settings import get_settings

LEGEND_TEXT = "Reconstrucción ilustrativa generada a partir de un relato. No es un peritaje."


class Health(BaseModel):
    status: str
    version: str
    llm_enabled: bool
    legend: str


app = FastAPI(
    title="Croquis API",
    version=__version__,
    description=(
        "Extracción de relatos, validación y reconstrucción ilustrativa de percances viales."
    ),
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
app.include_router(relato_router)


@app.get("/health", response_model=Health)
def health() -> Health:
    settings = get_settings()
    return Health(
        status="ok", version=__version__, llm_enabled=settings.llm_enabled, legend=LEGEND_TEXT
    )
