# ADR-002: Authentication and Authorization

- Status: Accepted
- Date: 2026-08-28

## Context

The application requires user registration, login, groups, private/public content, media, rankings and future account deletion/export flows. Client-side checks cannot be trusted for authorization.

## Decision

Use Supabase Auth for identity and token issuance. The FastAPI backend validates JWTs and performs server-side authorization for protected business operations.

Rules:
- authentication establishes identity
- authorization is evaluated server-side for every protected resource
- ownership and group membership are never trusted from the mobile client
- privileged Supabase/service-role credentials remain server-side only
- Row Level Security is used where Supabase Data API access exists
- public, group and private visibility rules must be explicit

## Consequences

Positive:
- avoids implementing password and identity infrastructure from scratch
- preserves a clear backend authorization boundary
- supports future OAuth providers

Trade-offs:
- integration depends on Supabase identity semantics
- RLS policies and backend authorization must remain consistent

## Security invariant

A user must never gain access to another user's protected resource merely by changing an identifier in a client request.
