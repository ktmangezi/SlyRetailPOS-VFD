import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Phone, Mail, FileText, X } from "lucide-react";
import { TermsOfUseModal } from "./TermsOfUseModal";

export function ContactFooter() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  return (
    <>
      <TermsOfUseModal isOpen={showTerms} onClose={() => setShowTerms(false)} />
      <div className="fixed bottom-4 right-4 z-50">
      {isExpanded ? (
        <Card className="w-80 shadow-lg border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-blue-800">Contact & Support</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(false)}
                className="h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-800 font-medium mb-2">
                  Need help completing your integration?
                </p>
                <p className="text-xs text-blue-700">
                  Our connectors will assist with final setup. Contact us:
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-green-600" />
                  <a 
                    href="tel:+263778287836" 
                    className="text-gray-700 hover:text-blue-600"
                  >
                    +263 778 287 836
                  </a>
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-blue-600" />
                  <a 
                    href="mailto:ktmangezi07@gmail.com" 
                    className="text-gray-700 hover:text-blue-600 text-xs"
                  >
                    ktmangezi07@gmail.com
                  </a>
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-blue-600" />
                  <a 
                    href="mailto:icebergitsolutions@gmail.com" 
                    className="text-gray-700 hover:text-blue-600 text-xs"
                  >
                    icebergitsolutions@gmail.com
                  </a>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-200">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowTerms(true)}
                  className="w-full text-xs text-gray-600 hover:text-blue-600"
                >
                  <FileText className="h-3 w-3 mr-1" />
                  Terms of Use
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button
          onClick={() => setIsExpanded(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg rounded-full h-12 w-12 p-0"
          title="Contact Us"
        >
          <Phone className="h-5 w-5" />
        </Button>
      )}
      </div>
    </>
  );
}