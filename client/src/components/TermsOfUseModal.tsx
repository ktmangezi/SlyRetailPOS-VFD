import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { X, FileText } from "lucide-react";

interface TermsOfUseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TermsOfUseModal({ isOpen, onClose }: TermsOfUseModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[80vh] overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-blue-600 to-teal-600 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              <h2 className="text-lg font-semibold">Terms of Use</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-white hover:bg-white/20 h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="p-6 overflow-y-auto max-h-[60vh]">
          <div className="space-y-4 text-sm text-gray-700">
            <div>
              <h3 className="font-semibold text-blue-800 mb-2">SlyRetail Virtual Fiscal Device Terms of Use</h3>
              <p className="text-xs text-gray-600 mb-4">
                By using SlyRetail VFD services, you agree to the following terms and conditions:
              </p>
            </div>

            <div className="space-y-3">
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                <h4 className="font-medium text-yellow-800 mb-1">1. Liability Disclaimer</h4>
                <p className="text-xs text-yellow-700">
                  We are not liable for any losses that could happen due to data crashes, system failures, or technical issues. Users are responsible for maintaining their own data backups and ensuring system reliability.
                </p>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded">
                <h4 className="font-medium text-blue-800 mb-1">2. Pricing and Terms Updates</h4>
                <p className="text-xs text-blue-700">
                  We will be updating our pricing and terms of use regularly. Clients will be notified of any changes with reasonable advance notice. Continued use of the service constitutes acceptance of updated terms.
                </p>
              </div>

              <div className="p-3 bg-green-50 border border-green-200 rounded">
                <h4 className="font-medium text-green-800 mb-1">3. New Client Agreement</h4>
                <p className="text-xs text-green-700">
                  All new clients must agree to these terms before accessing SlyRetail VFD services. By connecting your Loyverse system to SlyRetail, you acknowledge that you have read and accepted these terms.
                </p>
              </div>

              <div className="p-3 bg-gray-50 border border-gray-200 rounded">
                <h4 className="font-medium text-gray-800 mb-1">4. Service Description</h4>
                <p className="text-xs text-gray-700">
                  SlyRetail VFD provides fiscal device virtualization services for ZIMRA compliance in Zimbabwe. We act as an intermediator between Loyverse POS systems and ZIMRA fiscal requirements.
                </p>
              </div>

              <div className="p-3 bg-purple-50 border border-purple-200 rounded">
                <h4 className="font-medium text-purple-800 mb-1">5. Support and Connectivity</h4>
                <p className="text-xs text-purple-700">
                  Our technical connectors will assist with final setup after initial connection. Support is provided during business hours. System integration requires proper store description formatting as specified in our guidelines.
                </p>
              </div>

              <div className="p-3 bg-red-50 border border-red-200 rounded">
                <h4 className="font-medium text-red-800 mb-1">6. Compliance and Usage</h4>
                <p className="text-xs text-red-700">
                  Users are responsible for ensuring their business information is accurate and up-to-date. SlyRetail VFD is designed for VAT-registered businesses in Zimbabwe using Loyverse POS systems.
                </p>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-600 text-center">
                For questions about these terms, contact us at: icebergitsolutions@gmail.com
              </p>
              <p className="text-xs text-gray-500 text-center mt-1">
                Last updated: June 30, 2025
              </p>
            </div>
          </div>
        </CardContent>
        
        <div className="p-4 bg-gray-50 border-t">
          <Button
            onClick={onClose}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            I Understand and Accept
          </Button>
        </div>
      </Card>
    </div>
  );
}