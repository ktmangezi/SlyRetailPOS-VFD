import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Clock } from "lucide-react";

interface CutoffTimeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (token: string) => void;
}

export function CutoffTimeModal({ isOpen, onClose }: CutoffTimeModalProps) {
  const [token, setToken] = React.useState("");

  return (
    <Dialog
      open={isOpen}
      onOpenChange={() => {
        onClose();
        setToken("");
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="space-y-3">
          <div className="mx-auto bg-muted p-3 rounded-full w-12 h-12 flex items-center justify-center">
            <Clock className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">Session Expired</DialogTitle>
          <DialogDescription className="text-center">
            Please re-authenticate to continue.
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
}
