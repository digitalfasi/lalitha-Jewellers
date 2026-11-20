from fastapi import APIRouter, Depends

from app._shared.health.router import router as health_router
from app.modules.audit.router import router as audit_router
from app.modules.auth.deps import current_user
from app.modules.auth.router import router as auth_router
from app.modules.billing.router import router as billing_router
from app.modules.business.router import router as business_router
from app.modules.calc.router import router as calc_router
from app.modules.combos.router import router as combos_router
from app.modules.inventory.router import router as inventory_router
from app.modules.rates.router import router as rates_router
from app.modules.tags.router import router as tags_router

api_router = APIRouter()

# Open: health check, and sign-in / first-time setup (auth guards its own private routes).
api_router.include_router(health_router)
api_router.include_router(auth_router)

# Everything else needs a signed-in, active staff member. Routes that need a
# higher role (manager / owner) add require_role on top.
signed_in = [Depends(current_user)]
for r in (inventory_router, combos_router, tags_router, billing_router, rates_router, business_router, audit_router,
          calc_router):
    api_router.include_router(r, dependencies=signed_in)
