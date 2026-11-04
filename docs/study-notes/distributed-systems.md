# Distributed Systems — Concepts, Tradeoffs and a PIOS Case Study

## 1. What is a distributed system?

A distributed system contains independent computers that communicate over a network to deliver a service. Machines can fail separately, messages take time, and one component can be healthy while another is unreachable.

The central challenge is partial failure: a timed-out request might have failed before execution, or it might have succeeded and lost its response. Design around uncertainty rather than assuming the network behaves like a local function call.

## 2. A practical architecture

```text
Browser / iPad / Desktop companion
                |
          HTTPS ingress
                |
      Java API replica A / B
           |             |
     PostgreSQL      Durable job queue
       + pgvector         |
           |         Ingestion worker
      Object storage      |
                      LLM / embedding provider
```

This is a proposed scalable PIOS architecture, not a claim that all components are deployed. A modular Java application can serve the initial product; multiple network services are not a requirement for good design.

## 3. Failures to plan for

- Process crash: an API or worker exits midway through a task.
- Network delay or partition: components cannot exchange messages reliably.
- Duplicate delivery: a retried request or queue message arrives again.
- Reordering: an earlier edit arrives after a later edit.
- Dependency failure: a model provider returns an error or stops responding.
- Resource exhaustion: unbounded uploads, retries or concurrent jobs fill memory or storage.

For each operation, ask what happens before commit, after commit but before acknowledgment, and during recovery.

## 4. Latency, throughput and availability

Latency measures the time for one operation; throughput measures operations completed per unit time. Report tail latency, such as p95 and p99, alongside averages. A slow model call can dominate the user experience even if database queries are fast.

Define success from the user's perspective: a note counts as saved when durable storage acknowledges it, not when an optimistic UI changes. A health endpoint alone does not prove that uploads, retrieval or model calls work.

## 5. Consistency models

- Linearizability: operations on an object appear to take effect at a point between invocation and completion, respecting real-time ordering.
- Eventual consistency: replicas converge if updates stop and the necessary communication and conflict-resolution assumptions hold.
- Read-your-writes: a user can observe their acknowledged updates in later reads within the promised scope.
- Causal consistency: causally related operations are observed in a compatible order; unrelated operations may be observed differently.

Consistency is a specific guarantee. Database transaction isolation and distributed consistency are related concerns, but they are not interchangeable terms.

## 6. CAP without the misleading shortcut

During a network partition, a read/write service cannot guarantee both linearizable consistency and availability as defined by the CAP model. A partitioned replica cannot always know whether another replica accepted a newer write.

