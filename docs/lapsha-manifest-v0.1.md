# Lapsha — Manifest v0.1

> TypeScript backend framework for writing reliable business operations with minimal code.

Workflow semantics are locked in [semantics.md](./semantics.md). If an example below disagrees with those rules, the rules win.

## 1. Core idea

Lapsha lets you write a complex backend as ordinary TypeScript.

The developer thinks first about business operations:

```ts
createOrder();
chargePayment();
sendEmail();
reserveProduct();
```

rather than about infrastructure details:

```text
DependencyInjectionContainer
TransactionManager
RetryPolicy
WebhookDispatcher
SagaCoordinator
```

Complexity belongs inside the framework, not in application code.

---

## 2. Main philosophy

### Less ceremony

When ordinary TypeScript can express the task:

```ts
export async function checkout(ctx) {
    // ...
}
```

the developer should not have to write:

```ts
@Controller()
@Injectable()
@Module()
@UseGuards()
@UseInterceptors()
```

Decorators are allowed. They are not a required part of the architecture.

### Ordinary TypeScript is the main API

Lapsha must not force the user to learn a custom DSL.

Prefer:

```ts
await workflow('checkout', async () => {
    const order = await orders.create(...);
    const payment = await payments.charge(...);

    await order.paid(payment);
});
```

over a long builder-API chain, when ordinary TypeScript can express the same thing.

---

# 3. Principles

## 3.1. Framework complexity ≠ application complexity

Lapsha may contain complicated infrastructure:

- dependency injection;
- transactions;
- retries;
- queues;
- workers;
- observability;
- idempotency;
- recovery;
- webhooks;
- workflow engine.

Application code stays simple.

---

## 3.2. Context

Request-scoped values, and values tied to the current operation, are available through `ctx`:

```ts
ctx.request;
ctx.response;
ctx.user;
ctx.db;
ctx.payments;
ctx.logger;
```

Context is the main way to pass the operation's environment.

Global singleton imports are not the required style.

---

## 3.3. Resources

External systems are represented as resources:

```text
db
redis
payments
storage
mail
queue
```

For example:

```ts
const payment = await ctx.payments.charge({
    amount: 4990,
    currency: 'eur',
});
```

A resource is not merely a convenient wrapper over an SDK. The framework must understand that an external resource has its own failure modes.

---

## 3.4. Reliability first

When Lapsha does something automatically, the behavior must be predictable.

For example:

```ts
await payments.charge(...);
```

may include:

- timeout;
- retry;
- idempotency;
- structured errors;
- logging;
- tracing.

The developer must be able to tell which behavior will happen.

There is no place for:

> "it somehow retried the request three times by itself."

---

# 4. Workflow is the central concept

Lapsha is not only an HTTP framework. It is a framework for running business operations reliably.

A workflow is an operation that must survive failures correctly.

For example:

```ts
await workflow('checkout', async () => {
    const order = await orders.create(...);

    const payment = await payments.charge(...);

    await orders.markPaid(order, payment);
});
```

The framework may be responsible for:

```text
state
retries
idempotency
recovery
timeouts
external effects
compensation
```

Statement:

> A workflow describes the business operation, and Lapsha takes care of its lifecycle.

---

# 5. Why Stripe is an important design constraint

Stripe is a good example of the problem Lapsha must solve.

This is not one ACID transaction:

```text
PostgreSQL transaction
        +
Stripe API
        ≠
one ACID transaction
```

For example:

```text
BEGIN DB transaction
        ↓
Stripe charge
        ↓
DB error
        ↓
ROLLBACK
```

Stripe has already taken the money.

Lapsha must not pretend that:

```ts
db.transaction(async () => {
    await stripe.charge();
});
```

magically makes Stripe part of the transaction.

A workflow is used instead.

---

# 6. Idempotency

Idempotency is fundamental for:

- payments;
- webhooks;
- jobs;
- external APIs;
- running workflows again.

For example:

```ts
await payments.charge({
    idempotencyKey: `order:${order.id}`,
    amount: 4990,
});
```

Idea:

> Running an operation again must not accidentally perform a dangerous external side effect twice.

Where it fits, Lapsha should be able to generate or manage idempotency automatically.

---

# 7. Webhooks are a first-class citizen

A webhook should not be just an ordinary HTTP endpoint that the developer parses by hand.

Desired API:

```ts
payments.webhook(async event => {
    if (event.type === 'payment.succeeded') {
        // ...
    }
});
```

The framework should be able to take on:

```text
signature verification
deduplication
event persistence
retry
acknowledgement
logging
```

