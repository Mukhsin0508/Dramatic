# Generated Higgsfield schema seam

This directory is intentionally empty until the project supplies its authoritative
Higgsfield OpenAPI document.

Generate operation types and a `HiggsfieldSdkEndpoints<Operations>` map for
`createSdkBackedHiggsfieldClient`. Keep generated endpoint paths, model identifiers,
and request DTOs in this directory. Application code must import only the
provider-neutral `GenerationClient` from the package root.

The official v2 SDK issues the submission with SDK polling and POST retries disabled.
The Dramatic wrapper owns status polling, cancellation, `X-Correlation-ID`, and the
small provider-neutral envelopes. Cost estimation remains unsupported until the
authoritative schema exposes such an operation.

Credentials are supplied through `HiggsfieldRequestContext.authorization`. Never
emit that value in logs, errors, hooks, fixtures, browser bundles, or URLs.
