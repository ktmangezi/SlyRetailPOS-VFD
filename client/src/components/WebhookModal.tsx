import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { setWebhookConfig, getWebhookConfig } from "@/lib/store";
import { Webhook } from "lucide-react";

export function WebhookModal() {
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const { toast } = useToast();
  const currentConfig = getWebhookConfig();

  const handleSave = () => {
    if (!appId || !appSecret) {
      toast({
        title: "Error",
        description: "Please enter both App ID and App Secret",
        variant: "destructive",
      });
      return;
    }

    setWebhookConfig(appId, appSecret);
    toast({
      title: "Success",
      description: "Webhook credentials saved successfully",
    });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-blue-200">
          <Webhook className="w-4 h-4 mr-2" />
          {currentConfig ? "Update Webhook" : "Configure Webhook"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configure Webhook</DialogTitle>
          <DialogDescription>
            Enter your Loyverse webhook credentials to enable automatic updates.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">App ID</label>
            <Input
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="Enter App ID"
            />
          </div>
          <div>
            <label className="text-sm font-medium">App Secret</label>
            <Input
              type="password"
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              placeholder="Enter App Secret"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave}>Save Configuration</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
