import asyncio
import contextlib
import json
from contextlib import asynccontextmanager

import torch
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from .api.endpoints import clients, conversations, documents, models
from .db.conversation_helpers import (
    get_or_create_default_conversation,
    update_conversation_access_time,
)
from .db.models import ModelConfig
from .db.session import async_session, init_models
from .services.model_utils import (
    AsyncQueueTextStreamer,
    count_tokens_for_system_prompt,
    format_prompt,
    format_prompt_with_rag,
    get_generation_params,
    get_or_create_client,
    load_model,
    persist_assistant_turn,
    persist_user_turn,
)
from .rag.config import RAGConfig
from .rag.embeddings import EmbeddingGenerator
from .rag.retriever import RAGRetriever
from .rag.vector_store import VectorStore
from .services.document_service import check_conversation_has_documents

# ... imports ...

# Global RAG components (initialized at startup)
rag_config: RAGConfig | None = None
embedding_generator: EmbeddingGenerator | None = None


async def init_rag_components():
    """Initialize RAG components and return config and generator."""
    try:
        config = RAGConfig.from_env()
        generator = None

        if config.enabled:
            print(f"\n{'=' * 60}")
            print("🔄 Initializing RAG components...")
            print(f"{'=' * 60}")
            print(f"Embedding model: {config.embedding_model}")
            print(f"Chunk size: {config.chunk_size}")
            print(f"Top-k: {config.top_k}")
            print(f"Min similarity: {config.min_similarity}")

            # Initialize embedding generator (loads model)
            # Run in thread pool to avoid blocking event loop
            generator = await asyncio.to_thread(EmbeddingGenerator.get_instance, config)

            print("✅ RAG components initialized successfully!")
            print(f"{'=' * 60}\n")
        else:
            print("⚠️  RAG is disabled in configuration")

        return config, generator
    except Exception as e:
        print(f"❌ Failed to initialize RAG components: {str(e)}")
        print("⚠️  RAG functionality will be disabled")
        return None, None


