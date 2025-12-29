import { useState, useEffect } from "react";
import { Save, Eye, EyeOff } from "lucide-react";
import { useRow, useSetRowCallback } from "tinybase/ui-react";
import { Button } from "@/components/ui/button";

export function Settings() {
  const [showApiKey, setShowApiKey] = useState(false);

  const settings = useRow("settings", "tailscale");
  const tailnetId = (settings?.tailnetId as string) || "";
  const apiKey = (settings?.apiKey as string) || "";

  const [localTailnetId, setLocalTailnetId] = useState(tailnetId);
  const [localApiKey, setLocalApiKey] = useState(apiKey);

  useEffect(() => {
    setLocalTailnetId(tailnetId);
    setLocalApiKey(apiKey);
  }, [tailnetId, apiKey]);

  const handleSave = useSetRowCallback(
    "settings",
    "tailscale",
    () => ({
      key: "tailscale",
      tailnetId: localTailnetId,
      apiKey: localApiKey,
    }),
    [localTailnetId, localApiKey]
  );

  const hasChanges = localTailnetId !== tailnetId || localApiKey !== apiKey;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
      className="space-y-6 max-w-lg"
    >
      <div>
        <h3 className="text-lg font-medium mb-4">Tailscale Settings</h3>
        <div className="space-y-4">
          <div>
            <label htmlFor="tailnetId" className="block text-sm font-medium mb-1.5">
              Tailnet ID
            </label>
            <input
              id="tailnetId"
              type="text"
              value={localTailnetId}
              onChange={(e) => setLocalTailnetId(e.target.value)}
              placeholder="your-tailnet-id"
              className="w-full px-3 py-2 border rounded-md bg-background text-foreground font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Find this in Admin Console → Settings → General
            </p>
          </div>
          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium mb-1.5">
              API Key
            </label>
            <div className="relative">
              <input
                id="apiKey"
                type={showApiKey ? "text" : "password"}
                value={localApiKey}
                onChange={(e) => setLocalApiKey(e.target.value)}
                placeholder="tskey-api-..."
                className="w-full px-3 py-2 pr-10 border rounded-md bg-background text-foreground font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Create at Admin Console → Settings → Keys
            </p>
          </div>
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={!hasChanges} className="gap-2">
          <Save className="h-4 w-4" />
          Save Changes
        </Button>
      </div>
    </form>
  );
}
