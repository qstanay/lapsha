# Terminology

Definitions of the words in [semantics.md](./semantics.md). This file adds no rules. If a definition disagrees with the five semantic rules, the rules win.

## workflow

A workflow is a run of an application function under a stable id. The callback receives resources and does not receive `ctx.db`. The id and the arguments are written before the first step. Entering again with the same id, the same name, and the same arguments continues the same journal. A different name or different arguments are rejected.

## step

A step is one `await` of a resource command inside a workflow. It is the boundary Lapsha recovers.

A completed step returns its stored result and does not run again. A step in the `started` state is repeated with the same key and the same arguments. The journal has one current step.

A database command commits its SQL and the step result in one transaction. An external command commits `started` and the key before the call, and `completed` and the result after the response.

## resource

A resource is an object on `ctx` inside a workflow whose methods are commands. The workflow callback has access only to resources.

`ctx.db` is not a resource. Outside a workflow it is an ordinary Postgres transaction with no journal.

## command

A command is a method of a resource. One `await` of a command is one step.

A database command receives `db` and does not call other resources. An external command performs a request and returns the result. Lapsha keeps the journal around the external call.

## journal

A journal is the record of one workflow: its id, its arguments, and its steps. `ctx.db` outside a workflow has no journal. Postgres rolls back a transaction that was not committed.

## recovery

Recovery is calling the workflow function again from the beginning. Lapsha does not restore the JavaScript stack.

Completed steps return their stored results. Code between `await`s runs again and may depend only on the workflow arguments and on those results. Lapsha advances execution to the last confirmed step and does not make the business decision for the application.
