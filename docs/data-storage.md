# Deephaven VS Code Extension - Data Storage

This document explains what data the Deephaven VS Code extension stores locally on your machine, where it is stored, and how you can manage or remove it. All data listed below is persisted beyond the current VS Code session and will remain until you manually remove it.

| Data Type                        | Storage Location               | Persistence           | User Control               | Details                                                                                 |
|----------------------------------|-------------------------------|-----------------------|----------------------------|-----------------------------------------------------------------------------------------|
| Community server PSKs            | VS Code secret storage        | Persisted until removed | Can be cleared via command | PSKs are stored in VS Code secret storage on successful login.                          |
| Enterprise private/public keys   | VS Code secret storage / Deephaven servers | Persisted until removed | Private keys can be cleared via command | Private keys are stored locally and encrypted. Public keys are uploaded to the server.   |
| User script files                | Local file system / git repos | User-controlled       | Manual                     | Standard VS Code behavior; not specific to this extension.                              |
| VS Code logs                     | Local file system (VS Code log directory) | Persisted until manually deleted | Manual            | Logs related to the extension are stored by VS Code in a shared log directory. Log file management is handled by VS Code; see the [VS Code documentation](https://code.visualstudio.com/docs/supporting/faq#_how-do-i-find-the-log-files) for details. |
| Downloaded Deephaven logs        | Local file system (user-specified location) | Persisted until manually deleted | Manual            | When you download logs using the extension, they are saved to a location you choose. You are responsible for managing or deleting these files. |

**Clearing VS Code Secret Storage:**  
Use the VS Code command palette and run `Deephaven: Clear Secrets` to remove all items stored in VS Code secret storage by the extension (such as PSKs and private keys). This does not affect logs or user script files, which must be managed manually.