A webhook is part of the lifecycle of an external resource or workflow.

---

# 8. Errors

Errors should be structured.

Prefer this:

```ts
throw new PaymentError({
    code: 'card_declined',
    retryable: false,
});
```

to:

```ts
throw new Error('Something went wrong');
```

The framework should understand categories such as:

```text
retryable
user-facing
internal
external
expected
unexpected
```

The HTTP/API layer may turn these errors into the right response.

---

# 9. Observability

Observability should be built into the framework.

The developer writes:

```ts
await payments.charge(...);
```

and in production can see:

```text
checkout
 ├── db.orders.create       12ms
 ├── stripe.charge         284ms
 ├── db.orders.update        8ms
 └── total                  311ms
```

Built-in capabilities should include at least:

- request ID;
- structured logs;
- tracing;
- error context;
- operation timing.

Observability should not become a separate project after the release.

---

# 10. Vendor lock-in

Business code should not depend directly on a specific provider.

Prefer:

```ts
await ctx.payments.charge(...);
```

to:

```ts
await stripe.paymentIntents.create(...);
```

For example:

```text
Stripe → Adyen
```

should not require rewriting the main business logic.

Stripe is an implementation.

`payments` is the abstraction.

---

# 11. Abstraction must not erase provider capabilities

The interface must not be so universal that a provider's powerful API becomes a useless minimum.

For example:

```ts
await ctx.payments.charge(...);
```

should cover most ordinary cases.

Provider-specific capabilities remain available:

```ts
await ctx.payments.stripe.paymentIntent(...);
```

Principle:

> 80% of cases use the simple abstraction. 20% can reach the power features.

---

# 12. Do not shape the API around the internal architecture

If Lapsha later needs:

```text
DI container
plugin registry
metadata graph
event bus
workflow engine
```

the user does not have to see those APIs.

Design the user API first:

```ts
await orders.create();
await payments.charge();
await workflow(...);
```

and choose the internal implementation after that.

---

# 13. Target architecture

```text
                    LAPSHA
                       │
        ┌──────────────┼──────────────┐
        │              │              │
       HTTP          WORKFLOWS      RESOURCES
        │              │              │
      routes       reliability     DB / Stripe
        │              │           Redis / Mail
        │         ┌────┼────┐       Queue...
        │         │    │    │
        │       retry state recovery
        │
        └──────────────┐
                       │
                   CONTEXT
                       │
                 Application code
                       │
              "ordinary TypeScript"
```

Three key concepts:

1. **Context** — the environment of the current operation.
2. **Resources** — interaction with the outside world.
3. **Workflow** — reliable execution of a business operation.

---

# 14. What Lapsha must not become

Lapsha must not become:

- another Express;
- "NestJS, only simpler";
- a set of decorators and modules for the sake of an enterprise architecture;
- only an HTTP framework;
- an ORM with a few middleware;
- a thin wrapper over the Stripe SDK;
- a DSL that forces you to write something other than TypeScript.

The difference is the model, not the number of features:

> **Lapsha is optimized around reliable business operations.**

---

# 15. Positioning

Working formulation:

> **Lapsha — TypeScript backend framework for writing reliable business operations with minimal code.**

More conceptual:

> **You write the business logic. Lapsha handles what happens when things do not go according to plan.**

---

# 16. What we are not locking yet

At this stage we do not decide:

- ORM;
- DI container;
- decorators;
- filesystem routing;
- CLI;
- config system;
- monorepo structure;
- the exact npm package structure;
- deployment model.

That is the second level.

First we need to test and implement the fundamental ideas:

```text
Context
Resources
Workflow
Reliability
Idempotency
Recovery
```

---

# 17. Main success criterion

We are moving in the right direction when an ordinary developer can write:

```ts
export async function checkout(ctx) {
    const order = await ctx.db.orders.create({
        userId: ctx.user.id,
        amount: 4990,
    });

    const payment = await ctx.payments.charge({
        amount: order.amount,
        customer: ctx.user.email,
    });

    await order.paid(payment);

    return order;
}
```

and Lapsha correctly handles:

```text
Stripe timeout
Stripe retry
duplicate request
duplicate webhook
DB failure
process crash
lost HTTP response
partial external side effect
recovery
observability
```

---

# 18. Lapsha v0.1 — summary

Fundamental formula:

```text
Simple TypeScript
       +
Context
       +
Resources
       +
Workflows
       +
Reliability
       =
Lapsha
```

Core idea:

> **Do not reduce what a backend framework can do. Reduce the amount of infrastructure code the developer has to write.**
