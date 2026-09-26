# Architecture & Data Model

## System Architecture

```mermaid
flowchart LR
    Browser["Browser (Passenger / Driver)"] --> Web["Next.js App (App Router)\nfrontend/"]
    Web -->|REST/JSON, JWT| API["Node.js + Express API\nbackend/"]
    API --> DB[("PostgreSQL\nvia Prisma ORM")]
    API -. reads .-> Zones["Static Dhaka Zone Table\n(in-memory, seeded)"]
```

No queues, no cache layer, no microservices. A ride-pooling MVP at this
scale is bottlenecked by correctness of state transitions and capacity
enforcement, not by throughput — adding Kafka/Redis/K8s here would be
complexity with no job to do (see PRD §9 and the Bonus section for how
this would change at 1M-passenger scale).

## Entity-Relationship Diagram

```mermaid
erDiagram
    USER ||--o{ VEHICLE : "owns (if DRIVER)"
    USER ||--o{ RIDE_REQUEST : "makes (if PASSENGER)"
    VEHICLE ||--o{ POOL : "runs"
    POOL ||--o{ RIDE_REQUEST : "groups"
    RIDE_REQUEST ||--o{ STATUS_EVENT : "logs"
    USER ||--o{ STATUS_EVENT : "triggers"

    USER {
        string id PK
        string name
        string email UK
        string passwordHash
        string role "PASSENGER | DRIVER"
        string phone
        datetime createdAt
    }
    VEHICLE {
        string id PK
        string driverId FK
        string name
        int capacity
        bool isOnline
        datetime createdAt
    }
    POOL {
        string id PK
        string vehicleId FK
        string status "OPEN | MATCHED | DRIVER_ARRIVED | STARTED | COMPLETED | CANCELLED"
        datetime startedAt
        datetime completedAt
        datetime createdAt
    }
    RIDE_REQUEST {
        string id PK
        string passengerId FK
        string poolId FK "nullable"
        string pickupZone
        string destinationZone
        float pickupLat
        float pickupLng
        float destLat
        float destLng
        int seats
        string status "REQUESTED | MATCHED | DRIVER_ARRIVED | STARTED | COMPLETED | CANCELLED"
        int baseFarePoisha
        int distanceChargePoisha
        int poolDiscountPoisha
        int totalFarePoisha
        datetime createdAt
        datetime updatedAt
        datetime cancelledAt
        string cancelReason
    }
    STATUS_EVENT {
        string id PK
        string rideRequestId FK
        string fromStatus
        string toStatus
        string changedById FK
        datetime changedAt
    }
```

## Ride / Pool Lifecycle

```
REQUESTED → MATCHED → DRIVER_ARRIVED → STARTED → COMPLETED
     └────────────────┴──────────────────┘
                       CANCELLED (only from REQUESTED or MATCHED)
```

- A `RideRequest` is the passenger-facing unit — each passenger always sees only their own request, status and fare.
- A `Pool` is the driver-facing unit — one `Pool` belongs to exactly one `Vehicle` trip and groups 1..N `RideRequest`s, as long as `sum(seats of active members) <= vehicle.capacity`.
- Driver actions (arrive/start/complete) act on the whole `Pool`; each member `RideRequest`'s status moves in lockstep with the pool.
- Passenger cancellation acts on their own `RideRequest` only, and is only allowed while status is `REQUESTED` or `MATCHED`.