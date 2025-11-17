import asyncio
import contextlib
import json
import sys
from pathlib import Path
from typing import List

import torch
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select, func

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    # Allow absolute `app.*` imports when executed via `fastapi dev app/main.py`.
    sys.path.append(str(BACKEND_ROOT))

from app.db.models import (
    Client,
    Message,
    Conversation,
    ModelConfig,
    SystemPromptTemplate,
)
from app.db.session import async_session, init_models
from app.db.conversation_helpers import (
    get_or_create_default_conversation,
    update_conversation_access_time,
    verify_conversation_belongs_to_client,
)
from app.schemas import (
    ClientResponse,
    ClientUpdate,
    ConversationCreate,
    ConversationUpdate,
    ConversationResponse,
    MessageResponse,
    ConversationDetailResponse,
    ModelConfigResponse,
    SystemPromptTemplateResponse,
)
from app.model_utils import (
    get_or_create_client,
    persist_user_turn,
    persist_assistant_turn,
    AsyncQueueTextStreamer,
    load_model,
    get_generation_params,
    count_tokens_for_system_prompt,
    format_prompt,
)

app = FastAPI()


@app.on_event("startup")
async def ensure_database():
    await init_models()


# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],  # Next.js ports
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "Baguettotron API is running"}


@app.get("/api/health")
async def health_check():
    """Lightweight health check endpoint for initial connection verification."""
    from datetime import datetime, timezone
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


# Public API Endpoints (no authentication required)


@app.get("/api/models", response_model=List[ModelConfigResponse])
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


