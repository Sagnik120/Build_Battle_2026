from fastapi import APIRouter

from app.api.v1.routes import adaption, feedback, insights, issues, reports, system

api_router = APIRouter()
for module in (system, feedback, insights, issues, reports, adaption):
    api_router.include_router(module.router)
