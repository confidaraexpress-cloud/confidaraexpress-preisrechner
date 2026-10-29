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

## Address suggestions and address check (Geoapify / OpenStreetMap)

Address suggestions, postal-code → locality lists and the address check shown in the address
forms are provided by the **Geoapify** geocoding service (requested exclusively by the
ConfidaraExpress backend via the EU endpoint; the browser never contacts Geoapify). The
underlying address data comes from OpenStreetMap and further open sources.

| Source | Attribution | License |
|---|---|---|
| OpenStreetMap data | © OpenStreetMap contributors — <https://www.openstreetmap.org/copyright> | Open Data Commons Open Database License (ODbL) v1.0 — <https://opendatacommons.org/licenses/odbl/1-0/> |
| Geoapify service | "Powered by Geoapify" — <https://www.geoapify.com/> | Geoapify Terms and Conditions (service, not redistributed data) |

Both attributions are shown below every suggestion list (`src/components/address/AddressAttribution.jsx`)
and on the Impressum page. Until 2026-10-14 the address check used the OpenPLZ API (ODbL); it is
no longer used.

## Spreadsheet import (article and stock import)

The article import reads Excel files (`.xlsx`) in the browser with the following libraries. They are
bundled into separate chunks that load only when an Excel file is opened
(`src/utils/inventoryImportXlsx.mjs`); no file content leaves the browser except the checked import document.

| Package | Version | Copyright | License |
|---|---|---|---|
| read-excel-file | 9.3.13 | Copyright (c) 2018 gitlab.com/catamphetamine | MIT |
| fflate | 0.8.3 | Copyright (c) 2026 Arjun Barrett | MIT |
| saxen | 11.2.0 | Copyright (c) 2012 Vopilovskii Konstantin; Copyright (c) 2017-present Nico Rehwaldt | MIT |

MIT License: Permission is hereby granted, free of charge, to any person obtaining a copy of this software
and associated documentation files (the "Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following
conditions: The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