@app.get(
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


# Client Settings API Endpoints


@app.get("/api/clients/{client_id}", response_model=ClientResponse)
async def get_client(client_id: str):
    """Get client information including system prompt and generation parameters."""
    try:
        async with async_session() as session:
            result = await session.execute(
                select(Client).where(Client.fingerprint == client_id)
            )
            client = result.scalar_one_or_none()

            if client is None:
                raise HTTPException(status_code=404, detail="Client not found")

            return ClientResponse(
                id=client.id,
                fingerprint=client.fingerprint,
                system_prompt=client.system_prompt,
                temperature=client.temperature,
                top_p=client.top_p,
                top_k=client.top_k,
                repetition_penalty=client.repetition_penalty,
                do_sample=client.do_sample,
                max_tokens=client.max_tokens,
                created_at=client.created_at.isoformat(),
                updated_at=client.updated_at.isoformat(),
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid request: {str(e)}")


@app.patch("/api/clients/{client_id}", response_model=ClientResponse)
async def update_client(client_id: str, client_data: ClientUpdate):
    """Update client's system prompt and generation parameters."""
    try:
        # Validate system_prompt length if provided
        if (
            client_data.system_prompt is not None
            and len(client_data.system_prompt) > 4000
        ):
            raise HTTPException(
                status_code=400,
                detail="System prompt exceeds maximum length of 4000 characters",
            )

        async with async_session() as session:
            result = await session.execute(
                select(Client).where(Client.fingerprint == client_id)
            )
            client = result.scalar_one_or_none()

            if client is None:
                raise HTTPException(status_code=404, detail="Client not found")

            # Update system_prompt if provided
            if client_data.system_prompt is not None:
                client.system_prompt = client_data.system_prompt

            # Update generation parameters if provided
            if client_data.temperature is not None:
                client.temperature = client_data.temperature
            if client_data.top_p is not None:
                client.top_p = client_data.top_p
            if client_data.top_k is not None:
                client.top_k = client_data.top_k
            if client_data.repetition_penalty is not None:
                client.repetition_penalty = client_data.repetition_penalty
            if client_data.do_sample is not None:
                client.do_sample = client_data.do_sample
            if client_data.max_tokens is not None:
                client.max_tokens = client_data.max_tokens

            await session.commit()
            await session.refresh(client)

            return ClientResponse(
                id=client.id,
                fingerprint=client.fingerprint,
                system_prompt=client.system_prompt,
                temperature=client.temperature,
                top_p=client.top_p,
                top_k=client.top_k,
                repetition_penalty=client.repetition_penalty,
                do_sample=client.do_sample,
                max_tokens=client.max_tokens,
                created_at=client.created_at.isoformat(),
                updated_at=client.updated_at.isoformat(),
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid request: {str(e)}")


# Conversation Management API Endpoints


@app.get("/api/conversations", response_model=List[ConversationResponse])
async def list_conversations(client_id: str = Query(...)):
    """List all conversations for a client."""
    try:
        async with async_session() as session:
            # Get or create client
            client = await get_or_create_client(session, client_id)

            # Fetch conversations with message count
            result = await session.execute(
                select(Conversation, func.count(Message.id).label("message_count"))
                .outerjoin(Message, Message.conversation_id == Conversation.id)
                .where(Conversation.client_id == client.id)
                .group_by(Conversation.id)
                .order_by(Conversation.last_accessed_at.desc())
            )

            conversations = []
            for conversation, message_count in result.all():
                conversations.append(
                    ConversationResponse(
                        id=conversation.id,
                        title=conversation.title,
                        created_at=conversation.created_at.isoformat(),
                        updated_at=conversation.updated_at.isoformat(),
                        last_accessed_at=conversation.last_accessed_at.isoformat(),
                        message_count=message_count,
                    )
                )

            return conversations
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid request: {str(e)}")


@app.post("/api/conversations", response_model=ConversationResponse)
async def create_conversation(conversation_data: ConversationCreate):
    """Create a new conversation."""
    try:
        async with async_session() as session:
            # Get or create client
            client = await get_or_create_client(session, conversation_data.client_id)

            # Create new conversation with UUID from frontend
            conversation = Conversation(
                id=conversation_data.id,
                client_id=client.id,
                title=conversation_data.title,
            )
            session.add(conversation)
            await session.commit()
            await session.refresh(conversation)

            return ConversationResponse(
                id=conversation.id,
                title=conversation.title,
                created_at=conversation.created_at.isoformat(),
                updated_at=conversation.updated_at.isoformat(),
                last_accessed_at=conversation.last_accessed_at.isoformat(),
                message_count=0,
            )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid request: {str(e)}")


@app.get(
    "/api/conversations/{conversation_id}", response_model=ConversationDetailResponse
)
async def get_conversation(conversation_id: str, client_id: str = Query(...)):
    """Get conversation details with messages."""
    try:
        async with async_session() as session:
            # Get or create client
            client = await get_or_create_client(session, client_id)

            # Fetch conversation
            result = await session.execute(
                select(Conversation).where(Conversation.id == conversation_id)
            )
            conversation = result.scalar_one_or_none()

            if conversation is None:
                raise HTTPException(status_code=404, detail="Conversation not found")

            # Verify ownership
            if conversation.client_id != client.id:
                raise HTTPException(
                    status_code=403,
                    detail="Conversation does not belong to this client",
                )

            # Fetch messages
            messages_result = await session.execute(
                select(Message)
                .where(Message.conversation_id == conversation_id)
                .order_by(Message.created_at, Message.id)
            )
            messages = messages_result.scalars().all()

            return ConversationDetailResponse(
                id=conversation.id,
                title=conversation.title,
                created_at=conversation.created_at.isoformat(),
                updated_at=conversation.updated_at.isoformat(),
                last_accessed_at=conversation.last_accessed_at.isoformat(),
                messages=[
                    MessageResponse(
                        role=msg.role,
                        content=msg.content,
                        thinking=msg.thinking,
                        created_at=msg.created_at.isoformat(),
                    )
                    for msg in messages
                ],
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid request: {str(e)}")


@app.patch("/api/conversations/{conversation_id}", response_model=ConversationResponse)
async def update_conversation(
    conversation_id: str,
    conversation_data: ConversationUpdate,
    client_id: str = Query(...),
):
    """Update conversation title."""
    try:
        async with async_session() as session:
            # Get or create client
            client = await get_or_create_client(session, client_id)

            # Fetch conversation
            result = await session.execute(
                select(Conversation).where(Conversation.id == conversation_id)
            )
            conversation = result.scalar_one_or_none()

            if conversation is None:
                raise HTTPException(status_code=404, detail="Conversation not found")

            # Verify ownership
            if conversation.client_id != client.id:
                raise HTTPException(
                    status_code=403,
                    detail="Conversation does not belong to this client",
                )

            # Update title
            conversation.title = conversation_data.title
            await session.commit()
            await session.refresh(conversation)

            # Get message count
            count_result = await session.execute(
                select(func.count(Message.id)).where(
                    Message.conversation_id == conversation_id
                )
            )
            message_count = count_result.scalar()

            return ConversationResponse(
                id=conversation.id,
                title=conversation.title,
                created_at=conversation.created_at.isoformat(),
                updated_at=conversation.updated_at.isoformat(),
                last_accessed_at=conversation.last_accessed_at.isoformat(),
                message_count=message_count,
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid request: {str(e)}")


@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, client_id: str = Query(...)):
    """Delete conversation and cascade delete messages."""
    try:
        async with async_session() as session:
            # Get or create client
            client = await get_or_create_client(session, client_id)

            # Fetch conversation
            result = await session.execute(
                select(Conversation).where(Conversation.id == conversation_id)
            )
            conversation = result.scalar_one_or_none()

            if conversation is None:
                raise HTTPException(status_code=404, detail="Conversation not found")

            # Verify ownership
            if conversation.client_id != client.id:
                raise HTTPException(
                    status_code=403,
                    detail="Conversation does not belong to this client",
                )

            # Delete conversation (cascade will delete messages)
            await session.delete(conversation)
            await session.commit()

            return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid request: {str(e)}")


@app.post("/api/conversations/{conversation_id}/access")
async def update_conversation_access(conversation_id: str, client_id: str = Query(...)):
    """Update last_accessed_at timestamp."""
    try:
        async with async_session() as session:
            # Get or create client
            client = await get_or_create_client(session, client_id)

            # Verify conversation exists and belongs to client
            if not await verify_conversation_belongs_to_client(
                session, conversation_id, client.id
            ):
                raise HTTPException(
                    status_code=404,
                    detail="Conversation not found or does not belong to this client",
                )

            # Update access time
            await update_conversation_access_time(session, conversation_id)

            return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid request: {str(e)}")


@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    await websocket.accept()

    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message_data = json.loads(data)

            user_message = message_data.get("message", "")
            thinking_mode = message_data.get("thinking_mode", True)
            model_name = message_data.get("model", "PleIAs/Baguettotron")
            client_id = message_data.get("client_id")
            conversation_id = message_data.get("conversation_id")

            # Simple request logging
            print(f"\n{'=' * 80}")
            print("📨 NEW REQUEST")
            print(f"{'=' * 80}")
            print(f"Model: {model_name}")
            print(f"Thinking mode: {thinking_mode}")
            print(f"Message: {user_message}")
            print(f"{'=' * 80}\n")

            if not client_id:
                client_id = websocket.client.host if websocket.client else "anonymous"

            if not conversation_id:
                print(
                    "⚠️  Missing conversation_id in payload, will use default conversation."
                )

            # Load model
            model_data = load_model(model_name)
            model = model_data["model"]
            tokenizer = model_data["tokenizer"]

            async with async_session() as session:
                client = await get_or_create_client(session, client_id)

                # Look up model configuration from database
                model_config_result = await session.execute(
                    select(ModelConfig).where(ModelConfig.model_name == model_name)
                )
                model_config = model_config_result.scalar_one_or_none()

                # Fallback to "controllable" if model not found in database
                thinking_behavior = "controllable"
                if model_config:
                    thinking_behavior = model_config.thinking_behavior
                    print(f"📋 Model config found: {model_config.display_name}")
                    print(f"   - thinking_behavior: {thinking_behavior}")
                else:
                    print(
                        f"⚠️  Model config not found for '{model_name}', using fallback: thinking_behavior='controllable'"
                    )

                # Retrieve system prompt from client record
                system_prompt = client.system_prompt or ""

                # Backward compatibility: if conversation_id is missing, get or create default
                if conversation_id is None:
                    print(
                        "⚠️  Missing conversation_id in payload, using default conversation."
                    )
                    conversation = await get_or_create_default_conversation(
                        session, client.id
                    )
                    conversation_id = conversation.id
                    await session.commit()

                # Update conversation access time
                await update_conversation_access_time(session, conversation_id)

                # Count system prompt tokens
                system_prompt_tokens = count_tokens_for_system_prompt(
                    tokenizer, system_prompt
                )

                conversation_history = await persist_user_turn(
                    session,
                    conversation_id,
                    user_message,
                    tokenizer,
                    system_prompt_tokens,
                )

                prompt = format_prompt(
                    conversation_history, thinking_mode, system_prompt
                )

                print("📝 Prompt construction parameters:")
                print(f"  - thinking_mode: {thinking_mode}")
                print("\n🎯 Expected assistant prefix:")
                expected_prefix = (
                    "<|im_start|>assistant\n<think>\n"
                    if thinking_mode
                    else "<|im_start|>assistant\n</think>\n"
                )
                print(f"{'=' * 80}\n")
                print("🧾 Full prompt delivered to model:")
                print(prompt)
                print(f"{'=' * 60}\n")

                await websocket.send_json(
                    {
                        "type": "start",
                        "model": model_name,
                        "thinking_mode": thinking_mode,
                        "conversation_id": conversation_id,
                    }
                )

                async def send_thinking_update(content: str, complete: bool = False):
                    # For "fixed" thinking models: always send (model always generates thinking)
                    # For "controllable" models: only send if thinking_mode is enabled
                    if thinking_behavior != "fixed" and not thinking_mode:
                        return
                    await websocket.send_json(
                        {
                            "type": "thinking",
                            "conversation_id": conversation_id,
                            "content": content,
                            "complete": complete,
                        }
                    )
                    await asyncio.sleep(0)

                loop = asyncio.get_running_loop()
                stream_queue: asyncio.Queue = asyncio.Queue()
                streamer = AsyncQueueTextStreamer(
                    tokenizer,
                    loop,
                    stream_queue,
                    skip_prompt=True,
                    skip_special_tokens=False,
                )

                inputs = tokenizer(
                    prompt, return_tensors="pt", return_token_type_ids=False
                )

                if torch.cuda.is_available():
                    inputs = {k: v.to(model.device) for k, v in inputs.items()}

                # Get generation parameters from client settings with fallback to model config
                gen_params = get_generation_params(client, model_config)

                print(f"\n{'=' * 60}")
                print("🎛️  Generation Parameters:")
                print(f"{'=' * 60}")
                for key, value in gen_params.items():
                    print(f"  {key}: {value}")
                print(f"{'=' * 60}\n")

                generation_kwargs = {
                    **inputs,
                    "pad_token_id": tokenizer.eos_token_id,
                    "streamer": streamer,
                    **gen_params,  # Apply client parameters (includes max_new_tokens)
                }

                async def run_generation():
                    try:
                        await asyncio.to_thread(model.generate, **generation_kwargs)
                    finally:
                        streamer.close()

                generation_task = asyncio.create_task(run_generation())

                # Model-aware thinking detection
                # - For "fixed" models: assume thinking first, scan for </think>
                # - For "controllable" models: respect prompt format (thinking_mode)
                # - For "none" models: skip thinking detection entirely
                if thinking_behavior == "fixed":
                    in_thinking_block = True  # Assume thinking first for fixed models
                    print(
                        "🔍 Model behavior: 'fixed' - assuming thinking content first, will scan for </think>"
                    )
                elif thinking_behavior == "controllable":
                    in_thinking_block = thinking_mode  # Respect prompt format
                    print(
                        f"🔍 Model behavior: 'controllable' - respecting prompt format (thinking_mode={thinking_mode})"
                    )
                else:  # "none"
                    in_thinking_block = False  # No thinking detection
                    print(
                        "🔍 Model behavior: 'none' - skipping thinking detection entirely"
                    )

                should_send_thinking = thinking_mode  # User preference for display
                thinking_content = ""
                saved_thinking_content = ""  # Store finalized thinking for DB
                response_content = ""
                thinking_started = False
                response_started = False  # Track if we've seen actual content
                found_closing_tag = False  # Track if we found </think> tag

                async def emit_thinking_text(text: str):
                    nonlocal thinking_content, thinking_started
                    if not text:
                        return
                    # Always accumulate thinking content (for DB storage)
                    thinking_content += text

                    # Always send to frontend (frontend decides whether to display)
                    # Print emoji only at the start of thinking
                    if not thinking_started:
                        print("💭 ", end="", flush=True)
                        thinking_started = True
                    print(text, end="", flush=True)
                    await send_thinking_update(thinking_content, complete=False)

                async def finalize_thinking():
                    nonlocal thinking_content, saved_thinking_content, found_closing_tag
                    nonlocal thinking_started, response_started

                    # Mark that we found the closing tag
                    found_closing_tag = True

                    # Always send to frontend (frontend decides whether to display)
                    # Print closing emoji and summary
                    print(" 💭")
                    print(f"\n💭 Thinking complete ({len(thinking_content)} chars)")
                    print(f"{'=' * 60}\n")
                    await send_thinking_update(thinking_content, complete=True)

                    # Save thinking content before clearing for next iteration
                    saved_thinking_content = thinking_content
                    thinking_content = ""
                    thinking_started = False
                    # Reset response flag so we trim whitespace after thinking ends
                    response_started = False

                async def emit_response_text(text: str):
                    nonlocal response_content, response_started
                    if not text:
                        return

                    # Always count all characters (including leading whitespace)
                    response_content += text

                    # Skip leading whitespace in display/logging only
                    display_text = text
                    if not response_started:
                        # Check if text has any non-whitespace content
                        if text.strip():
                            # Found actual content, mark as started and trim leading whitespace for display
                            response_started = True
                            display_text = text.lstrip()
                        else:
                            # All whitespace, skip displaying it but keep in response_content
                            return

                    print(f"{display_text}", end="", flush=True)
                    await websocket.send_json(
                        {
                            "type": "token",
                            "conversation_id": conversation_id,
                            "content": display_text,
                        }
                    )
                    await asyncio.sleep(0)  # Yield to event loop to send immediately

                print("🔄 Starting token stream...\n")

                try:
                    message_ended = False
                    while not message_ended:
                        text = await stream_queue.get()
                        if text is streamer.stop_signal:
                            break

                        # Filter out <|end_of_text|> special token
                        text = text.replace("<|end_of_text|>", "")

                        remaining = text
                        while remaining and not message_ended:
                            # Skip thinking detection for "none" models
                            if thinking_behavior == "none":
                                # Just emit everything as response
                                next_end = remaining.find("<|im_end|>")
                                if next_end != -1:
                                    if next_end > 0:
                                        await emit_response_text(remaining[:next_end])
                                    remaining = remaining[
                                        next_end + len("<|im_end|>") :
                                    ]
                                    message_ended = True
                                else:
                                    await emit_response_text(remaining)
                                    remaining = ""
                            elif in_thinking_block:
                                # Look for closing tag - support both </think> and </thinking>
                                close_idx = remaining.find("</think>")
                                close_tag_len = len("</think>")

                                # Also check for alternative format
                                alt_close_idx = remaining.find("</thinking>")
                                if alt_close_idx != -1 and (
                                    close_idx == -1 or alt_close_idx < close_idx
                                ):
                                    close_idx = alt_close_idx
                                    close_tag_len = len("</thinking>")
                                    print(
                                        "🔍 Detected alternative closing tag: </thinking>"
                                    )

                                if close_idx != -1:
                                    await emit_thinking_text(remaining[:close_idx])
                                    remaining = remaining[close_idx + close_tag_len :]
                                    await finalize_thinking()
                                    in_thinking_block = False
                                else:
                                    await emit_thinking_text(remaining)
                                    remaining = ""
                            else:
                                # Look for opening tags - support both <think> and <thinking>
                                next_think = remaining.find("<think>")
                                next_thinking = remaining.find("<thinking>")
                                next_end = remaining.find("<|im_end|>")

                                next_token = None
                                next_idx = len(remaining)
                                think_tag_len = 0

                                # Check for <think> tag
                                if next_think != -1 and next_think < next_idx:
                                    next_token = "think"
                                    next_idx = next_think
                                    think_tag_len = len("<think>")

                                # Check for alternative <thinking> tag
                                if next_thinking != -1 and next_thinking < next_idx:
                                    next_token = "think"
                                    next_idx = next_thinking
                                    think_tag_len = len("<thinking>")
                                    print(
                                        "🔍 Detected alternative opening tag: <thinking>"
                                    )

                                # Check for end tag
                                if next_end != -1 and next_end < next_idx:
                                    next_token = "end"
                                    next_idx = next_end

                                if next_token:
                                    if next_idx > 0:
                                        await emit_response_text(remaining[:next_idx])
                                    if next_token == "think":
                                        remaining = remaining[
                                            next_idx + think_tag_len :
                                        ]
                                        in_thinking_block = True
                                        thinking_content = ""
                                        thinking_started = False
                                    else:
                                        remaining = remaining[
                                            next_idx + len("<|im_end|>") :
                                        ]
                                        message_ended = True
                                else:
                                    await emit_response_text(remaining)
                                    remaining = ""
                    print("\n\n✅ Stream complete!")
                    print(f"📊 Response length: {len(response_content)} chars")
                    print(f"{'=' * 60}\n")

                    # Reclassification: If we never found </think> but accumulated thinking content,
                    # it means the model didn't actually generate thinking - reclassify as response
                    if not found_closing_tag and thinking_content:
                        print(
                            "\n⚠️  Reclassifying thinking as response (no closing tag found)\n"
                        )

                        # Send reclassification signal to frontend
                        await websocket.send_json(
                            {
                                "type": "reclassify_thinking_as_response",
                                "conversation_id": conversation_id,
                            }
                        )

                        # Move thinking content to response content
                        response_content = thinking_content + response_content
                        thinking_content = ""
                        saved_thinking_content = ""


                    # Save thinking content only if we found a closing tag
                    # If no closing tag was found, everything is in response_content (after reclassification)
                    thinking_to_save = (
                        saved_thinking_content if found_closing_tag else None
                    )
                    await persist_assistant_turn(
                        session,
                        conversation_id,
                        response_content,
                        tokenizer,
                        thinking_to_save,
                        system_prompt_tokens,
                    )

                    await websocket.send_json(
                        {
                            "type": "complete",
                            "conversation_id": conversation_id,
                            "full_response": response_content,
                        }
                    )
                finally:
                    streamer.close()
                    if not generation_task.done():
                        generation_task.cancel()
                    with contextlib.suppress(asyncio.CancelledError):
                        await generation_task

    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"Error: {str(e)}")
        try:
            # Try to include conversation_id if available in the error response
            error_response = {"type": "error", "message": str(e)}
            # conversation_id might not be defined if error occurs before parsing
            if "conversation_id" in locals() and conversation_id:
                error_response["conversation_id"] = conversation_id
            await websocket.send_json(error_response)
        except Exception:
            pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
