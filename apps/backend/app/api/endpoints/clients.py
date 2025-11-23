from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from ...db.models import Client
from ...db.session import async_session
from ...schemas import ClientResponse, ClientUpdate

router = APIRouter()


@router.get("/api/clients/{client_id}", response_model=ClientResponse)
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


@router.patch("/api/clients/{client_id}", response_model=ClientResponse)
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
