# BTD — Balionų taikinių deaktyvavimas

[Open the interactive simulator](https://matasvai.github.io/btd-vilnius-web/)

Public website files for the Vilnius balloon-drift study. The development repository remains private. This repository contains only the published `dist/` files and the GitHub Pages deployment workflow.

The map includes editable wind, Belarus-only starting positions, an assumed probability cloud, altitude colors, a WorldPop population-density layer, and a downloadable LaTeX report. This is an illustrative model, not live weather, aircraft tracking, a collision prediction or an airport-closure decision tool.

GitHub Pages publishes `dist/` when it changes on `main`. No ChatGPT hosting service is required.

Country geometry: geoBoundaries / OpenStreetMap, ODbL 1.0. Attribution, derived boundary data, airspace sources and limitations are included in the website and report.

Population: WorldPop / University of Southampton, 2025 R2025A v1 preliminary estimates, [DOI:10.5258/SOTON/WP00840](https://doi.org/10.5258/SOTON/WP00840), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). National grids were cropped and counts divided by geographic cell area. Full provenance and processing details are available in `dist/population-density.json`.