For example, if two regions cannot communicate, accepting writes independently may require reconciliation later. Requiring coordination may leave some requests waiting or rejected. The tradeoff is about guarantees during partitions, not a permanent instruction to choose any two features. CAP availability is also different from an operational uptime percentage. [Gilbert and Lynch](https://www.cs.princeton.edu/courses/archive/spr22/cos418/papers/cap.pdf)

## 7. Replication and partitioning

Replication keeps copies of data for resilience or read scaling. Synchronous acknowledgment can increase coordination latency; asynchronous replication can leave lagging replicas behind. Failover must consider which writes were acknowledged and where they are durable.

Partitioning splits data across owners, such as by account ID. Poor key choices can create hot partitions. Replication and partitioning solve different problems and are often combined.

Dynamo illustrates an availability-oriented design using versioned objects, consistent hashing, replication and reconciliation. Its configurable read/write quorums describe a particular design; overlapping quorums alone do not establish linearizability for every system. Dynamo and today's DynamoDB should not be treated as the same implementation. [Original Dynamo paper](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf)

## 8. Consensus and Raft

Consensus lets participants agree on decisions under a stated failure model. Raft organises this around a replicated log, leader election and safety rules. In a fixed cluster of five voting nodes, a majority is three, so the cluster can continue making progress with two crashed nodes if the remaining majority can communicate and timing assumptions permit progress.

Raft is not a general defence against malicious nodes. Safety and liveness are separate: preserving a correct history does not mean a system can always accept new writes. [Ongaro and Ousterhout](https://raft.github.io/raft.pdf)

## 9. Timeouts, retries and idempotency

Bound connection time, request duration and retry attempts. Retry transient failures with backoff and jitter, within an overall deadline. Retrying a non-idempotent operation blindly can duplicate its effects.

An idempotency key identifies one intended operation. Scope it to the account and operation type, bind it to a request fingerprint, and store the result durably with the state change. A repeated key with different input should be rejected. A cache-only or per-process map is insufficient after a restart or across replicas. [Idempotent Receiver](https://martinfowler.com/articles/patterns-of-distributed-systems/idempotent-receiver.html)

```text
Request(key=K) -> commit result -> response lost
Retry(key=K)   -> return recorded result, without repeating the effect
```

## 10. Messaging and the transactional outbox

A database commit followed by a separate publish can fail between the two operations. Store the business change and an outbox record in one database transaction, then let a relay publish the event. The relay may publish more than once, so consumers still need deduplication. The outbox solves a specific atomicity gap; it does not make arbitrary external side effects exactly once. [Transactional Outbox](https://microservices.io/patterns/data/transactional-outbox.html)

```text
One DB transaction: update note + insert outbox event
Relay:              publish event -> mark delivered
Worker:             deduplicate -> index note -> acknowledge
```

## 11. Concurrent note edits

Serialising saves in one browser reduces local request reordering. It does not prevent two devices from overwriting each other's edits.

Use a revision number or ETag and conditional updates. If the stored revision differs from the client's expected revision, return a conflict and offer merge/recovery. Rich collaborative editing may need an operational transformation or CRDT design, including document structure, offline behaviour and access controls. Adding a library alone does not settle those decisions.

## 12. Distributed RAG ingestion

```text
Capture -> validate -> extract -> chunk -> embed -> index -> retrieve -> answer
```

Persist job state so processing survives worker restarts. Track the document revision, chunking version, embedding model and vector dimensions. Replacing a source should invalidate or replace its old chunks. Apply account or organisation authorisation before selecting passages, and preserve that scope in citations and source access.

Use bounded queues, concurrency limits and provider budgets. A generated answer needs evidence evaluation; successful retrieval or a confident model response does not prove correctness. This section describes engineering requirements for PIOS's planned pipeline.

## 13. Kubernetes and operational boundaries

Containers package software. Kubernetes schedules and manages workloads; it does not automatically provide application correctness, backups or secure tenancy.

Before running several Java replicas, make sessions accessible consistently across replicas and move persistent uploads out of container-local filesystems. Distinguish startup, readiness and liveness checks. Configure resource requests/limits, graceful shutdown, TLS, secrets and a rollback procedure. Verify these properties in the deployed environment rather than only inspecting YAML.

## 14. Failure tests worth writing

- Commit a note, lose the response, then retry: verify the intended effect occurs once.
- Delay edit A until edit B completes: verify stale content cannot silently replace newer work.
- Kill a worker after processing but before acknowledgment: verify safe redelivery.
- Restart an API and route requests to another replica: verify session behaviour.
- Disconnect the model provider: verify deadlines, useful errors and bounded retries.
- Request another account's notes, drafts and citations: verify access is denied.
- Restore the database, files and encryption keys into an isolated environment: verify usable recovery.

These are recommended scenarios, not assertions that PIOS already passes all of them.

## 15. Revision questions

1. Why does a timeout leave the outcome of a write uncertain?
2. How does replication differ from partitioning?
3. What precisely does CAP say during a partition?
4. Why can a healthy minority of Raft nodes fail to accept new writes?
5. Why must an idempotency result survive process restarts?
6. What failure window does an outbox close, and what problem remains?
7. Why does a per-browser save queue not solve cross-device conflicts?
8. Which metadata is required when changing embedding models?
9. Why should readiness depend on a different question from liveness?
10. What evidence would demonstrate that a backup actually works?

## Practice project

Extend PIOS with revision-aware note updates and a durable indexing job. Demonstrate a delayed save, a restarted worker and a repeated event. Record what happens and explain the limits of each guarantee before describing the feature on a resume.
