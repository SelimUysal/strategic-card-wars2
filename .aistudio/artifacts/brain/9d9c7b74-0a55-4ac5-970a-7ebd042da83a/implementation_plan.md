# R10 — İŞÇİLERİN KAYNAĞI ANA KARARGÂHA TESLİM ETMESİ

Implement a full resource delivery state machine for workers. Workers gather resources from nodes up to `workerCarryCapacity` (30 units), transport the load back to their team's active Headquarters, deposit it into the team stock, and return to gather again.

## User Review & Critical Decisions

> [!IMPORTANT]
> The specifications for worker delivery mechanics, carry capacity, overlay visual indicators, and death rules are strictly defined by prompt rules. No further clarification is needed.

- **Confirmed Decision 1**: Carry capacity fixed at 30 (`workerCarryCapacity`). Gather speed remains unchanged (`gatherPerSecPerWorker * gatherRate`).
- **Confirmed Decision 2**: Resources enter player/enemy stock & statistics (`goldGathered`/`woodGathered`) ONLY upon physical delivery at HQ edge (`depositing`).
- **Confirmed Decision 3**: On worker death, carried load is destroyed. If path to HQ is blocked, worker waits in place.

## 1. Overview & Core Concept

- **What It Does**: Replaces instant node-to-stock resource gathering with a realistic RTS delivery loop (`toNode` -> `gathering` -> `returning` -> `depositing` -> `toNode`).
- **Target Audience / Persona**: RTS players expecting tactile economic gameplay where worker travel distance and HQ positioning impact income rates.
- **Key Value**: Deepens strategic gameplay and harassment value—intercepting or killing enemy workers destroys their uncollected load and halts income.

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. Worker walks to assigned resource node (`toNode`).
  2. Worker gathers from node, depleting node reserve into worker's internal carry buffer up to 30 units (`gathering`).
  3. Small carrying indicator appears above worker's head (small yellow box for gold, small brown log for wood) (`S6`).
  4. Worker walks to the nearest edge tile of their active team HQ (`returning`).
  5. Upon arrival at HQ edge, worker deposits load into team stock (`depositing`), triggering resource addition & statistics bump.
  6. Worker returns to the node or searches for the next available node (`toNode`).
- **Visual Feedback & Overlay**:
  - Small carrying badge rendered above workers carrying load via `UnitOverlay.ts` billboard / 3D sprite or Canvas overlay.
  - Yellow box icon for gold carrying, brown log icon for wood carrying. No numerical text display as per `S6`.

## 3. Key Product Decisions & Trade-Offs

- **Decision 1**: Worker state fields stored directly on `Unit` (`carriedType`, `carriedAmount`, `workerState`).
  - *Chosen Approach*: Add `carriedType: 'gold' | 'wood' | null`, `carriedAmount: number`, `workerState: 'toNode' | 'gathering' | 'returning' | 'depositing'` to `Unit` class.
  - *Why*: Clean state serialization and seamless rendering in `UnitOverlay`.
- **Decision 2**: Nearest HQ Edge Target Calculation.
  - *Chosen Approach*: Calculate the closest walkable tile adjacent to the 6x6 HQ footprint for returning workers.
  - *Why*: Prevents workers from clipping into the HQ building model while ensuring precise delivery distance.

## 4. Technical Architecture & Data Strategy

```
 ┌─────────────────────────────────────────────────────────┐
 │                     WorkerManager                       │
 │  - State Machine Update Loop (dt)                       │
 │  - Handles: toNode -> gathering -> returning -> deposit │
 └───────────┬─────────────────────────────────┬───────────┘
             │                                 │
             ▼                                 ▼
 ┌──────────────────────┐           ┌──────────────────────┐
 │     ResourceNodes    │           │   BuildingManager    │
 │ - extract(node, amt) │           │ - getHq(team)        │
 └──────────────────────┘           └──────────────────────┘
             │                                 │
             └───────────────┬─────────────────┘
                             │
                             ▼
 ┌─────────────────────────────────────────────────────────┐
 │                   ResourceManager                       │
 │ - add(team, type, amount, gathered=true)                │
 │ - Triggers goldGathered / woodGathered stats on deposit │
 └─────────────────────────────────────────────────────────┘
```

- **File Modifications & Responsibilities**:
  1. `src/data/matchRules.ts`: Add `workerCarryCapacity: 30`.
  2. `src/units/Unit.ts`: Add `carriedType: 'gold' | 'wood' | null = null;`, `carriedAmount: number = 0;`, `workerState: 'toNode' | 'gathering' | 'returning' | 'depositing' = 'toNode';`.
  3. `src/economy/WorkerManager.ts`: Refactor `update(dt)` to drive the 4-phase delivery state machine, pathfinding to HQ edge, depositing to `ResourceManager`, and handling node depletion & death drop.
  4. `src/ui/UnitOverlay.ts`: Add carrying load indicator rendering above workers when `carriedAmount > 0`.
