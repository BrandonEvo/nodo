import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select, update
from pydantic import BaseModel

from db.session import get_session
from models import SubscriptionPlan, PlanModule
from models.schemas import SubscriptionPlanRead, SubscriptionPlanCreate, SubscriptionPlanUpdate
from api.deps import fastapi_users

current_superuser = fastapi_users.current_user(active=True, superuser=True)

router = APIRouter(tags=["SaaS Subscription Plans"])

@router.get("/", response_model=List[SubscriptionPlanRead])
async def list_plans(session: AsyncSession = Depends(get_session), _user=Depends(current_superuser)):
    query = select(SubscriptionPlan)
    result = await session.execute(query)
    plans = result.scalars().all()

    response = []
    for plan in plans:
        mod_query = select(PlanModule).where(PlanModule.plan_id == plan.id)
        mod_result = await session.execute(mod_query)
        modules = mod_result.scalars().all()
        response.append(SubscriptionPlanRead(
            id=plan.id,
            name=plan.name,
            price=plan.price,
            currency=plan.currency,
            is_active=plan.is_active,
            module_ids=[m.module_id for m in modules]
        ))
    return response

@router.post("/", response_model=SubscriptionPlanRead, status_code=status.HTTP_201_CREATED)
async def create_plan(plan_in: SubscriptionPlanCreate, session: AsyncSession = Depends(get_session), _user=Depends(current_superuser)):
    new_plan = SubscriptionPlan(
        name=plan_in.name,
        price=plan_in.price,
        currency=plan_in.currency,
        is_active=True
    )
    session.add(new_plan)
    await session.commit()
    await session.refresh(new_plan)

    for mod_id in plan_in.module_ids:
        pm = PlanModule(plan_id=new_plan.id, module_id=mod_id)
        session.add(pm)
    await session.commit()

    return SubscriptionPlanRead(
        id=new_plan.id,
        name=new_plan.name,
        price=new_plan.price,
        currency=new_plan.currency,
        is_active=new_plan.is_active,
        module_ids=plan_in.module_ids
    )

@router.put("/{plan_id}", response_model=SubscriptionPlanRead)
async def update_plan(plan_id: uuid.UUID, plan_in: SubscriptionPlanUpdate, session: AsyncSession = Depends(get_session), _user=Depends(current_superuser)):
    plan = await session.get(SubscriptionPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    if plan_in.name is not None:
        plan.name = plan_in.name
    if plan_in.price is not None:
        plan.price = plan_in.price
    if plan_in.currency is not None:
        plan.currency = plan_in.currency
    if plan_in.is_active is not None:
        plan.is_active = plan_in.is_active

    session.add(plan)

    if plan_in.module_ids is not None:
        old_modules = await session.execute(select(PlanModule).where(PlanModule.plan_id == plan_id))
        for om in old_modules.scalars().all():
            await session.delete(om)

        for mod_id in plan_in.module_ids:
            pm = PlanModule(plan_id=plan.id, module_id=mod_id)
            session.add(pm)

    await session.commit()
    await session.refresh(plan)

    mod_result = await session.execute(select(PlanModule).where(PlanModule.plan_id == plan.id))
    current_modules = [m.module_id for m in mod_result.scalars().all()]

    return SubscriptionPlanRead(
        id=plan.id,
        name=plan.name,
        price=plan.price,
        currency=plan.currency,
        is_active=plan.is_active,
        module_ids=current_modules
    )

@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_plan(plan_id: uuid.UUID, session: AsyncSession = Depends(get_session), _user=Depends(current_superuser)):
    plan = await session.get(SubscriptionPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    plan.is_active = False
    session.add(plan)
    await session.commit()
    return None

class HardDeleteRequest(BaseModel):
    password: str

@router.post("/{plan_id}/hard-delete", status_code=status.HTTP_204_NO_CONTENT)
async def hard_delete_plan(plan_id: uuid.UUID, body: HardDeleteRequest, session: AsyncSession = Depends(get_session)):
    from core.security_utils import verify_superadmin_password
    if not verify_superadmin_password(body.password):
        raise HTTPException(status_code=403, detail="Contraseña incorrecta")

    plan = await session.get(SubscriptionPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    old_modules = await session.execute(select(PlanModule).where(PlanModule.plan_id == plan_id))
    for om in old_modules.scalars().all():
        await session.delete(om)

    await session.delete(plan)
    await session.commit()
    return None
