# Third-Party Notices

## Address / postal-code metadata

ConfidaraExpress' country-specific postal-code rules (`src/utils/libaddressinput-raw.json`,
`src/utils/address-metadata.json`, `src/utils/generated/postalCodeRules.mjs`) are derived
from Google's internationalized address data.

**Attribution:** Google LLC – Address Data Service metadata.

| Artifact | License |
|---|---|
| Google **Address Data Service metadata** (the `zip` / `require` / `upper` fields used here) | **CC-BY-4.0** (Creative Commons Attribution 4.0 International) |
| Google **libaddressinput** source code | Apache License 2.0 |
| **google-i18n-address** package code (the acquisition path) | BSD 3-Clause |

- CC-BY-4.0: <https://creativecommons.org/licenses/by/4.0/>
- The metadata was **machine-extracted** from the versioned PyPI package
  `google-i18n-address==3.1.1` (released 2024-09-04; wheel SHA-256
  `f66f4fd2b75d1cd371fc0a7678a1d656da4aa3b32932279e78dd6cae776fc23d`), which bundles a
  copy of Google's i18n address metadata. It was **not** fetched live from Google in this
  build, and the PyPI package is a mirror, not the primary authoritative source.
- No claim is made that the Google address **metadata** is Apache-2.0 — only the
  libaddressinput **source code** is Apache-2.0.

Provenance/refresh: `src/utils/README.address-metadata.md`.
