# IONIQ 5 Charge Calculator

A minimalistic Android app that calculates how much energy (kWh) you need to pull from the charger to reach your desired battery level.

## Features

- **Model selection** — pick your exact IONIQ 5 variant; saved locally so you never have to set it again
- **Current battery** — type in your current state of charge (numeric keyboard)
- **Target battery** — drag a slider to your desired charge level
- **Instant result** — shows kWh drawn from the charger, battery net receive, and charging loss breakdown

## Supported Models

| Variant | Year | Drivetrain | Usable |
|---|---|---|---|
| Standard Range RWD | 2022–2023 | RWD | 54.0 kWh |
| Long Range RWD | 2022–2023 | RWD | 74.0 kWh |
| Long Range AWD | 2022–2023 | AWD | 74.0 kWh |
| Long Range RWD | 2024+ | RWD | 77.4 kWh |
| Long Range AWD | 2024+ | AWD | 77.4 kWh |
| IONIQ 5 N | 2024+ | AWD | 84.0 kWh |

## Charging Loss

A **10% overhead** is applied on top of the net battery energy needed. This accounts for heat and conversion losses during AC Level 2 charging. DC fast charging typically loses 5–8%, so the result is a conservative upper bound.

**Formula:**  
`kWh from charger = (target% − current%) / 100 × usable_kWh / 0.90`

## Getting Started

```bash
npm install
npm run android   # requires Android device / emulator
```

Built with [Expo](https://expo.dev) + React Native.
