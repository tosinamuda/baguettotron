from typing import Dict, List

import torch
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from transformers import AutoModelForCausalLM, AutoTokenizer, TextStreamer

from app.db.models import Client, Message, ModelConfig


# Global constants
MAX_TOTAL_TOKENS = 8192
MAX_GENERATION_TOKENS = 2048
MAX_PROMPT_TOKENS = MAX_TOTAL_TOKENS - MAX_GENERATION_TOKENS

ConversationMessage = Dict[str, str]

# Global model cache
model_cache = {}


async def get_or_create_client(session: AsyncSession, fingerprint: str) -> Client:
    result = await session.execute(
        select(Client).where(Client.fingerprint == fingerprint)
    )
    client = result.scalar_one_or_none()
    if client is None:
        client = Client(fingerprint=fingerprint)
        session.add(client)
        await session.flush()
    return client


async def fetch_messages(session: AsyncSession, conversation_id: str) -> List[Message]:
    result = await session.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at, Message.id)
    )
    return list(result.scalars().all())


async def delete_oldest_messages(
    session: AsyncSession,
    ordered_messages: List[Message],
    drop_count: int,
) -> None:
    if drop_count <= 0 or not ordered_messages:
        return
    ids_to_drop = [message.id for message in ordered_messages[:drop_count]]
    if ids_to_drop:
        await session.execute(delete(Message).where(Message.id.in_(ids_to_drop)))


async def persist_user_turn(
    session: AsyncSession,
    conversation_id: str,
    content: str,
    tokenizer,
    system_prompt_tokens: int = 0,
) -> List[ConversationMessage]:
    stored_messages = await fetch_messages(session, conversation_id)

    # Log conversation history
    print(f"\n📚 Building conversation history ({len(stored_messages)} messages in DB)")

    payload = [
        {"role": message.role, "content": message.content}
        for message in stored_messages
    ]

    payload.append({"role": "user", "content": content})
    truncated_history = truncate_history(
        payload, tokenizer, MAX_PROMPT_TOKENS, system_prompt_tokens
    )
    drop_count = len(payload) - len(truncated_history)
    await delete_oldest_messages(session, stored_messages, drop_count)
    session.add(Message(conversation_id=conversation_id, role="user", content=content))
    await session.commit()
    return truncated_history


async def persist_assistant_turn(
    session: AsyncSession,
    conversation_id: str,
    content: str,
    tokenizer,
    thinking: str | None = None,
    system_prompt_tokens: int = 0,
) -> None:
    stored_messages = await fetch_messages(session, conversation_id)

    payload = [
        {"role": message.role, "content": message.content}
        for message in stored_messages
    ]

    payload.append({"role": "assistant", "content": content})
    truncated_history = truncate_history(
        payload, tokenizer, MAX_PROMPT_TOKENS, system_prompt_tokens
    )
    drop_count = len(payload) - len(truncated_history)
    await delete_oldest_messages(session, stored_messages, drop_count)
    session.add(
        Message(
            conversation_id=conversation_id,
            role="assistant",
            content=content,
            thinking=thinking,
        )
    )
    await session.commit()


class AsyncQueueTextStreamer(TextStreamer):
    """Text streamer that pushes decoded chunks into an asyncio.Queue."""

    def __init__(
        self, tokenizer, loop, async_queue, skip_prompt=False, **decode_kwargs
    ):
        super().__init__(tokenizer, skip_prompt, **decode_kwargs)
        self.loop = loop
        self.queue = async_queue
        self.stop_signal = object()
        self._closed = False

    def on_finalized_text(self, text: str, stream_end: bool = False):
        self.loop.call_soon_threadsafe(self.queue.put_nowait, text)
        if stream_end:
            self.close()

    def close(self):
        if not self._closed:
            self._closed = True
            self.loop.call_soon_threadsafe(self.queue.put_nowait, self.stop_signal)


def load_model(model_name: str = "PleIAs/Baguettotron"):
    """Load and cache the model"""
    if model_name not in model_cache:
        print(f"\n{'=' * 60}")
        print(f"🔄 Loading model: {model_name}")
        print(f"{'=' * 60}")
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        model = AutoModelForCausalLM.from_pretrained(
            model_name,
            torch_dtype=torch.float32,
            device_map="auto" if torch.cuda.is_available() else None,
        )
        model_cache[model_name] = {"model": model, "tokenizer": tokenizer}
        print(f"✅ Model {model_name} loaded successfully!")
        print(f"{'=' * 60}\n")
    else:
        print(f"♻️  Using cached model: {model_name}")
    return model_cache[model_name]


