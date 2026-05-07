# Research Schedules

Research schedules reference saved Planfiles. Schedule creation runs Plan Check
first; blocking missing requirements prevent schedule creation.

Create a daily research schedule:

```bash
open-lagrange research schedule "open source container security" \
  --provider local-searxng \
  --daily \
  --at 08:00
```

List schedules:

```bash
open-lagrange schedule list
```

Schedule records link back to the Planfile. Run history should link to Durable
Runs when the runtime has automatic schedule execution enabled. Local schedule
records may be manual-only depending on the active runtime profile.
