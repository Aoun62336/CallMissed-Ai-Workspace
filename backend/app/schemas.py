from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=12)

    @model_validator(mode="after")
    def validate_conversation(self) -> ChatRequest:
        for message in self.messages:
            message.content = message.content.strip()
            if not message.content:
                raise ValueError("Messages cannot be blank.")
        if self.messages[-1].role != "user":
            raise ValueError("The last message must be from the user.")
        if sum(len(message.content) for message in self.messages) > 12000:
            raise ValueError("Conversation context is too large.")
        return self


class ImageRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=1000)

    @model_validator(mode="after")
    def trim_prompt(self) -> ImageRequest:
        self.prompt = self.prompt.strip()
        if not self.prompt:
            raise ValueError("Image prompt cannot be blank.")
        return self


class AccessLoginRequest(BaseModel):
    passcode: str = Field(min_length=1, max_length=256)