def get_generation_params(client: Client, model_config: ModelConfig | None) -> dict:
    """
    Resolve generation parameters with fallback hierarchy:
    1. Client-specific settings (if set)
    2. Model defaults from ModelConfig
    3. Hard-coded fallbacks

    Handles do_sample conditional logic:
    - Only include temperature/top_p/top_k when do_sample=True
    - Always include repetition_penalty and max_tokens
    """
    # Get do_sample (default to False for deterministic)
    do_sample = client.do_sample if client.do_sample is not None else False

    # Start with base parameters
    params = {
        "do_sample": do_sample,
    }

    # Always include repetition_penalty and max_new_tokens
    params["repetition_penalty"] = (
        client.repetition_penalty if client.repetition_penalty is not None else 1.1
    )

    params["max_new_tokens"] = (
        client.max_tokens
        if client.max_tokens is not None
        else (model_config.default_max_tokens if model_config else 2048)
    )

    # Only include sampling params if do_sample is True
    if do_sample:
        params["temperature"] = (
            client.temperature
            if client.temperature is not None
            else (model_config.default_temperature if model_config else 0.7)
        )
        params["top_p"] = client.top_p if client.top_p is not None else 0.9
        params["top_k"] = client.top_k if client.top_k is not None else 50

    return params


def _format_message_segment(message: ConversationMessage) -> str:
    return f"<|im_start|>{message['role']}\n{message['content']}<|im_end|>"


def count_tokens_for_message(tokenizer, message: ConversationMessage) -> int:
    segment = _format_message_segment(message)
    return len(tokenizer(segment, add_special_tokens=False).input_ids)


def count_tokens_for_system_prompt(tokenizer, system_prompt: str | None) -> int:
    """Count tokens for system prompt in Qwen format."""
    if not system_prompt:
        return 0
    segment = f"<|im_start|>system\n{system_prompt}<|im_end|>"
    return len(tokenizer(segment, add_special_tokens=False).input_ids)


def truncate_history(
    messages: List[ConversationMessage],
    tokenizer,
    max_tokens: int,
    system_prompt_tokens: int = 0,
) -> List[ConversationMessage]:
    """Keep the most recent messages that fit within the token budget, accounting for system prompt."""
    if not messages:
        return messages

    # Reserve space for system prompt
    available_tokens = max_tokens - system_prompt_tokens

    total_tokens = 0
    truncated: List[ConversationMessage] = []

    for message in reversed(messages):
        message_tokens = count_tokens_for_message(tokenizer, message)
        # Always keep the latest message, even if it alone exceeds the limit
        if truncated and total_tokens + message_tokens > available_tokens:
            break
        truncated.append(message)
        total_tokens += message_tokens
    truncated.reverse()

    kept = len(truncated)
    dropped = len(messages) - kept
    if dropped > 0:
        print(f"⚠️  Truncated chat history: kept {kept} messages, dropped {dropped}")
    return truncated


def format_prompt(
    messages: List[ConversationMessage],
    thinking_mode: bool = True,
    system_prompt: str | None = None,
):
    """Format the sliding-window history in Qwen instruction style with optional system prompt."""
    # TASK 2: Detailed logging inside format_prompt() function
    print(f"\n{'=' * 80}")
    print("🔍 TASK 2: format_prompt() FUNCTION EXECUTION")
    print(f"{'=' * 80}")
    print("📥 Input parameters:")
    print(f"  - thinking_mode: {thinking_mode} (type: {type(thinking_mode).__name__})")
    print(
        f"  - system_prompt: {'Present' if system_prompt else 'None'} ({len(system_prompt) if system_prompt else 0} chars)"
    )
    print(f"  - messages count: {len(messages)}")

    segments = []

    # Prepend system message if provided
    if system_prompt:
        system_segment = f"<|im_start|>system\n{system_prompt}<|im_end|>"
        segments.append(system_segment)
        print("\n📋 System prompt segment added:")
        print(f"  Length: {len(system_segment)} chars")
        print(
            f"  Preview: {system_segment[:100]}..."
            if len(system_segment) > 100
            else f"  Content: {system_segment}"
        )

    # Add conversation history
    for message in messages:
        formatted_msg = _format_message_segment(message)
        segments.append(formatted_msg)

    # Add assistant prefix
    assistant_prefix = "<|im_start|>assistant\n"
    assistant_prefix += "<think>\n" if thinking_mode else "</think>\n"
    segments.append(assistant_prefix)

    prompt = "\n".join(segments)

    print("\n📝 PROMPT SENT TO MODEL:")
    print(f"{'─' * 80}")
    print(prompt)
    print(f"{'─' * 80}\n")

    return prompt
