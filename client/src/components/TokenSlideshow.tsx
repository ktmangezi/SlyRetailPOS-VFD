import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface SlideData {
  id: number;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
}

const slides: SlideData[] = [
  {
    id: 1,
    title: "Click the Integration Icon",
    description: "Click the Integration Icon (puzzle piece) in the sidebar",
    image: "/attached_assets/image_1751310772650.png",
    imageAlt: "Integration Icon in Loyverse sidebar"
  },
  {
    id: 2,
    title: "Select Access Tokens",
    description: "Select Access tokens from the menu",
    image: "/attached_assets/image_1751310833334.png",
    imageAlt: "Access tokens menu option"
  },
  {
    id: 3,
    title: "Add Access Token",
    description: "Click + ADD ACCESS TOKEN",
    image: "/attached_assets/image_1751310873292.png",
    imageAlt: "Add access token button"
  },
  {
    id: 4,
    title: "Configure Token",
    description: "Give your token a name and turn OFF expiration",
    image: "/attached_assets/image_1751310887266.png",
    imageAlt: "Create token form with expiration toggle"
  },
  {
    id: 5,
    title: "Copy Your Token",
    description: "Save and copy your token from the details page",
    image: "/attached_assets/image_1751310945844.png",
    imageAlt: "Token details page with copy option"
  }
];

export function TokenSlideshow() {
  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  };

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
  };

  const current = slides[currentSlide];

  return (
    <div className="bg-white rounded-lg border border-orange-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-teal-600 text-white p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Get Loyverse API Token</h3>
          <span className="text-sm bg-white/20 px-2 py-1 rounded">
            {currentSlide + 1} of {slides.length}
          </span>
        </div>
      </div>

      {/* Slide Content */}
      <div className="p-6">
        <div className="text-center mb-4">
          <h4 className="text-lg font-semibold text-gray-800 mb-2">
            Step {current.id}: {current.title}
          </h4>
          <p className="text-gray-600 text-sm">{current.description}</p>
        </div>

        {/* Image */}
        <div className="flex justify-center mb-6">
          <div className="relative">
            <img
              src={current.image}
              alt={current.imageAlt}
              className="max-h-80 w-auto border border-gray-200 rounded-lg shadow-md"
            />
            {/* Step number overlay */}
            <div className="absolute -top-3 -left-3 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold shadow-lg">
              {current.id}
            </div>
          </div>
        </div>

        {/* Navigation Controls */}
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="outline"
            size="sm"
            onClick={prevSlide}
            disabled={currentSlide === 0}
            className="flex items-center gap-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={nextSlide}
            disabled={currentSlide === slides.length - 1}
            className="flex items-center gap-2"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Slide Indicators */}
        <div className="flex justify-center gap-2">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`w-3 h-3 rounded-full transition-colors ${
                index === currentSlide
                  ? "bg-blue-600"
                  : "bg-gray-300 hover:bg-gray-400"
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Important Note */}
      {currentSlide === 3 && (
        <div className="mx-6 mb-6 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-xs text-yellow-800 font-medium flex items-center gap-2">
            <span className="text-yellow-600">⚠️</span>
            Important: Make sure to turn off the expiration toggle so your token never expires!
          </p>
        </div>
      )}
    </div>
  );
}