# Lapsha — Manifest v0.1

> TypeScript backend framework for writing reliable business operations with minimal code.

Семантика workflow зафиксирована в [semantics.md](./semantics.md). При расхождении с примерами ниже верны правила оттуда.

## 1. Основная идея

Lapsha позволяет писать сложный backend как простой TypeScript-код.

Разработчик думает прежде всего о бизнес-операциях:

```ts
createOrder();
chargePayment();
sendEmail();
reserveProduct();
```

а не об инфраструктурных деталях:

```text
DependencyInjectionContainer
TransactionManager
RetryPolicy
WebhookDispatcher
SagaCoordinator
```

Сложность должна находиться внутри framework, а не в application code.

---

## 2. Главная философия

### Меньше ceremony

Если задачу можно решить обычным TypeScript:

```ts
export async function checkout(ctx) {
    // ...
}
```

не нужно заставлять разработчика писать:

```ts
@Controller()
@Injectable()
@Module()
@UseGuards()
@UseInterceptors()
```

Декораторы не запрещены, но не должны быть обязательной частью архитектуры.

### Обычный TypeScript — главный API

Lapsha не должен заставлять пользователя изучать собственный DSL.

Предпочтительно:

```ts
await workflow('checkout', async () => {
    const order = await orders.create(...);
    const payment = await payments.charge(...);

    await order.paid(payment);
});
```

а не сложные цепочки builder API, если обычный TypeScript способен выразить то же самое.

---

# 3. Основные принципы

## 3.1. Framework complexity ≠ application complexity

Внутри Lapsha может быть сложная инфраструктура:

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

Но application code должен оставаться простым.

---

## 3.2. Context

Request-scoped и связанные с текущей операцией вещи доступны через `ctx`:

```ts
ctx.request;
ctx.response;
ctx.user;
ctx.db;
ctx.payments;
ctx.logger;
```

Context — основной способ передавать окружение операции.

Глобальные singleton-импорты не должны быть обязательным стилем.

---

## 3.3. Resources

Внешние системы представлены как resources:

```text
db
redis
payments
storage
mail
queue
```

Например:

```ts
const payment = await ctx.payments.charge({
    amount: 4990,
    currency: 'eur',
});
```

Важно: resource — это не просто удобная обёртка над SDK. Framework должен понимать, что внешний resource имеет собственные failure modes.

---

## 3.4. Reliability first

Если Lapsha что-то делает автоматически, поведение должно быть предсказуемым.

Например:

```ts
await payments.charge(...);
```

может включать:

- timeout;
- retry;
- idempotency;
- structured errors;
- logging;
- tracing.

Но разработчик должен понимать, какое поведение произойдёт.

Никакого:

> «оно почему-то само повторило запрос три раза».

---

# 4. Workflow — центральная концепция

Главная идея Lapsha — не просто HTTP framework, а framework для надёжного выполнения бизнес-операций.

Workflow — это операция, которая должна корректно переживать сбои.

Например:

```ts
await workflow('checkout', async () => {
    const order = await orders.create(...);

    const payment = await payments.charge(...);

    await orders.markPaid(order, payment);
});
```

Framework потенциально отвечает за:

```text
state
retries
idempotency
recovery
timeouts
external effects
compensation
```

Формулировка:

> Workflow описывает бизнес-операцию, а Lapsha заботится о её жизненном цикле.

---

# 5. Почему Stripe — важный design constraint

Stripe — хороший пример проблемы, которую должен решать Lapsha.

Нельзя считать это одной ACID-транзакцией:

```text
PostgreSQL transaction
        +
Stripe API
        ≠
одна ACID transaction
```

Например:

```text
BEGIN DB transaction
        ↓
Stripe charge
        ↓
DB error
        ↓
ROLLBACK
```

Stripe уже списал деньги.

Поэтому Lapsha не должен притворяться, что:

```ts
db.transaction(async () => {
    await stripe.charge();
});
```

магически делает Stripe частью транзакции.

Вместо этого используется workflow.

---

# 6. Idempotency

Idempotency должна быть фундаментальной для:

- payments;
- webhooks;
- jobs;
- external APIs;
- повторного запуска workflows.

Например:

```ts
await payments.charge({
    idempotencyKey: `order:${order.id}`,
    amount: 4990,
});
```

Идея:

> Повторный запуск операции не должен случайно выполнить опасный external side effect дважды.

В подходящих случаях Lapsha должен уметь генерировать или управлять idempotency автоматически.

---

# 7. Webhooks — first-class citizen

