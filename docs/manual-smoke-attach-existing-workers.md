# Manual Smoke: Attach to Existing Workers (CLI-free)

Prereqs: a configured Core+ DHE server in extension settings; the ability to
create a worker from a second source (a second VS Code window, the web Query
Monitor, or `dh worker create -p <profile>`).

1. Ensure you have NO running InteractiveConsole workers you own.
2. Click the DHE server in the Deephaven server tree.
   -> Login prompt (if needed), then exactly ONE worker is created and
      appears as a connected session. (attachable.length === 0 → create path.)
3. From a second source, create another IC worker as the SAME user.
   -> Within a couple seconds the new worker auto-attaches under the server
      as a second connection. No click required.
4. In an editor connected to the auto-attached worker, run:
      from deephaven import empty_table; t = empty_table(5)
   -> "t" appears in the variables panel.
5. From the second source, run a script on that worker creating a table.
   -> The new variable appears in VS Code's panel (subscribeToFieldUpdates).
6. Disconnect the auto-attached worker's connection from the tree.
   -> The connection drops. Verify the worker is STILL ALIVE in the web
      Query Monitor (the extension did NOT delete a worker it didn't create).
7. Delete that worker from the second source.
   -> Within a couple seconds the connection disappears from the VS Code tree.
8. Disconnect the DHE server.
   -> All worker connections drop. The worker the extension auto-created in
      step 2 is deleted (owned); any still-running externally-created workers
      survive.
