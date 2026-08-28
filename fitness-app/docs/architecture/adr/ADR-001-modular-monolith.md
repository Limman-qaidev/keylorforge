# ADR-001: Modular Monolith Architecture

- Status: Accepted
- Date: 2026-08-28

## Context

The product requires a mobile application, authenticated APIs, relational workout data, analytics, rankings, social features, media, and future integrations. The system is at project inception and does not yet have scale or team boundaries that justify distributed services.

## Decision

Use a modular monolith for the backend.

Primary modules will include:
- auth
- users
- exercises
- workouts
- analytics
- groups
- rankings
- social
- media
- notifications

The mobile application remains a separate client. Backend modules communicate in-process and share one PostgreSQL database while maintaining explicit domain boundaries.

## Consequences

Positive:
- lower operational complexity
- simpler local development and testing
- easier transactions across related domains
- faster initial delivery
- clear future extraction boundaries if required

Trade-offs:
- module boundaries must be enforced by code organization and review
- poor discipline could lead to unwanted coupling

## Rejected alternatives

### Microservices
Rejected at inception because they add deployment, networking, observability, consistency, and coordination costs without a demonstrated requirement.

### Backend-as-a-service-only architecture
Rejected as the sole architecture because core business rules, rankings, authorization, offline synchronization semantics, and future analytics require an explicit server-side application layer.
