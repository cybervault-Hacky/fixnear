"""Typed public and administrative service-catalog contracts."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

Slug = Annotated[str, Field(min_length=1, max_length=80, pattern=r'^[a-z0-9]+(?:-[a-z0-9]+)*$')]
ShortText = Annotated[str, Field(min_length=1, max_length=240)]


class ServiceCategoryCreateRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    slug: Slug
    title: Annotated[str, Field(min_length=1, max_length=120)]
    description: Annotated[str, Field(max_length=2000)] = ''
    display_order: Annotated[int, Field(ge=0, le=1_000_000)] = 0
    is_active: bool = True


class ServiceCategoryUpdateRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    slug: Slug | None = None
    title: Annotated[str, Field(min_length=1, max_length=120)] | None = None
    description: Annotated[str, Field(max_length=2000)] | None = None
    display_order: Annotated[int, Field(ge=0, le=1_000_000)] | None = None
    is_active: bool | None = None

    @model_validator(mode='after')
    def require_an_update(self):
        if not self.model_fields_set:
            raise ValueError('At least one field must be provided.')
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError('Updated fields cannot be null.')
        return self


class ServiceCategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    title: str
    description: str
    display_order: int


class ServiceCategoryAdminResponse(ServiceCategoryResponse):
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ServiceProblemInput(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    title: Annotated[str, Field(min_length=1, max_length=160)]
    description: Annotated[str, Field(min_length=1, max_length=1000)]


class ServiceQuestionInput(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    question: Annotated[str, Field(min_length=1, max_length=300)]
    answer: Annotated[str, Field(min_length=1, max_length=2000)]


class ServiceCreateRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    category_slug: Slug
    slug: Slug
    title: Annotated[str, Field(min_length=1, max_length=160)]
    home_title: Annotated[str, Field(min_length=1, max_length=120)]
    home_description: Annotated[str, Field(max_length=240)] = ''
    description: Annotated[str, Field(min_length=1, max_length=5000)]
    listing_description: Annotated[str, Field(min_length=1, max_length=500)]
    keywords: Annotated[list[ShortText], Field(max_length=30)] = Field(default_factory=list)
    common_problems: Annotated[list[ServiceProblemInput], Field(max_length=40)] = Field(
        default_factory=list
    )
    inspection_scope: Annotated[list[ShortText], Field(max_length=40)] = Field(
        default_factory=list
    )
    questions: Annotated[list[ServiceQuestionInput], Field(max_length=40)] = Field(
        default_factory=list
    )
    related_service_slugs: Annotated[list[Slug], Field(max_length=40)] = Field(
        default_factory=list
    )
    display_order: Annotated[int, Field(ge=0, le=1_000_000)] = 0
    is_active: bool = True

    @model_validator(mode='after')
    def validate_lists(self):
        if len(set(self.keywords)) != len(self.keywords):
            raise ValueError('Keywords must be unique.')
        if len(set(self.related_service_slugs)) != len(self.related_service_slugs):
            raise ValueError('Related services must be unique.')
        if self.slug in self.related_service_slugs:
            raise ValueError('A service cannot be related to itself.')
        return self


class ServiceUpdateRequest(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

    category_slug: Slug | None = None
    slug: Slug | None = None
    title: Annotated[str, Field(min_length=1, max_length=160)] | None = None
    home_title: Annotated[str, Field(min_length=1, max_length=120)] | None = None
    home_description: Annotated[str, Field(max_length=240)] | None = None
    description: Annotated[str, Field(min_length=1, max_length=5000)] | None = None
    listing_description: Annotated[str, Field(min_length=1, max_length=500)] | None = None
    keywords: Annotated[list[ShortText], Field(max_length=30)] | None = None
    common_problems: Annotated[list[ServiceProblemInput], Field(max_length=40)] | None = None
    inspection_scope: Annotated[list[ShortText], Field(max_length=40)] | None = None
    questions: Annotated[list[ServiceQuestionInput], Field(max_length=40)] | None = None
    related_service_slugs: Annotated[list[Slug], Field(max_length=40)] | None = None
    display_order: Annotated[int, Field(ge=0, le=1_000_000)] | None = None
    is_active: bool | None = None

    @model_validator(mode='after')
    def validate_update(self):
        if not self.model_fields_set:
            raise ValueError('At least one field must be provided.')
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError('Updated fields cannot be null.')
        if self.keywords is not None and len(set(self.keywords)) != len(self.keywords):
            raise ValueError('Keywords must be unique.')
        if (
            self.related_service_slugs is not None
            and len(set(self.related_service_slugs)) != len(self.related_service_slugs)
        ):
            raise ValueError('Related services must be unique.')
        if self.slug and self.related_service_slugs and self.slug in self.related_service_slugs:
            raise ValueError('A service cannot be related to itself.')
        return self


class ServiceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    title: str
    home_title: str
    home_description: str
    description: str
    listing_description: str
    category: ServiceCategoryResponse
    keywords: list[str]
    common_problems: list[ServiceProblemInput]
    inspection_scope: list[str]
    questions: list[ServiceQuestionInput]
    related_service_slugs: list[str]
    display_order: int


class ServiceAdminResponse(ServiceResponse):
    is_active: bool
    created_at: datetime
    updated_at: datetime
