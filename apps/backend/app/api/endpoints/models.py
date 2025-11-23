from typing import List

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from ...db.models import ModelConfig, SystemPromptTemplate
from ...db.session import async_session
from ...schemas import ModelConfigResponse, SystemPromptTemplateResponse

router = APIRouter()


@router.get("/api/models", response_model=List[ModelConfigResponse])
async def list_models():
    """Get all available models - public endpoint."""
    try:
        async with async_session() as session:
            result = await session.execute(
                select(ModelConfig).order_by(ModelConfig.display_name)
            )
            models = result.scalars().all()
            return [
                ModelConfigResponse(
                    id=m.id,
                    model_name=m.model_name,
                    display_name=m.display_name,
                    thinking_behavior=m.thinking_behavior,
                    thinking_tags=m.thinking_tags,
                    default_temperature=m.default_temperature,
                    default_max_tokens=m.default_max_tokens,
                    max_context_tokens=m.max_context_tokens,
                    supports_system_prompt=m.supports_system_prompt,
                )
                for m in models
            ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch models: {str(e)}")


@router.get(
    "/api/system-prompt-templates", response_model=List[SystemPromptTemplateResponse]
)
async def list_system_prompt_templates():
    """Get all system prompt templates - public endpoint."""
    try:
        async with async_session() as session:
            result = await session.execute(
                select(SystemPromptTemplate).order_by(
                    SystemPromptTemplate.is_default.desc(),
                    SystemPromptTemplate.category,
                    SystemPromptTemplate.name,
                )
            )
            templates = result.scalars().all()
            return [
                SystemPromptTemplateResponse(
                    id=t.id,
                    name=t.name,
                    description=t.description,
                    content=t.content,
                    is_default=t.is_default,
                    category=t.category,
                )
                for t in templates
            ]
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch templates: {str(e)}"
        )
