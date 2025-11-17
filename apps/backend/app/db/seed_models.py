"""Seed script for model configurations and system prompt templates."""

import asyncio
from sqlalchemy import select

from app.db.models import ModelConfig, SystemPromptTemplate
from app.db.session import async_session


async def seed_model_configs():
    """Seed initial model configurations."""
    models = [
        {
            "model_name": "PleIAs/Baguettotron",
            "display_name": "Baguettotron",
            "thinking_behavior": "controllable",
            "thinking_tags": "<think>",
            "default_temperature": 0.7,
            "default_max_tokens": 2048,
            "max_context_tokens": 8192,
            "supports_system_prompt": True,
        },
        {
            "model_name": "PleIAs/Monad",
            "display_name": "Monad",
            "thinking_behavior": "fixed",
            "thinking_tags": "<think>",
            "default_temperature": 0.7,
            "default_max_tokens": 2048,
            "max_context_tokens": 8192,
            "supports_system_prompt": True,
        },
        {
            "model_name": "meta-llama/Llama-2-7b-chat-hf",
            "display_name": "Llama 2 7B",
            "thinking_behavior": "none",
            "thinking_tags": None,
            "default_temperature": 0.7,
            "default_max_tokens": 2048,
            "max_context_tokens": 4096,
            "supports_system_prompt": True,
        },
        {
            "model_name": "mistralai/Mistral-7B-Instruct-v0.1",
            "display_name": "Mistral 7B",
            "thinking_behavior": "none",
            "thinking_tags": None,
            "default_temperature": 0.7,
            "default_max_tokens": 2048,
            "max_context_tokens": 8192,
            "supports_system_prompt": True,
        },
    ]

    async with async_session() as session:
        for model_data in models:
            # Check if model already exists
            result = await session.execute(
                select(ModelConfig).where(
                    ModelConfig.model_name == model_data["model_name"]
                )
            )
            existing = result.scalar_one_or_none()

            if existing is None:
                model = ModelConfig(**model_data)
                session.add(model)
                print(f"✅ Added model: {model_data['display_name']}")
            else:
                print(f"⏭️  Model already exists: {model_data['display_name']}")

        await session.commit()


async def seed_system_prompt_templates():
    """Seed initial system prompt templates."""
    templates = [
        {
            "name": "Default Assistant",
            "description": "Friendly and helpful general-purpose assistant",
            "content": "You are a helpful assistant who answers questions in a chat with a user. Be friendly, helpful and factual.",
            "is_default": True,
            "category": "general",
        },
        {
            "name": "Coding Assistant",
            "description": "Expert programming assistant",
            "content": "You are an expert programming assistant. Provide clear, well-documented code examples. Explain your reasoning and suggest best practices.",
            "is_default": False,
            "category": "coding",
        },
        {
            "name": "Creative Writer",
            "description": "Creative and imaginative writing assistant",
            "content": "You are a creative writing assistant. Help users craft engaging stories, poems, and creative content. Be imaginative and expressive.",
            "is_default": False,
            "category": "creative",
        },
        {
            "name": "Concise Expert",
            "description": "Direct and to-the-point responses",
            "content": "You are a concise expert. Provide direct, accurate answers without unnecessary elaboration. Be precise and efficient.",
            "is_default": False,
            "category": "general",
        },
        {
            "name": "Teacher",
            "description": "Patient educator who explains concepts clearly",
            "content": "You are a patient teacher. Break down complex concepts into simple, understandable parts. Use examples and analogies to help users learn.",
            "is_default": False,
            "category": "education",
        },
    ]

    async with async_session() as session:
        for template_data in templates:
            # Check if template already exists
            result = await session.execute(
                select(SystemPromptTemplate).where(
                    SystemPromptTemplate.name == template_data["name"]
                )
            )
            existing = result.scalar_one_or_none()

            if existing is None:
                template = SystemPromptTemplate(**template_data)
                session.add(template)
                print(f"✅ Added template: {template_data['name']}")
            else:
                print(f"⏭️  Template already exists: {template_data['name']}")

        await session.commit()


async def main():
    """Run all seed functions."""
    print("\n" + "=" * 60)
    print("🌱 Seeding Model Configurations")
    print("=" * 60)
    await seed_model_configs()

    print("\n" + "=" * 60)
    print("🌱 Seeding System Prompt Templates")
    print("=" * 60)
    await seed_system_prompt_templates()

    print("\n" + "=" * 60)
    print("✅ Seeding complete!")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
