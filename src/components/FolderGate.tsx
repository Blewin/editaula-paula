import * as React from "react";
import { FolderOpen, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  pickFolder,
  reconnectFolder,
  useRootName,
  useRootStatus,
} from "@/lib/storage";

export function FolderGate({ children }: { children: React.ReactNode }) {
  const status = useRootStatus();
  const rootName = useRootName();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Editaula</h1>
          <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  if (status === "ready") return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md text-center">
        {status === "unknown" || status === "loading" ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Editaula</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              {status === "loading" ? "Reading your folder…" : "Loading…"}
            </p>
          </>
        ) : status === "no-support" ? (
          <>
            <AlertTriangle className="mx-auto size-8 text-muted-foreground" />
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">Unsupported browser</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Editaula uses the File System Access API to read and write your
              Markdown files directly on disk. This works in Chrome, Edge, Brave,
              Arc and other Chromium-based browsers on desktop.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Please open this page in one of those browsers to continue.
            </p>
          </>
        ) : status === "needs-permission" ? (
          <>
            <FolderOpen className="mx-auto size-8 text-muted-foreground" />
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">Reconnect to your folder</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              For security, your browser needs your permission again to reopen{" "}
              <span className="font-medium text-foreground">{rootName}</span>.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <Button onClick={() => void reconnectFolder()} size="lg">
                Reconnect “{rootName}”
              </Button>
              <Button onClick={() => void pickFolder()} variant="ghost" size="sm">
                Choose a different folder
              </Button>
            </div>
          </>
        ) : status === "error" ? (
          <>
            <AlertTriangle className="mx-auto size-8 text-destructive" />
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">Couldn’t read that folder</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Something went wrong while opening your folder. Try picking it again.
            </p>
            <div className="mt-6">
              <Button onClick={() => void pickFolder()} size="lg">
                Choose a folder
              </Button>
            </div>
          </>
        ) : (
          // no-folder
          <>
            <FolderOpen className="mx-auto size-10 text-muted-foreground" />
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">Welcome to Editaula</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Pick a folder on your computer. Editaula will read and write your
              documents there as plain Markdown files — nothing leaves your
              machine.
            </p>
            <div className="mt-6">
              <Button onClick={() => void pickFolder()} size="lg">
                <FolderOpen className="size-4" />
                Choose folder
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Subfolders become folders in the app. Each document is saved as{" "}
              <code className="rounded bg-muted px-1 py-0.5">name.md</code>.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