async def warmup_model_task():
    """Warm up the generator model."""
    try:
        print("🔥 Warming up default generator model...")
        # Run in thread pool since loading model is CPU intensive and blocking
        await asyncio.to_thread(load_model)
        print("✅ Generator model warmed up!")
    except Exception as e:
        print(f"⚠️  Failed to warm up generator model: {str(e)}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for startup and shutdown events.
    Handles database initialization, RAG setup, and model warmup in parallel.
    """
    # --- Startup ---
    print("\n🚀 Starting up Baguettotron Backend...")

    # Define tasks
    tasks = [
        init_models(),
        init_rag_components(),
        warmup_model_task(),
    ]

    # Run tasks concurrently
    print("⏳ Running startup tasks in parallel...")
    results = await asyncio.gather(*tasks)

    # Unpack results
    # init_models returns None
    # init_rag_components returns (config, generator)
    # warmup_model_task returns None

    global rag_config, embedding_generator
    rag_config, embedding_generator = results[1]

    print("✨ All startup tasks completed!")

    yield

    # --- Shutdown ---
    print("\n🛑 Shutting down Baguettotron Backend...")
    # Cleanup resources if needed
    # if embedding_generator:
    #     embedding_generator.unload()


app = FastAPI(lifespan=lifespan)


# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],  # Next.js ports
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(models.router)
app.include_router(clients.router)
app.include_router(conversations.router)
app.include_router(documents.router)


@app.get("/")
async def root():
    return {"message": "Baguettotron API is running"}


@app.get("/api/health")
async def health_check():
    """Lightweight health check endpoint for initial connection verification."""
    from datetime import datetime, timezone

    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


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

                # RAG Integration: Check for documents and retrieve context
                rag_context = None
                print("\n[RAG] eligibility checkpoint")
                print(f"   conversation_id={conversation_id}")
                print(f"   rag_config_loaded={bool(rag_config)}")
                print(f"   rag_enabled={rag_config.enabled if rag_config else False}")
                print(f"   embedding_generator_ready={embedding_generator is not None}")
                if rag_config and rag_config.enabled and embedding_generator:
                    try:
                        # Check if conversation has ready documents
                        # Note: check_conversation_has_documents was moved to document_service, but I imported it from there?
                        # Wait, I need to check where I imported it from.
                        # In the original main.py it was defined there.
                        # I should probably move it to document_service or keep it.
                        # I imported it from app.services.document_service in the new main.py imports.
                        # But wait, I didn't put it in document_service.py!
                        # I only put process_document_background in document_service.py.
                        # I need to add check_conversation_has_documents to document_service.py or keep it in main.py (but I prefer moving it).

                        has_documents = await check_conversation_has_documents(
                            session, conversation_id
                        )
                        print(f"   ready_documents_present={has_documents}")

                        if has_documents:
                            print(
                                f"✅ RAG eligible: attempting retrieval for conversation {conversation_id}"
                            )
                            print(f"\n{'=' * 60}")
                            print("📚 RAG: Documents found, retrieving context...")
                            print(f"{'=' * 60}")

                            # Initialize RAG retriever with current session
                            vector_store = VectorStore(session)
                            rag_retriever = RAGRetriever(
                                embedding_generator, vector_store
                            )

                            # Retrieve relevant chunks
                            rag_context = await rag_retriever.retrieve_context(
                                query=user_message,
                                conversation_id=conversation_id,
                                top_k=rag_config.top_k,
                                min_similarity=rag_config.min_similarity,
                            )

                            if rag_context:
                                print(
                                    f"✅ Retrieved {len(rag_context.chunks)} relevant chunks"
                                )
                                print(f"{'=' * 60}\n")
                            else:
                                print(
                                    "⚠️  No relevant chunks found above similarity threshold"
                                )
                                print(f"{'=' * 60}\n")
                        else:
                            print(
                                "🚫 RAG skipped: no ready documents for this conversation"
                            )
                    except Exception as e:
                        print(f"⚠️  RAG retrieval error: {str(e)}")
                        print("   Falling back to normal chat without RAG")
                        rag_context = None
                else:
                    print(
                        "🚫 RAG skipped before document check: missing config or embedding generator"
                    )

                # Construct prompt based on RAG availability
                if rag_context:
                    # RAG-enhanced prompt with sources
                    # Remove current user message from history (it's in rag_context)
                    history_without_current = conversation_history[:-1]
                    prompt = format_prompt_with_rag(
                        history_without_current,
                        thinking_mode,
                        system_prompt,
                        rag_context.formatted_sources,
                        user_message,
                    )
                else:
                    # Normal prompt without RAG
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
                # print(prompt)
                print(f"{'=' * 60}\n")

                await websocket.send_json({
                    "type": "start",
                    "model": model_name,
                    "thinking_mode": thinking_mode,
                    "conversation_id": conversation_id,
                })

                async def send_thinking_update(content: str, complete: bool = False):
                    # For "fixed" thinking models: always send (model always generates thinking)
                    # For "controllable" models: only send if thinking_mode is enabled
                    if thinking_behavior != "fixed" and not thinking_mode:
                        return
                    await websocket.send_json({
                        "type": "thinking",
                        "conversation_id": conversation_id,
                        "content": content,
                        "complete": complete,
                    })
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

                model_device = model_data.get(
                    "device", getattr(model, "device", torch.device("cpu"))
                )
                inputs = tokenizer(
                    prompt, return_tensors="pt", return_token_type_ids=False
                )
                inputs = {k: v.to(model_device) for k, v in inputs.items()}

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
                    # print(text, end="", flush=True)
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

                    # print(f"{display_text}", end="", flush=True)
                    await websocket.send_json({
                        "type": "token",
                        "conversation_id": conversation_id,
                        "content": display_text,
                    })
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
                            # Defensive: stop if the model starts a new role turn mid-stream
                            new_turn_indices = [
                                idx
                                for idx in [
                                    remaining.find("<|im_start|>user"),
                                    remaining.find("<|im_start|>assistant"),
                                    remaining.find("<|im_start|>system"),
                                ]
                                if idx != -1
                            ]
                            next_new_turn = (
                                min(new_turn_indices) if new_turn_indices else -1
                            )
                            if next_new_turn != -1:
                                if next_new_turn > 0:
                                    await emit_response_text(remaining[:next_new_turn])
                                print(
                                    "⚠️  Detected unexpected <|im_start|> role tag mid-stream; terminating response early."
                                )
                                message_ended = True
                                remaining = ""
                                break

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
                        await websocket.send_json({
                            "type": "reclassify_thinking_as_response",
                            "conversation_id": conversation_id,
                        })

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

                    await websocket.send_json({
                        "type": "complete",
                        "conversation_id": conversation_id,
                        "full_response": response_content,
                    })
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
