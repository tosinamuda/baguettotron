"""Pydantic models for API requests and responses."""

from typing import List, Optional
from pydantic import BaseModel, field_validator


# Client schemas
class ClientResponse(BaseModel):
    id: int
    fingerprint: str
    system_prompt: str | None
    temperature: float | None
    top_p: float | None
    top_k: int | None
    repetition_penalty: float | None
    do_sample: bool | None
    max_tokens: int | None
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


class ClientUpdate(BaseModel):
    system_prompt: str | None = None
    temperature: float | None = None
    top_p: float | None = None
    top_k: int | None = None
    repetition_penalty: float | None = None
    do_sample: bool | None = None
    max_tokens: int | None = None

    @field_validator("temperature")
    @classmethod
    def validate_temperature(cls, v):
        if v is not None and not (0.0 <= v <= 2.0):
            raise ValueError("temperature must be between 0.0 and 2.0")
        return v

    @field_validator("top_p")
    @classmethod
    def validate_top_p(cls, v):
        if v is not None and not (0.0 <= v <= 1.0):
            raise ValueError("top_p must be between 0.0 and 1.0")
        return v

    @field_validator("top_k")
    @classmethod
    def validate_top_k(cls, v):
        if v is not None and not (1 <= v <= 100):
            raise ValueError("top_k must be between 1 and 100")
        return v

    @field_validator("repetition_penalty")
    @classmethod
    def validate_repetition_penalty(cls, v):
        if v is not None and not (1.0 <= v <= 2.0):
            raise ValueError("repetition_penalty must be between 1.0 and 2.0")
        return v

    @field_validator("max_tokens")
    @classmethod
    def validate_max_tokens(cls, v):
        if v is not None and not (100 <= v <= 4096):
            raise ValueError("max_tokens must be between 100 and 4096")
        return v


# Conversation schemas
class ConversationCreate(BaseModel):
    id: str  # UUID from frontend
    client_id: str
    title: Optional[str] = "New Conversation"


class ConversationUpdate(BaseModel):
    title: str


class ConversationResponse(BaseModel):
    id: str  # UUID
    title: str
    created_at: str
    updated_at: str
    last_accessed_at: str
    message_count: Optional[int] = None

    class Config:
        from_attributes = True


class MessageResponse(BaseModel):
    role: str
    content: str
    thinking: str | None = None
    created_at: str

    class Config:
        from_attributes = True


class ConversationDetailResponse(BaseModel):
    id: str  # UUID
    title: str
    created_at: str
    updated_at: str
    last_accessed_at: str
    messages: List[MessageResponse]

    class Config:
        from_attributes = True


# Model configuration schemas
class ModelConfigResponse(BaseModel):
    id: int
    model_name: str
    display_name: str
    thinking_behavior: str
    thinking_tags: str | None
    default_temperature: float
    default_max_tokens: int
    max_context_tokens: int
    supports_system_prompt: bool

    class Config:
        from_attributes = True


class SystemPromptTemplateResponse(BaseModel):
    id: int
    name: str
    description: str
    content: str
    is_default: bool
    category: str | None

    class Config:
        from_attributes = True
