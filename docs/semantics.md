# Workflow semantics

Locked. The v0.1 manifest remains a product draft. If an example in the manifest disagrees with these rules, the rules win. Terms are defined in [terminology.md](./terminology.md). That glossary adds no rules beyond these.

## Rules

1. `await ctx.<resource>.<command>()` inside `workflow` is one durable step. The callback receives only resources. `ctx.db` is not passed in.
2. A database command commits its SQL and the step result in one transaction. An external command makes two commits: first `started` and the key, then, after the response, `completed` and the result. The call sits between them.
3. `ctx.db` outside `workflow` is an ordinary Postgres transaction. There is no journal. Postgres rolls back anything that was not committed.
4. On recovery the function is called from the beginning. A completed step returns its stored result immediately. A step in the `started` state is repeated with the same key and the same arguments. Code between `await`s runs again and may depend only on the workflow arguments and on those results.
5. A workflow has an id. Entering again with the same id continues the same journal. The id and the arguments are written before the first step.

`refund`, and any other business decision after a failure, is the next `await` in application code. Lapsha advances execution to the last confirmed step and does not decide whether to return the money.

## Consequences

The body of a database command receives `db` and does not call other resources. Otherwise one method would contain a second step, or an external call in the middle of a transaction.

The body of an external command performs the request and returns the result. Lapsha keeps the journal around that call.

`Promise.all` of two commands is not part of the model: the journal has one current step.

Reordering `await`s in a workflow that has already started is not decided yet.

## Code shape

```ts
await workflow("checkout", async (ctx) => {
  const order = await ctx.orders.create({ userId: ctx.user.id, amount: 4990 });
  const payment = await ctx.payments.charge({
    amount: order.amount,
    idempotencyKey: order.id,
  });
  await ctx.orders.markPaid(order, payment);
  return order;
});
```

```ts
app.get("/orders/:id", async (ctx) => {
  return ctx.db.orders.findById(ctx.params.id);
});
```