Webhook не должен быть просто обычным HTTP endpoint, который разработчик вручную разбирает.

Желаемый API:

```ts
payments.webhook(async event => {
    if (event.type === 'payment.succeeded') {
        // ...
    }
});
```

Framework должен уметь брать на себя:

```text
signature verification
deduplication
event persistence
retry
acknowledgement
logging
```

Webhook должен рассматриваться как часть lifecycle external resource/workflow.

---

# 8. Ошибки

Ошибки должны быть структурированными.

Вместо:

```ts
throw new Error('Something went wrong');
```

предпочтительно:

```ts
throw new PaymentError({
    code: 'card_declined',
    retryable: false,
});
```

Framework должен понимать категории вроде:

```text
retryable
user-facing
internal
external
expected
unexpected
```

HTTP/API слой может автоматически преобразовывать такие ошибки в корректный response.

---

# 9. Observability

Observability должна быть встроена в framework.

Разработчик пишет:

```ts
await payments.charge(...);
```

а в production можно получить:

```text
checkout
 ├── db.orders.create       12ms
 ├── stripe.charge         284ms
 ├── db.orders.update        8ms
 └── total                  311ms
```

Встроенные возможности должны включать как минимум:

- request ID;
- structured logs;
- tracing;
- error context;
- operation timing.

Observability не должна становиться отдельным проектом после релиза.

---

# 10. Vendor lock-in

Бизнес-код не должен зависеть напрямую от конкретного провайдера.

Предпочтительно:

```ts
await ctx.payments.charge(...);
```

а не:

```ts
await stripe.paymentIntents.create(...);
```

Например:

```text
Stripe → Adyen
```

не должен требовать переписывания основной бизнес-логики.

Stripe — implementation.

`payments` — abstraction.

---

# 11. Но abstraction не должна уничтожать возможности provider

Нельзя делать настолько универсальный интерфейс, что он превращает мощные API конкретного провайдера в бесполезный минимум.

Например:

```ts
await ctx.payments.charge(...);
```

должен покрывать большинство обычных случаев.

Но должна оставаться возможность получить provider-specific capabilities:

```ts
await ctx.payments.stripe.paymentIntent(...);
```

Принцип:

> 80% случаев — простой abstraction. 20% — доступ к power features.

---

# 12. Не оптимизировать API под внутреннюю архитектуру

Если внутри Lapsha понадобятся:

```text
DI container
plugin registry
metadata graph
event bus
workflow engine
```

это не означает, что пользователь должен видеть их API.

Сначала проектируется пользовательский API:

```ts
await orders.create();
await payments.charge();
await workflow(...);
```

и только потом выбирается внутренняя реализация.

Не наоборот.

---

# 13. Целевая архитектурная картина

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
              "обычный TypeScript"
```

Три ключевые концепции:

1. **Context** — окружение текущей операции.
2. **Resources** — взаимодействие с внешним миром.
3. **Workflow** — надёжное выполнение бизнес-операции.

---

# 14. Что Lapsha НЕ должен быть

Lapsha не должен быть:

- ещё одним Express;
- «NestJS, только проще»;
- набором decorators/modules ради enterprise-архитектуры;
- исключительно HTTP framework;
- ORM с несколькими middleware;
- тонкой обёрткой над Stripe SDK;
- DSL, который заставляет писать код не на TypeScript.

Главное отличие должно быть не в количестве features, а в модели:

> **Lapsha оптимизирован вокруг надёжных business operations.**

---

# 15. Позиционирование

Рабочая формулировка:

> **Lapsha — TypeScript backend framework for writing reliable business operations with minimal code.**

Более концептуально:

> **Ты пишешь бизнес-логику. Lapsha занимается тем, что происходит, когда всё идёт не по плану.**

---

# 16. Что пока НЕ фиксируем

На этом этапе не принимаем архитектурные решения относительно:

- ORM;
- DI container;
- decorators;
- filesystem routing;
- CLI;
- config system;
- monorepo structure;
- конкретной структуры npm-пакетов;
- deployment model.

Это второй уровень.

Сначала необходимо проверить и реализовать фундаментальные идеи:

```text
Context
Resources
Workflow
Reliability
Idempotency
Recovery
```

---

# 17. Главный критерий успеха

Если обычный разработчик может написать:

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

а Lapsha при этом корректно решает:

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

— значит, мы движемся в правильном направлении.

---

# 18. Lapsha v0.1 — итог

Фундаментальная формула:

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

Главная идея:

> **Не уменьшать возможности backend framework, а уменьшать количество инфраструктурного кода, который разработчику приходится писать самому.**
